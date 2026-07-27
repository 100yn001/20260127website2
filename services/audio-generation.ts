/**
 * Story generation moved server-side (functions/src/generation.ts): the app
 * writes a queue doc and the generateStory Cloud Function pipeline does the
 * rest, with entitlements enforced in its claim transaction.
 *
 * This stub only exists because the legacy (unreachable) app/loading.tsx
 * screen still references generateAudioStory at build time.
 */

export async function generateAudioStory(): Promise<never> {
  throw new Error('client-side story generation has been removed — queue a story instead');
}
