/**
 * Deterministic archetype classification from onboarding answers.
 *
 * Returns four picks per user:
 *   - primary  : 1 of 9 (determines the card title and the core motif)
 *   - heroSub  : 1 of 3 hero subtypes  (contributes time-of-day to scene)
 *   - museSub  : 1 of 3 muse subtypes  (contributes character to scene)
 *   - shadowSub: 1 of 3 shadow subtypes (contributes setting to scene)
 *
 * The primary is chosen by NORMALIZED score (raw points / reachable slots)
 * so archetypes with smaller catchment areas aren't disadvantaged. The
 * sub-axis winners are chosen by RAW score within their axis (the pools
 * within an axis are similar enough size that raw is sufficient).
 *
 * Ties are broken by hashing a stable per-user seed (FNV-1a). The seed
 * should be the user's uid post-signup, or a per-session UUID before
 * signup — the only contract is "stable for the duration of a single
 * onboarding run".
 */

import {
  ARCHETYPES,
  ARCHETYPES_BY_ID,
  type ArchetypeId,
  type HeroSub,
  type MuseSub,
  type ShadowSub,
} from '@/constants/archetypes';
import {
  ANIMAL_SCORING,
  DESCRIPTOR_SCORING,
  DESCRIPTOR2_SCORING,
  INITIAL_SCORING,
  OBJECT_SCORING,
  REACHABLE_SLOTS,
  REALLY_SCORING,
} from '@/constants/archetype-scoring';

export type Classification = {
  primary: ArchetypeId;
  heroSub: HeroSub;
  museSub: MuseSub;
  shadowSub: ShadowSub;
  /** Raw point totals for each of the 9 — handy for debugging / display. */
  raw: Record<ArchetypeId, number>;
};

// ---------- helpers ----------

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function pickFromTie<T extends string>(tied: T[], seed: string): T {
  if (tied.length === 1) return tied[0];
  const sorted = [...tied].sort();
  const idx = fnv1a(`${seed}:${sorted.join(',')}`) % sorted.length;
  return sorted[idx];
}

function parseBinaryKey(key: string, prefix: string): { top: string; bottom: string } | null {
  if (!key.startsWith(prefix)) return null;
  const rest = key.slice(prefix.length);
  const idx = rest.indexOf('_');
  if (idx < 0) return null;
  return { top: rest.slice(0, idx), bottom: rest.slice(idx + 1) };
}

function emptyRaw(): Record<ArchetypeId, number> {
  return ARCHETYPES.reduce(
    (acc, a) => ({ ...acc, [a.id]: 0 }),
    {} as Record<ArchetypeId, number>,
  );
}

function bumpFromBinary(
  raw: Record<ArchetypeId, number>,
  table: Record<string, { top: ArchetypeId; bottom: ArchetypeId }>,
  parsed: { top: string; bottom: string },
  picked: string,
) {
  const entry = table[`${parsed.top}|${parsed.bottom}`];
  if (!entry) return;
  if (picked === parsed.top) raw[entry.top] += 1;
  else if (picked === parsed.bottom) raw[entry.bottom] += 1;
}

function bumpEach(
  raw: Record<ArchetypeId, number>,
  table: Record<string, ArchetypeId>,
  word: string,
) {
  const id = table[word.toLowerCase().trim()];
  if (id) raw[id] += 1;
}

// ---------- main ----------

export function classifyArchetype(
  answers: Record<string, unknown>,
  seed: string,
): Classification {
  const raw = emptyRaw();

  for (const [key, value] of Object.entries(answers)) {
    if (typeof value !== 'string') continue;

    const initialParsed = parseBinaryKey(key, 'initial_');
    if (initialParsed) {
      bumpFromBinary(raw, INITIAL_SCORING, initialParsed, value);
      continue;
    }
    const reallyParsed = parseBinaryKey(key, 'really_');
    if (reallyParsed) {
      bumpFromBinary(raw, REALLY_SCORING, reallyParsed, value);
      continue;
    }
    if (key === 'object') {
      bumpEach(raw, OBJECT_SCORING, value);
      continue;
    }
    if (key === 'animal') {
      bumpEach(raw, ANIMAL_SCORING, value);
      continue;
    }
    if (key === 'descriptors') {
      for (const w of value.split(',')) bumpEach(raw, DESCRIPTOR_SCORING, w);
      continue;
    }
    if (key === 'descriptors2') {
      for (const w of value.split(',')) bumpEach(raw, DESCRIPTOR2_SCORING, w);
      continue;
    }
  }

  // --- Primary: normalized score, tiebreak hashed by seed ---
  let bestNorm = -Infinity;
  let primaryTied: ArchetypeId[] = [];
  for (const a of ARCHETYPES) {
    const norm = raw[a.id] / REACHABLE_SLOTS[a.id];
    if (norm > bestNorm + 1e-9) {
      bestNorm = norm;
      primaryTied = [a.id];
    } else if (Math.abs(norm - bestNorm) <= 1e-9) {
      primaryTied.push(a.id);
    }
  }
  const primary = pickFromTie(primaryTied, seed);

  // --- Sub-axis winners: raw max within axis, tiebreak hashed by seed ---
  const heroSub = pickAxisSub<HeroSub>(raw, ['warrior', 'ruler', 'seeker'], 'hero', seed);
  const museSub = pickAxisSub<MuseSub>(raw, ['dreamer', 'lover', 'maker'], 'muse', seed);
  const shadowSub = pickAxisSub<ShadowSub>(
    raw,
    ['trickster', 'outcast', 'witch'],
    'shadow',
    seed,
  );

  return { primary, heroSub, museSub, shadowSub, raw };
}

function pickAxisSub<T extends string>(
  raw: Record<ArchetypeId, number>,
  subs: T[],
  axis: 'hero' | 'muse' | 'shadow',
  seed: string,
): T {
  let best = -Infinity;
  let tied: T[] = [];
  for (const s of subs) {
    const id = `${axis}-${s}` as ArchetypeId;
    const score = raw[id];
    if (score > best) {
      best = score;
      tied = [s];
    } else if (score === best) {
      tied.push(s);
    }
  }
  return pickFromTie(tied, `${seed}:${axis}`);
}

// Re-export for convenience so callers only need one import.
export { ARCHETYPES_BY_ID } from '@/constants/archetypes';
