/**
 * Entitlements — client view of the server-only billing/allowance doc at
 * users/{uid}/private/entitlements (written exclusively by Cloud Functions;
 * rules make it read-only here). Field meanings mirror
 * functions/src/entitlements.ts.
 */

import { db, functions } from '@/config/firebase';
import { doc, getDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Platform } from 'react-native';

export const FREE_STORY_LIMIT = 2;
export const MONTHLY_STORY_LIMIT = 15;
export const MAX_CUSTOM_VOICES = 3;
export const MONTHLY_PRICE_LABEL = '$3/month';

export interface Entitlements {
  freeStoriesUsed: number;
  firstStoryUsed: boolean;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  storiesUsedThisPeriod: number;
}

export const DEFAULT_ENTITLEMENTS: Entitlements = {
  freeStoriesUsed: 0,
  firstStoryUsed: false,
  subscriptionStatus: null,
  currentPeriodEnd: null,
  storiesUsedThisPeriod: 0,
};

export function isSubscribed(ent: Entitlements): boolean {
  return ent.subscriptionStatus === 'active' || ent.subscriptionStatus === 'trialing';
}

export function freeStoriesRemaining(ent: Entitlements): number {
  return Math.max(0, FREE_STORY_LIMIT - ent.freeStoriesUsed);
}

export function subscriptionStoriesRemaining(ent: Entitlements): number {
  return isSubscribed(ent) ? Math.max(0, MONTHLY_STORY_LIMIT - ent.storiesUsedThisPeriod) : 0;
}

/** Can this user generate a story right now (mirrors the server's claim logic)? */
export function canGenerate(ent: Entitlements): boolean {
  return freeStoriesRemaining(ent) > 0 || subscriptionStoriesRemaining(ent) > 0;
}

/** One-shot read (pre-checks before queueing). Fails open — the server is the
 * real enforcer; a read error here must not block a legitimate generation. */
export async function getEntitlementsOnce(uid: string): Promise<Entitlements | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'private', 'entitlements'));
    if (!snap.exists()) return { ...DEFAULT_ENTITLEMENTS };
    const data = snap.data();
    return {
      freeStoriesUsed: data.freeStoriesUsed ?? 0,
      firstStoryUsed: !!data.firstStoryUsed,
      subscriptionStatus: data.subscriptionStatus ?? null,
      currentPeriodEnd:
        data.currentPeriodEnd instanceof Timestamp ? data.currentPeriodEnd.toDate() : null,
      storiesUsedThisPeriod: data.storiesUsedThisPeriod ?? 0,
    };
  } catch (e) {
    console.warn('[entitlements] one-shot read failed:', e);
    return null;
  }
}

export function subscribeToEntitlements(
  uid: string,
  cb: (ent: Entitlements) => void,
): () => void {
  const ref = doc(db, 'users', uid, 'private', 'entitlements');
  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.exists() ? snap.data() : {};
      cb({
        freeStoriesUsed: data.freeStoriesUsed ?? 0,
        firstStoryUsed: !!data.firstStoryUsed,
        subscriptionStatus: data.subscriptionStatus ?? null,
        currentPeriodEnd:
          data.currentPeriodEnd instanceof Timestamp ? data.currentPeriodEnd.toDate() : null,
        storiesUsedThisPeriod: data.storiesUsedThisPeriod ?? 0,
      });
    },
    (err) => {
      console.warn('[entitlements] listener error:', err?.message);
      cb(DEFAULT_ENTITLEMENTS);
    },
  );
}

function appOrigin(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return 'https://yourname.media';
}

async function openUrl(url: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(url);
    return;
  }
  const WebBrowser = require('expo-web-browser');
  await WebBrowser.openBrowserAsync(url);
}

/** Kick off the $3/mo Stripe Checkout and navigate the user into it. */
export async function startSubscriptionCheckout(email?: string): Promise<void> {
  const call = httpsCallable<
    { email?: string; successUrl: string; cancelUrl: string },
    { checkoutUrl: string }
  >(functions, 'createSubscriptionCheckout');
  const origin = appOrigin();
  const result = await call({
    email,
    successUrl: `${origin}/app/vault?billing=success`,
    cancelUrl: `${origin}/app/vault?billing=cancel`,
  });
  await openUrl(result.data.checkoutUrl);
}

/** Open the Stripe billing portal (manage/cancel subscription). */
export async function openBillingPortal(): Promise<void> {
  const call = httpsCallable<{ returnUrl: string }, { portalUrl: string }>(
    functions,
    'createBillingPortal',
  );
  const result = await call({ returnUrl: `${appOrigin()}/app/profile` });
  await openUrl(result.data.portalUrl);
}
