/**
 * Narration modes — the source of truth for the Fable immersion prompt
 * workflow used by the story-generation pipeline.
 *
 * PURE module: no SDK, no expo, no platform code — only types, constants, and
 * string builders. This lets it be imported by BOTH platform audio-generation
 * files and reasoned about in isolation. The standalone harness `fable_test.mjs`
 * mirrors these textures byte-for-byte (it runs under plain node and can't
 * resolve the `@/` alias), so keep the two in sync when tuning.
 *
 * The workflow ("immersion engine") makes the voice feel like a real partner
 * IN the moment — present tense, second person, doing not announcing — rather
 * than a narrator describing a scene. The narration MODE dials how sparse vs.
 * descriptive that voice is; the TONE branch (isNighttime) dials romantic vs.
 * explicit.
 */

export type NarrationMode = 'immersive' | 'intermediate' | 'cinematic';

export const NARRATION_MODES: NarrationMode[] = ['immersive', 'intermediate', 'cinematic'];

export const DEFAULT_NARRATION_MODE: NarrationMode = 'intermediate';

/** User-facing labels (the middle mode reads as "balanced"). */
export const NARRATION_MODE_LABELS: Record<NarrationMode, string> = {
  immersive: 'immersive',
  intermediate: 'balanced',
  cinematic: 'cinematic',
};

export type PolishStrictness = 'aggressive' | 'balanced' | 'preserve';

interface ModeParams {
  /** TEXTURE block appended to the immersion engine. */
  texture: string;
  /** Polish-pass strictness for stage 3. */
  polishStrictness: PolishStrictness;
  /**
   * Effective spoken words-per-minute INCLUDING pauses, drawn-out vowels, and
   * audio-tag cadence — NOT the textbook ~150 wpm reading rate. Immersive is
   * slowest (sparse + many pauses); cinematic is closest to natural narration.
   * Used only for a rough duration→word estimate (±1–2 min is acceptable).
   */
  wpm: number;
}

export const MODE_PARAMS: Record<NarrationMode, ModeParams> = {
  immersive: {
    polishStrictness: 'aggressive',
    wpm: 85,
    texture: `TEXTURE — IMMERSIVE:
Strip everything to immediacy. Sparse. In media res. Every line is something happening THIS second. Almost no adjectives. The power is in the directness and in the silences between lines. If a sentence could sit in a written story, cut it — it has to sound like someone too far gone to narrate. Lean on short imperatives, single sensory call-outs, and raw reactions to her. Less is more; let the breath do the work.`,
  },
  intermediate: {
    polishStrictness: 'balanced',
    wpm: 115,
    texture: `TEXTURE — BALANCED:
Still present, still real-time second person, but with connective tissue between the beats so it breathes. A little light sensory framing is welcome — one grounding detail per beat (the warmth of her, a sound, the dark of the room) — but never description for its own sake. Pace it so it feels guided, not clipped: a real person present enough to put a few words to what they feel, then act. The midpoint between sparse and painterly.`,
  },
  cinematic: {
    polishStrictness: 'preserve',
    wpm: 140,
    texture: `TEXTURE — CINEMATIC:
Let it linger. Paint sensation — heat, weight, the air, her skin, the sounds. Slow the build, more words per beat, indulgent and descriptive. BUT never a detached narrator: every sensation you describe is one of you two feeling it right now, in second person, present tense. Rich, but still spoken aloud by a person inside the moment — not read off a page.`,
  },
};

/** ABSOLUTE RULES core shared by every mode + tone (ported from fable_test.mjs). */
function absoluteRulesCore(genderOther: string): string {
  const partner = genderOther && genderOther.trim() ? genderOther.trim() : 'partner';
  return `You are not writing, recording, or narrating anything. You ARE her ${partner}, and this is happening RIGHT NOW — a breath away from her. There is no audience, no script, no story being told. There is only the two of you, here, now.

ABSOLUTE RULES:
- Present tense. Second person. Real time. You speak only to her.
- Begin ALREADY in the moment — already close, already touching. No scene-setting, no recap of how you got here. Drop straight in.
- DO things; never announce them. Never say "let me," "I'm going to," "now I'll," "I want to" + an action. If you'd touch her, it's already done — show it through what you feel and how she reacts.
- It is a DUET. React to her constantly — her breath, the sound she just made, how she moved, how she feels against you. Make her half of it felt, but never speak her lines for her.
- Real speech, not prose. Short. Broken. Trailing off. Commands and half-thoughts. Never literary, never a paragraph of description.
- Sparingly, you may use these audio cues and nothing else: [slowly], [chuckles], and the breath sounds 'hmmmmm', 'ahhhhh'.
- Never break the moment. No meta, no narrator voice, no summarizing, no mention of time or length.`;
}

/** The one line that swaps romantic (SFW) vs. explicit (NSFW). */
function toneLine(isNighttime: boolean): string {
  return isNighttime
    ? `- This is explicit and physical. Be graphic and unambiguous about every act — name what is happening, no euphemism, no fade to black.`
    : `- This is purely romantic and tender — closeness, warmth, words, and touch. Never sexual, never explicit. Keep it intimate but clean.`;
}

/**
 * The full system prompt for the STAGE 2 "embody" call (and the base for the
 * STAGE 3 polish system prompt): rules core + tone branch + mode texture.
 */
export function immersionEngine(opts: {
  mode: NarrationMode;
  genderOther: string;
  isNighttime: boolean;
}): string {
  const params = MODE_PARAMS[opts.mode] ?? MODE_PARAMS[DEFAULT_NARRATION_MODE];
  return `${absoluteRulesCore(opts.genderOther)}
${toneLine(opts.isNighttime)}

${params.texture}`;
}

/** Stage-3 polish instruction, varying by the mode's strictness. */
export function polishInstruction(mode: NarrationMode): string {
  const strictness = (MODE_PARAMS[mode] ?? MODE_PARAMS[DEFAULT_NARRATION_MODE]).polishStrictness;
  switch (strictness) {
    case 'aggressive':
      return `Cut anything that reads like a sentence from a written story; strip it all the way to immediacy.`;
    case 'preserve':
      return `Keep all the rich description. ONLY remove announcements ("let me" / "I'm going to" / "now I'll") and any fourth-wall break or meta line.`;
    case 'balanced':
    default:
      return `Delete announcements and any obvious narrator sentences, but keep the light grounding details.`;
  }
}

// ── Duration → rough word target ────────────────────────────────────────────

/** '5min' → 5, '10min' → 10, etc. Defaults to 10 when unparseable. */
export function minutesFromDurationLabel(label?: string): number {
  const m = (label || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 10;
}

/** Rough word target for a given duration + mode (±1–2 min is acceptable). */
export function targetWordCount(minutes: number, mode: NarrationMode): number {
  const params = MODE_PARAMS[mode] ?? MODE_PARAMS[DEFAULT_NARRATION_MODE];
  return Math.round(minutes * params.wpm);
}

// ── Legacy narrativeRatio interop ───────────────────────────────────────────

/** Map an old 0–10 "descriptive · direct" ratio onto a narration mode. */
export function narrationModeFromLegacy(ratio?: number): NarrationMode {
  if (ratio == null || Number.isNaN(ratio)) return DEFAULT_NARRATION_MODE;
  if (ratio >= 7) return 'immersive'; // was very "direct"
  if (ratio <= 3) return 'cinematic'; // was very "descriptive"
  return 'intermediate';
}

/** Derived legacy ratio to dual-write so old readers still work. */
export const LEGACY_RATIO_BY_MODE: Record<NarrationMode, number> = {
  immersive: 8,
  intermediate: 5,
  cinematic: 2,
};
