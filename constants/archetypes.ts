/**
 * The nine personality archetypes shown on the silver-card reveal.
 *
 * Three Jungian axes (Hero / Shadow / Muse) × three subtypes per axis = 9
 * "primary" archetypes. Each user is also independently scored on the
 * three subtype dimensions, so even when two users land on the same
 * primary their card scenes are composed differently.
 *
 * See docs/archetypes.md for the philosophy + theoretical grounding.
 */

export type AxisId = 'hero' | 'shadow' | 'muse';
export type HeroSub = 'warrior' | 'ruler' | 'seeker';
export type ShadowSub = 'trickster' | 'outcast' | 'witch';
export type MuseSub = 'dreamer' | 'lover' | 'maker';
export type SubId = HeroSub | ShadowSub | MuseSub;

export type ArchetypeId =
  | `hero-${HeroSub}`
  | `shadow-${ShadowSub}`
  | `muse-${MuseSub}`;

export type Archetype = {
  id: ArchetypeId;
  axis: AxisId;
  subtype: SubId;
  title: string; // e.g. "The Duelist"
  /**
   * Setting-neutral, age-neutral fragment that describes only the iconic
   * pose / object of the character. The composeScene() helper splices a
   * time-of-day prefix, a character-quality prefix, and a setting suffix
   * around it.
   */
  coreMotif: string;
};

export const ARCHETYPES: Archetype[] = [
  {
    id: 'hero-warrior',
    axis: 'hero',
    subtype: 'warrior',
    title: 'The Duelist',
    coreMotif: 'in dark silvered armor, cloak whipping in wind, ready for combat',
  },
  {
    id: 'hero-ruler',
    axis: 'hero',
    subtype: 'ruler',
    title: 'The Regent',
    coreMotif: 'robed on a throne of mossy stone, crown of antlers, heavy velvet drapes',
  },
  {
    id: 'hero-seeker',
    axis: 'hero',
    subtype: 'seeker',
    title: 'The Cartographer',
    coreMotif: 'unrolling an old map, compass and brass telescope at their side',
  },
  {
    id: 'shadow-trickster',
    axis: 'shadow',
    subtype: 'trickster',
    title: 'The Jester',
    coreMotif: 'masked in a patterned cloak, juggling coins, two ravens perched nearby',
  },
  {
    id: 'shadow-outcast',
    axis: 'shadow',
    subtype: 'outcast',
    title: 'The Stray',
    coreMotif: 'cloaked beside a gray wolf, breath visible in the cold',
  },
  {
    id: 'shadow-witch',
    axis: 'shadow',
    subtype: 'witch',
    title: 'The Seeress',
    coreMotif: 'veiled with scattered bones and a dark scrying pool before her',
  },
  {
    id: 'muse-dreamer',
    axis: 'muse',
    subtype: 'dreamer',
    title: 'The Somnambulist',
    coreMotif: 'barefoot in a long white shift, eyes closed, trailing stars',
  },
  {
    id: 'muse-lover',
    axis: 'muse',
    subtype: 'lover',
    title: 'The Troubadour',
    coreMotif: 'cloaked with a wooden lute, rose petals scattered at their feet',
  },
  {
    id: 'muse-maker',
    axis: 'muse',
    subtype: 'maker',
    title: 'The Alchemist',
    coreMotif: 'robed with hands cupping amber light, bottles and scrolls nearby',
  },
];

export const ARCHETYPES_BY_ID: Record<ArchetypeId, Archetype> = ARCHETYPES.reduce(
  (acc, a) => ({ ...acc, [a.id]: a }),
  {} as Record<ArchetypeId, Archetype>,
);

/**
 * The three scene-axis contributions. Each axis owns one symbolic register
 * (see docs/archetypes.md §"Why time, character, and setting"):
 *   - Hero  → time of day  (Campbell's monomyth: dawn / noon / midnight)
 *   - Muse  → character    (Jung's Anima is always personified)
 *   - Shadow → setting     (Jung's Shadow appears as a place)
 */
export const HERO_TIME_OF_DAY: Record<HeroSub, string> = {
  warrior: 'at noon',
  ruler: 'at sunset',
  seeker: 'at midnight',
};

export const MUSE_CHARACTER: Record<MuseSub, string> = {
  dreamer: 'a young figure',
  lover: 'an aged figure',
  maker: 'a figure with a familiar beast at their side',
};

export const SHADOW_SETTING: Record<ShadowSub, string> = {
  trickster: 'on a cobbled moonlit street',
  outcast: 'at the edge of a stormy coast',
  witch: 'against a backdrop of scattered stars',
};

/**
 * Compose the scene prompt fed to Replicate. The result is wrapped by
 * services/replicate-service.ts wrapPrompt() which appends the tarot-
 * style tail (", no text, in the style of TOK a trtcrd, tarot style").
 */
export function composeScene(
  primary: ArchetypeId,
  heroSub: HeroSub,
  museSub: MuseSub,
  shadowSub: ShadowSub,
): string {
  const core = ARCHETYPES_BY_ID[primary].coreMotif;
  return `${HERO_TIME_OF_DAY[heroSub]}, ${MUSE_CHARACTER[museSub]} ${core}, ${SHADOW_SETTING[shadowSub]}`;
}
