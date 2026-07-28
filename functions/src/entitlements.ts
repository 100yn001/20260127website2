/**
 * Entitlements — the server-only source of truth for what a user may generate.
 *
 * Doc: users/{uid}/private/entitlements  (client READ-ONLY via rules; every
 * write happens here through the Admin SDK).
 *
 * Model (owner decisions, 2026-07-27):
 *   - 2 lifetime free in-app stories per user
 *   - $3/month subscription → 10 stories per billing period, flat
 *   - onboarding first story is separate (firstStoryUsed)
 *   - max 3 saved custom voices per user
 */

import * as admin from 'firebase-admin';

export const FREE_STORY_LIMIT = 2;
export const MONTHLY_STORY_LIMIT = 10;
export const MAX_CUSTOM_VOICES = 3;

export type StorySlot = 'free' | 'subscription';

export interface Entitlements {
  freeStoriesUsed: number;
  firstStoryUsed: boolean;
  subscriptionStatus: string | null; // Stripe status; entitled iff active|trialing
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  currentPeriodEnd: admin.firestore.Timestamp | null;
  periodKey: string | null; // anchored to Stripe current_period_end epoch-seconds
  storiesUsedThisPeriod: number;
}

export const DEFAULT_ENTITLEMENTS: Entitlements = {
  freeStoriesUsed: 0,
  firstStoryUsed: false,
  subscriptionStatus: null,
  stripeSubscriptionId: null,
  stripeCustomerId: null,
  currentPeriodEnd: null,
  periodKey: null,
  storiesUsedThisPeriod: 0,
};

export function entitlementsRef(uid: string): admin.firestore.DocumentReference {
  return admin.firestore().doc(`users/${uid}/private/entitlements`);
}

export function isSubscribed(ent: Entitlements): boolean {
  return ent.subscriptionStatus === 'active' || ent.subscriptionStatus === 'trialing';
}

export function readEntitlements(snap: admin.firestore.DocumentSnapshot): Entitlements {
  return { ...DEFAULT_ENTITLEMENTS, ...(snap.exists ? (snap.data() as Partial<Entitlements>) : {}) };
}

/**
 * Inside a transaction: decide whether this user may generate one story now.
 * Returns the slot consumed ('free' | 'subscription') and stages the usage
 * increment on the transaction, or returns null (no writes) if not entitled.
 */
export function claimStorySlot(
  tx: admin.firestore.Transaction,
  uid: string,
  ent: Entitlements,
): StorySlot | null {
  const ref = entitlementsRef(uid);
  if (ent.freeStoriesUsed < FREE_STORY_LIMIT) {
    tx.set(
      ref,
      { ...ent, freeStoriesUsed: ent.freeStoriesUsed + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
    return 'free';
  }
  if (isSubscribed(ent) && ent.storiesUsedThisPeriod < MONTHLY_STORY_LIMIT) {
    tx.set(
      ref,
      {
        ...ent,
        storiesUsedThisPeriod: ent.storiesUsedThisPeriod + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return 'subscription';
  }
  return null;
}

/**
 * Give back a consumed slot after a failed generation. Idempotence is the
 * caller's job (guard with a `refunded` flag on the queue doc).
 */
export async function refundStorySlot(uid: string, slot: StorySlot): Promise<void> {
  const ref = entitlementsRef(uid);
  await admin.firestore().runTransaction(async (tx) => {
    const ent = readEntitlements(await tx.get(ref));
    if (slot === 'free') {
      tx.set(
        ref,
        { freeStoriesUsed: Math.max(0, ent.freeStoriesUsed - 1), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
    } else {
      tx.set(
        ref,
        {
          storiesUsedThisPeriod: Math.max(0, ent.storiesUsedThisPeriod - 1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  });
}
