/**
 * createStripeCustomer
 * --------------------
 * Callable function invoked once at signup. Creates the Stripe Customer
 * for the authenticated Firebase user and subscribes them to a free
 * $0/month Price (the "yn beta" offer). The Product + Price are
 * auto-created on first invocation via a stable `lookup_key`, so no
 * manual Stripe Dashboard setup is required.
 *
 * Inputs:  { email, name }
 * Output:  { customerId, subscriptionId }
 *
 * Side-effects:
 *   - stripe.customers.create
 *   - stripe.subscriptions.create
 *   - users/{uid}.{stripeCustomerId, stripeSubscriptionId, betaTrialStartedAt}
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

interface CreateStripeCustomerInput {
  email?: string;
  name?: string;
}

interface CreateStripeCustomerOutput {
  customerId: string;
  subscriptionId: string;
}

export const createStripeCustomer = onCall<CreateStripeCustomerInput, Promise<CreateStripeCustomerOutput>>(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'must be signed in');
    }
    const { email, name } = request.data ?? {};
    if (!email) {
      throw new HttpsError('invalid-argument', 'email is required');
    }

    const stripe = getStripe();

    // 1. Customer
    const customer = await stripe.customers.create({
      email,
      name: name || undefined,
      metadata: { firebaseUid: uid },
    });

    // 2. $0 Subscription on the auto-resolved free Price
    const priceId = await getOrCreateFreePriceId(stripe);
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      metadata: { firebaseUid: uid },
    });

    // 3. Persist the IDs on the user doc so the client doesn't need a
    //    second round-trip and a future webhook can dedupe by uid.
    await admin
      .firestore()
      .doc(`users/${uid}`)
      .set(
        {
          stripeCustomerId: customer.id,
          stripeSubscriptionId: subscription.id,
          betaTrialStartedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    return { customerId: customer.id, subscriptionId: subscription.id };
  },
);
