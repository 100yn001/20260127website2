/**
 * Small interactive text callables — server-side ports of the client's
 * lightweight Claude calls (services/claude-service.ts + follow-up questions
 * from services/fable-story.ts). Auth required; anonymous is fine (onboarding
 * uses styleWords before signup).
 */

import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { generateFollowUpQuestions, getAnthropic, type FableRecipe } from './fable';

const HAIKU = 'claude-haiku-4-5-20251001';

function requireAuth(request: { auth?: { uid?: string } }): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'must be signed in');
  return uid;
}

function extractText(response: any): string {
  for (const block of response.content) {
    if (block.type === 'text') return block.text.trim();
  }
  return '';
}

/** Four follow-up questions for a recipe (Fable primary, Grok fallback). */
export const generateFollowUps = onCall({ timeoutSeconds: 300 }, async (request) => {
  const uid = requireAuth(request);
  const recipe = (request.data?.recipe || {}) as FableRecipe;
  const questions = await generateFollowUpQuestions(recipe, uid);
  return { questions };
});

/** Three storytelling-style words for the silver card (port of describeStorytellingStyle). */
export const styleWords = onCall({ timeoutSeconds: 60 }, async (request) => {
  requireAuth(request);
  const answers = (request.data?.answers || {}) as Record<string, unknown>;

  const words = new Set<string>();
  for (const value of Object.values(answers)) {
    const push = (v: string) =>
      v.split(/[\s,]+/).forEach((w) => {
        const clean = w.toLowerCase().trim();
        if (clean) words.add(clean);
      });
    if (Array.isArray(value)) value.forEach((v) => typeof v === 'string' && push(v));
    else if (typeof value === 'string') push(value);
  }
  const forbidden = Array.from(words);
  const forbiddenClause = forbidden.length
    ? ` You must NOT use any of these words (the person already picked them): ${forbidden.join(', ')}. Pick fresh, distinct vocabulary.`
    : '';

  const formatted = Object.entries(answers)
    .map(([key, value]) => (Array.isArray(value) ? `${key}: ${value.join(', ')}` : `${key}: ${value}`))
    .join('\n')
    .slice(0, 4000);

  const response = await getAnthropic().messages.create({
    model: HAIKU,
    max_tokens: 64,
    temperature: 0.95,
    system:
      "Return exactly three words, comma-separated, describing this person's storytelling style. No preamble, no punctuation beyond the commas, lowercase only." +
      forbiddenClause,
    messages: [{ role: 'user', content: formatted || 'no answers provided' }],
  });

  return { words: extractText(response).replace(/\.$/, '').toLowerCase() };
});
