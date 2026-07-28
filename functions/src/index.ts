/**
 * Firebase Cloud Functions for yn — server-side generation + billing.
 *
 * All story/text/voice generation runs here (the ONLY place provider keys
 * live). Entitlements ($3/mo → 10 stories, 2 lifetime free, 1 first story,
 * ≤3 custom voices) are enforced server-side; see entitlements.ts.
 *
 * Provider keys come from functions/.env (gitignored) — ANTHROPIC_API_KEY,
 * XAI_API_KEY, ELEVENLABS_API_KEY. Stripe secrets live in Secret Manager
 * (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET).
 */

import './init';

export { onQueueWrite, generateStoryWorker, sweepStuckQueue } from './generation';
export { generateFirstStory } from './firstStory';
export { generateFollowUps, styleWords } from './textCallables';
export { designVoicePreviews, saveDesignedVoice, previewVoiceTts, onVoiceDeleted } from './voiceCallables';
export { createSubscriptionCheckout, createBillingPortal, stripeWebhook } from './stripe';
