/**
 * Claude (Anthropic) Service
 *
 * Single client-side call used by the silver-card pipeline:
 *   describeStorytellingStyle — distills the onboarding answers into 3
 *   adjectives shown on the storyteller-recap overlay.
 *
 * The archetype title and the tarot scene prompt are NOT generated here
 * anymore — they're deterministic lookups (constants/archetypes.ts +
 * services/archetype.ts). See docs/archetypes.md for why.
 *
 * Follows the existing Grok pattern: keys come from Expo extras and the
 * SDK is allowed in the browser via dangerouslyAllowBrowser.
 */

import Anthropic from '@anthropic-ai/sdk';
import Constants from 'expo-constants';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = Constants.expoConfig?.extra?.ANTHROPIC_API_KEY || '';
  if (!apiKey) console.warn('⚠️ ANTHROPIC_API_KEY not found in environment');
  _client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  return _client;
}

const MODEL = 'claude-haiku-4-5-20251001';

function formatAnswers(answers: Record<string, unknown>): string {
  return Object.entries(answers)
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: ${value.join(', ')}`;
      return `${key}: ${value}`;
    })
    .join('\n');
}

function extractText(response: Anthropic.Message): string {
  for (const block of response.content) {
    if (block.type === 'text') return block.text.trim();
  }
  return '';
}

function collectUserWords(answers: Record<string, unknown>): string[] {
  const words = new Set<string>();
  for (const value of Object.values(answers)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        if (typeof v === 'string') {
          v.split(/[\s,]+/).forEach((w) => {
            const clean = w.toLowerCase().trim();
            if (clean) words.add(clean);
          });
        }
      }
    } else if (typeof value === 'string') {
      value.split(/[\s,]+/).forEach((w) => {
        const clean = w.toLowerCase().trim();
        if (clean) words.add(clean);
      });
    }
  }
  return Array.from(words);
}

export async function describeStorytellingStyle(
  answers: Record<string, unknown>,
): Promise<string> {
  const forbidden = collectUserWords(answers);
  const forbiddenClause = forbidden.length
    ? ` You must NOT use any of these words (the person already picked them): ${forbidden.join(', ')}. Pick fresh, distinct vocabulary.`
    : '';

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 64,
    temperature: 0.95,
    system:
      "Return exactly three words, comma-separated, describing this person's storytelling style. No preamble, no punctuation beyond the commas, lowercase only." +
      forbiddenClause,
    messages: [{ role: 'user', content: formatAnswers(answers) }],
  });

  const raw = extractText(response);
  return raw.replace(/\.$/, '').toLowerCase();
}

