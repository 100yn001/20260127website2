/**
 * Stripe subscription plumbing — $3/month "yn monthly" → 10 stories/month.
 *
 * Replaces the old $0 "yn beta" checkout (createStripeCustomer.ts, retired).
 *
 * Webhook design notes (deliberate):
 *  - Events are deduped by event id (stripeEvents/{id} guard doc).
 *  - We NEVER apply event payloads directly: on every relevant event we
 *    re-fetch the subscription from Stripe and upsert entitlements from the
 *    fresh object — makes ordering races and duplicate deliveries harmless.
 *  - Only subscriptions containing the yn_monthly_3 price count. Legacy $0
 *    "yn_beta_free" subscriptions must never entitle anyone.
 *  - Usage resets only on invoice.paid with billing_reason
 *    subscription_create|subscription_cycle AND a changed periodKey (anchored
 *    to Stripe's current_period_end — anniversary billing, not calendar).
 */

import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import Stripe from 'stripe';
import { entitlementsRef, readEntitlements } from './entitlements';

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

export const MONTHLY_PRICE_LOOKUP_KEY = 'yn_monthly_3';
const PRODUCT_NAME = 'yn monthly';
const PRODUCT_DESCRIPTION = 'yn subscription — 10 stories a month plus the public story library';
const PRICE_CENTS = 300;

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = STRIPE_SECRET_KEY.value();
  if (!key) throw new HttpsError('failed-precondition', 'STRIPE_SECRET_KEY is not configured');
  _stripe = new Stripe(key); // stripe-node pins the API version it was built for
  return _stripe;
}

let _cachedPriceId: string | null = null;
async function getOrCreateMonthlyPriceId(stripe: Stripe): Promise<string> {
  if (_cachedPriceId) return _cachedPriceId;
  const list = await stripe.prices.list({ lookup_keys: [MONTHLY_PRICE_LOOKUP_KEY], active: true, limit: 1 });
  if (list.data.length > 0) {
    _cachedPriceId = list.data[0].id;
    return _cachedPriceId;
  }
  const product = await stripe.products.create({ name: PRODUCT_NAME, description: PRODUCT_DESCRIPTION });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: PRICE_CENTS,
    currency: 'usd',
    recurring: { interval: 'month' },
    lookup_key: MONTHLY_PRICE_LOOKUP_KEY,
  });
  _cachedPriceId = price.id;
  return _cachedPriceId;
}

/**
 * Find a Customer by (in order): a known id, firebaseUid metadata search, or
 * create one. The known-id path matters: customers.search is eventually
 * consistent, so right after a customer is created a search can miss it and
 * mint a duplicate — retrieve-by-id never does.
 */
async function findOrCreateCustomer(
  stripe: Stripe,
  uid: string,
  email: string | undefined,
  name?: string,
  knownCustomerId?: string | null,
): Promise<Stripe.Customer> {
  if (knownCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(knownCustomerId);
      if (!existing.deleted) return existing as Stripe.Customer;
    } catch (err) {
      console.warn(`customer ${knownCustomerId} not retrievable, falling back:`, err);
    }
  }
  try {
    const search = await stripe.customers.search({ query: `metadata['firebaseUid']:'${uid}'`, limit: 1 });
    if (search.data.length > 0) return search.data[0];
  } catch (err) {
    console.warn('customer search failed, falling back to create:', err);
  }
  return stripe.customers.create({
    email: email || undefined,
    name: name || undefined,
    metadata: { firebaseUid: uid },
  });
}

function subscriptionHasMonthlyPrice(sub: Stripe.Subscription): boolean {
  return sub.items.data.some((it) => it.price?.lookup_key === MONTHLY_PRICE_LOOKUP_KEY);
}

async function uidForSubscription(stripe: Stripe, sub: Stripe.Subscription): Promise<string | null> {
  if (sub.metadata?.firebaseUid) return sub.metadata.firebaseUid;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;
  return (customer as Stripe.Customer).metadata?.firebaseUid || null;
}

/** Upsert entitlements from a FRESH subscription object. */
async function syncSubscription(
  stripe: Stripe,
  subscriptionId: string,
  opts: { maybeResetUsage?: boolean } = {},
): Promise<void> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  if (!subscriptionHasMonthlyPrice(sub)) {
    console.log(`sub ${sub.id}: not the ${MONTHLY_PRICE_LOOKUP_KEY} price — ignoring (legacy/other)`);
    return;
  }
  const uid = await uidForSubscription(stripe, sub);
  if (!uid) {
    console.warn(`sub ${sub.id}: no firebaseUid metadata — cannot sync`);
    return;
  }

  const periodKey = String(sub.current_period_end);
  const ref = entitlementsRef(uid);
  await admin.firestore().runTransaction(async (tx) => {
    const ent = readEntitlements(await tx.get(ref));
    const isNewPeriod = ent.periodKey !== periodKey;
    tx.set(
      ref,
      {
        subscriptionStatus: sub.status,
        stripeSubscriptionId: sub.id,
        stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || null,
        currentPeriodEnd: admin.firestore.Timestamp.fromMillis(sub.current_period_end * 1000),
        periodKey,
        ...(opts.maybeResetUsage && isNewPeriod ? { storiesUsedThisPeriod: 0 } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
  console.log(`sub ${sub.id}: synced to ${uid} (status=${sub.status})`);
}

// ── Callables ───────────────────────────────────────────────────────────────

export const createSubscriptionCheckout = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'must be signed in');
    const email = request.data?.email || request.auth?.token?.email;
    const successUrl = String(request.data?.successUrl || 'https://yourname.media/app/profile?billing=success');
    const cancelUrl = String(request.data?.cancelUrl || 'https://yourname.media/app/profile?billing=cancel');

    // First line of defense: our own entitlements doc (webhook-maintained,
    // strongly consistent). An entitled user never gets a second checkout.
    const ent = readEntitlements(await entitlementsRef(uid).get());
    if (ent.subscriptionStatus === 'active' || ent.subscriptionStatus === 'trialing') {
      throw new HttpsError('already-exists', 'you already have an active subscription');
    }

    const stripe = getStripe();
    const customer = await findOrCreateCustomer(
      stripe, uid, email, request.data?.name, ent.stripeCustomerId,
    );
    const priceId = await getOrCreateMonthlyPriceId(stripe);

    // Second line: a live sub on the Stripe customer that our doc doesn't know
    // about (missed webhook) — sync it and refuse rather than double-charge.
    const existing = await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 20 });
    const live = existing.data.find(
      (s) => (s.status === 'active' || s.status === 'trialing') && subscriptionHasMonthlyPrice(s),
    );
    if (live) {
      await syncSubscription(stripe, live.id);
      throw new HttpsError('already-exists', 'you already have an active subscription');
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: { metadata: { firebaseUid: uid } },
      metadata: { firebaseUid: uid },
    });
    if (!session.url) throw new HttpsError('internal', 'Stripe Checkout returned no URL');

    await entitlementsRef(uid).set(
      { stripeCustomerId: customer.id, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );

    return { checkoutUrl: session.url, customerId: customer.id };
  },
);

export const createBillingPortal = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'must be signed in');
    const stripe = getStripe();

    const ent = readEntitlements(await entitlementsRef(uid).get());
    let customerId = ent.stripeCustomerId;
    if (!customerId) {
      const customer = await findOrCreateCustomer(stripe, uid, request.auth?.token?.email);
      customerId = customer.id;
    }

    const returnUrl = String(request.data?.returnUrl || 'https://yourname.media/app/profile');
    const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return { portalUrl: session.url };
  },
);

// ── Webhook ─────────────────────────────────────────────────────────────────

export const stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    const stripe = getStripe();
    const signature = req.headers['stripe-signature'];
    if (!signature || typeof signature !== 'string') {
      res.status(400).send('missing signature');
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, signature, STRIPE_WEBHOOK_SECRET.value());
    } catch (err: any) {
      console.warn('webhook signature verification failed:', err?.message);
      res.status(400).send('invalid signature');
      return;
    }

    // Dedupe retries by event id.
    const guardRef = admin.firestore().doc(`stripeEvents/${event.id}`);
    const fresh = await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(guardRef);
      if (snap.exists) return false;
      tx.set(guardRef, {
        type: event.type,
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (!fresh) {
      res.status(200).send('duplicate');
      return;
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
          // Fast path so the user is entitled the moment they land back in the
          // app; the reset flag covers the brand-new period.
          if (subId) await syncSubscription(stripe, subId, { maybeResetUsage: true });
          break;
        }
        case 'invoice.paid': {
          // Payload-shape-proof: pre-Basil API versions carry the sub id at
          // invoice.subscription; Basil+ (incl. the sandbox default dahlia)
          // moved it to invoice.parent.subscription_details.subscription.
          const invoice = event.data.object as any;
          const rawSub =
            invoice.subscription ?? invoice.parent?.subscription_details?.subscription;
          const subId = typeof rawSub === 'string' ? rawSub : rawSub?.id;
          // Always allow a usage reset here: it's gated on a periodKey change
          // inside syncSubscription, so one-off/manual invoices (whose period
          // didn't roll) can never wrongly reset a cycle.
          if (subId) await syncSubscription(stripe, subId, { maybeResetUsage: true });
          break;
        }
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          await syncSubscription(stripe, sub.id);
          break;
        }
        default:
          break;
      }
      res.status(200).send('ok');
    } catch (err: any) {
      console.error(`webhook handler failed for ${event.type}:`, err);
      // Remove the dedupe guard so Stripe's retry can be re-processed.
      await guardRef.delete().catch(() => {});
      res.status(500).send('handler error');
    }
  },
);
