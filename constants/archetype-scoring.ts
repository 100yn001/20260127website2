/**
 * Lookup tables that map every pickable onboarding answer to one of the
 * nine archetypes. Each pickable option contributes +1 to exactly one
 * archetype. See docs/archetypes.md §"How the answers map onto the axes"
 * for the rationale per pair.
 *
 * Key naming convention used by app/onboarding.tsx:
 *   - personalityInitial answers stored under `initial_{top}_{bottom}` →
 *     value is the literal "{top}" or "{bottom}" the user picked.
 *   - personalityReally answers stored under `really_{top}_{bottom}` (same).
 *   - object/animal/descriptors/descriptors2 keys are flat. descriptors and
 *     descriptors2 are comma-joined strings.
 */

import type { ArchetypeId } from './archetypes';

/** personalityInitial: 10 binaries, both sides assigned. */
export const INITIAL_SCORING: Record<
  string /* "{top}|{bottom}" */,
  { top: ArchetypeId; bottom: ArchetypeId }
> = {
  'dinner date|coffee date': { top: 'muse-lover', bottom: 'hero-ruler' },
  'slow burn|instant spark': { top: 'muse-lover', bottom: 'shadow-trickster' },
  'window seat|corner booth': { top: 'hero-seeker', bottom: 'shadow-outcast' },
  'ballroom dancing|kitchen dancing': { top: 'hero-ruler', bottom: 'shadow-trickster' },
  'hand in hand|arm around shoulder': { top: 'muse-lover', bottom: 'hero-warrior' },
  'first asleep|last awake': { top: 'muse-dreamer', bottom: 'shadow-witch' },
  'arrive together|meet there': { top: 'hero-ruler', bottom: 'hero-seeker' },
  'dressed up|dressed down': { top: 'muse-maker', bottom: 'shadow-outcast' },
  'first touch|first kiss': { top: 'hero-warrior', bottom: 'muse-lover' },
  'right now|forever': { top: 'shadow-trickster', bottom: 'muse-dreamer' },
};

/** personalityReally: 17 binaries, 10 drawn per session. */
export const REALLY_SCORING: Record<
  string,
  { top: ArchetypeId; bottom: ArchetypeId }
> = {
  'moon|sun': { top: 'shadow-witch', bottom: 'hero-ruler' },
  'up|down': { top: 'hero-warrior', bottom: 'shadow-outcast' },
  'sea|stars': { top: 'muse-dreamer', bottom: 'hero-seeker' },
  'lung|heart': { top: 'muse-maker', bottom: 'muse-lover' },
  'eclipse|solstice': { top: 'shadow-witch', bottom: 'hero-ruler' },
  'snow|amber': { top: 'shadow-outcast', bottom: 'muse-maker' },
  'vine|wire': { top: 'muse-maker', bottom: 'shadow-trickster' },
  'tide|wind': { top: 'muse-dreamer', bottom: 'hero-seeker' },
  'predator|prey': { top: 'hero-warrior', bottom: 'shadow-outcast' },
  'linen|leather': { top: 'muse-dreamer', bottom: 'hero-warrior' },
  'moth|flame': { top: 'muse-lover', bottom: 'hero-warrior' },
  'inhale|exhale': { top: 'muse-dreamer', bottom: 'shadow-witch' },
  'compass|anchor': { top: 'hero-seeker', bottom: 'hero-ruler' },
  'needle|thread': { top: 'muse-maker', bottom: 'muse-maker' },
  'comet|nebula': { top: 'hero-seeker', bottom: 'muse-dreamer' },
  'chorus|solo': { top: 'hero-ruler', bottom: 'shadow-outcast' },
  'question|answer': { top: 'hero-seeker', bottom: 'hero-ruler' },
};

export const OBJECT_SCORING: Record<string, ArchetypeId> = {
  mirror: 'shadow-witch',
  hourglass: 'hero-ruler',
  globe: 'hero-seeker',
  violin: 'muse-lover',
  kite: 'muse-dreamer',
  magnet: 'hero-warrior',
};

export const ANIMAL_SCORING: Record<string, ArchetypeId> = {
  raven: 'shadow-witch',
  bear: 'hero-ruler',
  seahorse: 'muse-lover',
  fox: 'shadow-trickster',
  rabbit: 'muse-dreamer',
  beetle: 'muse-maker',
};

export const DESCRIPTOR_SCORING: Record<string, ArchetypeId> = {
  sensitive: 'muse-lover',
  candid: 'hero-warrior',
  thoughtful: 'shadow-witch',
  methodical: 'muse-maker',
  grounded: 'hero-ruler',
  messy: 'shadow-trickster',
  quiet: 'shadow-outcast',
  decisive: 'hero-warrior',
  detached: 'shadow-outcast',
};

export const DESCRIPTOR2_SCORING: Record<string, ArchetypeId> = {
  stoic: 'hero-warrior',
  discerning: 'hero-seeker',
  expressive: 'muse-lover',
  loud: 'shadow-trickster',
  dreamy: 'muse-dreamer',
  intuitive: 'shadow-witch',
  tender: 'muse-lover',
  weird: 'shadow-trickster',
  introspective: 'shadow-outcast',
};

/**
 * How many slots in the entire instrument point to each archetype.
 * Used to normalize raw scores so archetypes with smaller "catchment
 * areas" aren't structurally disadvantaged. Values were derived by
 * counting the assignments above plus the binary symmetry (each
 * binary contributes 1 slot per side regardless of whether its sides
 * point to the same or different archetypes — the needle/thread row
 * is the only same-side pair, both pointing to muse-maker, so it
 * contributes 2 to muse-maker's count).
 *
 * If you edit any of the tables above, recompute these by counting.
 */
export const REACHABLE_SLOTS: Record<ArchetypeId, number> = {
  'hero-warrior': 10,
  'hero-ruler': 11,
  'hero-seeker': 9,
  'shadow-trickster': 8,
  'shadow-outcast': 9,
  'shadow-witch': 9,
  'muse-dreamer': 10,
  'muse-lover': 11,
  'muse-maker': 8,
};
