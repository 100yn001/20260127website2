/**
 * createStripeCustomer
 * --------------------
 * Callable function invoked at signup. Returns a Stripe Checkout Session
 * URL that the client redirects into. Behavior:
 *
 *   1. Looks up an existing Stripe Customer by `firebaseUid` metadata, or
 *      creates a new one. Avoids duplicate Customer rows if the same user
 *      retries onboarding.
 *   2. Auto-resolves (or creates on first call) the "yn beta" free $0/month
 *      Price keyed by lookup_key, so no manual Dashboard setup is needed.
 *   3. Creates a Checkout Session in `subscription` mode against that Price
 *      with `payment_method_collection: 'if_required'`. Because the price is
 *      $0, Stripe's hosted page does NOT prompt for a card — the user just
 *      sees a "yn beta · Free" summary and a "Subscribe" button.
 *   4. Persists `stripeCustomerId` + `betaTrialStartedAt` to users/{uid} so
 *      we have something to reconcile against even if the user abandons
 *      Checkout. The Subscription row itself is created by Stripe when the
 *      user confirms the session — we'll capture its id via webhook in a
 *      follow-up change.
 *
 * Inputs:  { email, name, successUrl, cancelUrl }
 * Output:  { customerId, checkoutUrl }
 *
 * Stripe secret key is read from a Functions Secret named
 * STRIPE_SECRET_KEY. Set it once with:
 *   firebase functions:secrets:set STRIPE_SECRET_KEY
 */

import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import Stripe from 'stripe';

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');

const FREE_PRICE_LOOKUP_KEY = 'yn_beta_free';
const PRODUCT_NAME = 'yn beta';
const PRODUCT_DESCRIPTION =
  'Beta access to yn — 5 free stories a day for a month plus the public story library';

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = STRIPE_SECRET_KEY.value();
  if (!key) {
    throw new HttpsError('failed-precondition', 'STRIPE_SECRET_KEY is not configured');
  }
  _stripe = new Stripe(key);
  return _stripe;
}

let _cachedFreePriceId: string | null = null;
async function getOrCreateFreePriceId(stripe: Stripe): Promise<string> {
  if (_cachedFreePriceId) return _cachedFreePriceId;

  const list = await stripe.prices.list({
    lookup_keys: [FREE_PRICE_LOOKUP_KEY],
    active: true,
    limit: 1,
  });
  if (list.data.length > 0) {
    _cachedFreePriceId = list.data[0].id;
    return _cachedFreePriceId;
  }

  const product = await stripe.products.create({
    name: PRODUCT_NAME,
    description: PRODUCT_DESCRIPTION,
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 0,
    currency: 'usd',
    recurring: { interval: 'month' },
    lookup_key: FREE_PRICE_LOOKUP_KEY,
  });
  _cachedFreePriceId = price.id;
  return _cachedFreePriceId;
}

/**
 * Find a Customer by firebaseUid metadata, or create one. Uses Stripe's
 * search API so we don't have to paginate a metadata-filtered list.
 */
async function findOrCreateCustomer(
  stripe: Stripe,
  uid: string,
  email: string,
  name: string | undefined,
): Promise<Stripe.Customer> {
  try {
    const search = await stripe.customers.search({
      query: `metadata['firebaseUid']:'${uid}'`,
      limit: 1,
    });
    if (search.data.length > 0) {
      return search.data[0];
    }
  } catch (err) {
    // search isn't critical — if it fails (e.g. account doesn't have search
    // indexed yet for a brand-new key), fall through to create.
    console.warn('customer search failed, falling back to create:', err);
  }
  return stripe.customers.create({
    email,
    name: name || undefined,
    metadata: { firebaseUid: uid },
  });
}

interface CreateStripeCustomerInput {
  email?: string;
  name?: string;
  successUrl?: string;
  cancelUrl?: string;
}

interface CreateStripeCustomerOutput {
  customerId: string;
  checkoutUrl: string;
}

export const createStripeCustomer = onCall<CreateStripeCustomerInput, Promise<CreateStripeCustomerOutput>>(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'must be signed in');
    }
    const { email, name, successUrl, cancelUrl } = request.data ?? {};
    if (!email) {
      throw new HttpsError('invalid-argument', 'email is required');
    }
    if (!successUrl || !cancelUrl) {
      throw new HttpsError('invalid-argument', 'successUrl and cancelUrl are required');
    }

    const stripe = getStripe();

    const customer = await findOrCreateCustomer(stripe, uid, email, name);
    const priceId = await getOrCreateFreePriceId(stripe);

    // payment_method_collection: 'if_required' is the magic flag — combined
    // with a $0 recurring price it lets Stripe Checkout skip the card form
    // entirely. The user sees a Stripe-branded summary page with a single
    // "Subscribe" button.
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_collection: 'if_required',
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: { firebaseUid: uid },
      },
      metadata: { firebaseUid: uid },
    });

    if (!session.url) {
      throw new HttpsError('internal', 'Stripe Checkout returned no URL');
    }

    // Persist what we have NOW. The subscription itself only exists once
    // the user confirms Checkout; a webhook (next change) will fill in
    // stripeSubscriptionId.
    await admin
      .firestore()
      .doc(`users/${uid}`)
      .set(
        {
          stripeCustomerId: customer.id,
          betaTrialStartedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    return { customerId: customer.id, checkoutUrl: session.url };
  },
);
