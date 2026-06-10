/**
 * Fable Story Service — ALL text-generation stages, on the Claude API
 * `claude-fable-5` model. Platform-agnostic (no Blob/file/RNBU): consumed by
 * both services/audio-generation.web.ts and services/audio-generation.ts, which
 * keep only TTS + I/O + Firebase save.
 *
 * Replaces the old Grok (api.x.ai) text calls with a 3-stage immersion
 * workflow proven in fable_test.mjs:
 *   STAGE 1  scene-notes   — terse INTERNAL raw material (not a script)
 *   STAGE 2  embody        — Fable BECOMES the partner, plays the moment now
 *   STAGE 3  immersion-polish — strips announcements / story-sentences
 *
 * Prompt textures + pacing live in constants/narration-modes.ts (the source of
 * truth, mirrored by the fable_test.mjs harness).
 *
 * Follows the existing Anthropic pattern (services/claude-service.ts): key from
 * Expo extras, SDK allowed in the browser via dangerouslyAllowBrowser.
 */

import Anthropic from '@anthropic-ai/sdk';
import Constants from 'expo-constants';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import {
  DEFAULT_NARRATION_MODE,
  immersionEngine,
  minutesFromDurationLabel,
  narrationModeFromLegacy,
  polishInstruction,
  targetWordCount,
  type NarrationMode,
} from '@/constants/narration-modes';
import { grokAmbientPrompt, grokFollowUpQuestions, grokTranscript } from './grok-story';

const FABLE_MODEL = 'claude-fable-5';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = Constants.expoConfig?.extra?.ANTHROPIC_API_KEY || '';
  if (!apiKey) console.warn('⚠️ ANTHROPIC_API_KEY not found in environment');
  _client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  return _client;
}

/** Error carrying the exact prompt that failed, for refusal logging + fallback. */
function fableErr(
  message: string,
  ctx: { system: string; user: string; label: string; kind: 'refusal' | 'error' },
): Error {
  const e = new Error(message);
  (e as any).__fable = { stage: ctx.label, system: ctx.system, user: ctx.user, kind: ctx.kind };
  return e;
}

/**
 * Single Fable text call. Throws a tagged error (carrying the prompt + stage)
 * on a refusal, empty output, or API error so the wrapper can log it and fall
 * back to Grok.
 */
async function fableText(args: {
  system: string;
  user: string;
  maxTokens: number;
  label: string;
}): Promise<string> {
  let msg: Anthropic.Message;
  try {
    msg = await getClient().messages.create({
      model: FABLE_MODEL,
      max_tokens: args.maxTokens,
      system: args.system,
      messages: [{ role: 'user', content: args.user }],
    });
  } catch (e: any) {
    throw fableErr(e?.message || 'claude-fable-5 request failed', { ...args, kind: 'error' });
  }
  if (msg.stop_reason === 'refusal') {
    throw fableErr(`CONTENT_MODERATION: claude-fable-5 refused at "${args.label}".`, {
      ...args,
      kind: 'refusal',
    });
  }
  let text = '';
  for (const block of msg.content) {
    if (block.type === 'text') {
      text = block.text.trim();
      break;
    }
  }
  if (!text) {
    throw fableErr(
      `CONTENT_MODERATION: claude-fable-5 returned no text at "${args.label}" (stop_reason=${msg.stop_reason}).`,
      { ...args, kind: 'refusal' },
    );
  }
  return text;
}

/** Text-relevant subset of RecipeData (the platform files own the I/O fields). */
export interface FableRecipe {
  userName?: string;
  setting?: string;
  location?: string;
  character?: string;
  genderSelf?: string;
  genderOther?: string;
  trope?: string;
  features?: string[];
  featurePreferences?: Record<string, string[]>;
  isNighttime?: boolean;
  duration?: string;
  narrationMode?: NarrationMode;
  narrativeRatio?: number; // legacy 0–10; mapped to a mode when narrationMode absent
  prompt?: string;
  tags?: string[];
  narratorData?: any;
}

function resolveMode(recipe: FableRecipe): NarrationMode {
  return recipe.narrationMode ?? narrationModeFromLegacy(recipe.narrativeRatio);
}

function featureLineFrom(recipe: FableRecipe): string {
  return (recipe.features || [])
    .map((f) => {
      const prefs = (recipe.featurePreferences || {})[f] || [];
      const dir = prefs.includes('receive')
        ? 'she receives'
        : prefs.includes('give')
          ? 'she gives'
          : '';
      return dir ? `${f} (${dir})` : f;
    })
    .filter(Boolean)
    .join(', ');
}

// ── Stage builders (kept in sync with fable_test.mjs) ───────────────────────

function buildSceneNotes(
  recipe: FableRecipe,
  opts: { isNighttime: boolean; featureLine: string; followUpQA: string },
): { system: string; user: string } {
  const seedBits = [
    recipe.setting && `scene seed: "${recipe.setting}"`,
    recipe.location && `location: ${recipe.location}`,
    recipe.character && `the partner: ${recipe.character}`,
    recipe.trope && `dynamic: ${recipe.trope}`,
    recipe.prompt && recipe.prompt !== recipe.setting && `extra notes: ${recipe.prompt}`,
    opts.followUpQA && `what she shared:\n${opts.followUpQA}`,
  ]
    .filter(Boolean)
    .join('\n');

  const system = opts.isNighttime
    ? `You are a scene planner for an intimate, explicit first-person audio. Output TERSE internal notes ONLY — never prose, never dialogue, never anything meant to be spoken aloud. NSFW is fine; be concrete and specific. No preamble, no commentary.`
    : `You are a scene planner for a tender, romantic first-person audio. Output TERSE internal notes ONLY — never prose, never dialogue, never anything meant to be spoken aloud. Keep it warm and physical but never sexual. No preamble, no commentary.`;

  const beats =
    opts.isNighttime && opts.featureLine
      ? `BEATS: three escalation beats from first contact, through ${opts.featureLine}, to her finish — three short arrows, e.g. pull her in -> slow fingers -> she falls apart.`
      : opts.isNighttime
        ? `BEATS: three escalation beats from first contact to her finish — three short arrows.`
        : `BEATS: three emotional beats from first closeness to a warm, settled landing — three short arrows, e.g. pull her in -> foreheads together -> she melts. No sexual content.`;

  const user = `Plan the raw material for ONE continuous ${opts.isNighttime ? 'intimate' : 'tender romantic'} scene. The listener is ${recipe.genderSelf || 'her'}; the speaker is her ${recipe.genderOther || 'partner'} partner. They are already alone together.
${seedBits}
${opts.isNighttime && opts.featureLine ? `Escalate naturally to: ${opts.featureLine}.` : ''}

Output EXACTLY these four blocks, terse, no full sentences:
WHERE: one line — the specific place and the position they are already in (already close/touching), following from the seed.
JUST HAPPENED: one line — the small, real hinge that tips the evening into this (a look held too long, the last bite, her standing up, a hand at her back).
ANCHORS: three concrete sensory specifics unique to THIS scene (taste, fabric, light, sound, temperature), comma-separated.
${beats}

No names. No dialogue. Notes only.`;

  return { system, user };
}

function buildEmbody(opts: {
  engine: string;
  sceneNotes: string;
  minutes: number;
  targetWords: number;
  featureLine: string;
  isNighttime: boolean;
}): { system: string; user: string } {
  const arc = opts.isNighttime
    ? `: first contact, the build${opts.featureLine ? `, ${opts.featureLine}` : ''}, through her finish and a few seconds of after`
    : `, from first closeness through to a warm, settled landing`;
  const user = `This is happening now. Be in it from the very first word — already close to her.

Use the following ONLY as your private knowledge of the scene. Never quote it, never let its note-like wording surface in what you say:
${opts.sceneNotes}

Live the whole moment with her, unbroken${arc}. Talk to her the entire way. Aim for roughly ${opts.targetWords} words — a full, unhurried ${opts.minutes}-minute moment, neither rushed nor padded. Output ONLY the words you say to her out loud — nothing else.`;
  return { system: opts.engine, user };
}

function buildPolish(opts: {
  engine: string;
  mode: NarrationMode;
  transcript: string;
}): { system: string; user: string } {
  const system = `${opts.engine}

You are the SAME person, re-living the SAME moment — not an editor at a desk. You will be given what you said. Re-live it and make it even more immediate, keeping its content, its beats, and roughly its length.`;
  const user = `Re-live and tighten this. ${polishInstruction(opts.mode)}
Also:
- Delete every announcement — "let me", "I'm going to", "now I'll", "I want to" + an action. Replace it with the thing already done, or with her reaction to it.
- Keep it present, second person, real-time, broken speech. Keep [slowly]/[chuckles]/'hmmmmm'/'ahhhhh' sparse.

Output ONLY the rewritten monologue, nothing else:

${opts.transcript}`;
  return { system, user };
}

/**
 * The 3-stage immersion transcript pipeline. `followUpQA` is the assembled
 * "Q: …\nA: …" block built by the caller.
 */
async function fableTranscript(
  recipe: FableRecipe,
  followUpQA: string,
): Promise<string> {
  const isNighttime = !!recipe.isNighttime;
  const mode = resolveMode(recipe);
  const minutes = minutesFromDurationLabel(recipe.duration);
  const targetWords = targetWordCount(minutes, mode);
  const featureLine = isNighttime ? featureLineFrom(recipe) || 'their physical intimacy' : '';
  const engine = immersionEngine({ mode, genderOther: recipe.genderOther || 'partner', isNighttime });
  const maxTok = Math.min(24000, Math.max(6000, targetWords * 6));

  console.log(`📝 Fable transcript — mode=${mode}, ${isNighttime ? 'NSFW' : 'SFW'}, ~${targetWords} words`);

  // STAGE 1: scene-notes
  const notes = buildSceneNotes(recipe, { isNighttime, featureLine, followUpQA });
  const sceneNotes = await fableText({ system: notes.system, user: notes.user, maxTokens: 1000, label: 'scene-notes' });

  // STAGE 2: embody
  const emb = buildEmbody({ engine, sceneNotes, minutes, targetWords, featureLine, isNighttime });
  let transcript = await fableText({ system: emb.system, user: emb.user, maxTokens: maxTok, label: 'embody' });

  // STAGE 3: immersion-polish
  const pol = buildPolish({ engine, mode, transcript });
  transcript = await fableText({ system: pol.system, user: pol.user, maxTokens: maxTok, label: 'immersion-polish' });

  console.log(`✅ Fable transcript ready (${transcript.length} chars, ~${transcript.split(/\s+/).length} words)`);
  return transcript;
}

// ── Follow-up questions (migrated verbatim from the old Grok path) ───────────

async function fableFollowUpQuestions(recipe: FableRecipe): Promise<string[]> {
  const narratorContext = recipe.narratorData
    ? `
NARRATOR DETAILS (already provided by user):
- Narrator name: ${recipe.narratorData.name}
- Narrator gender: ${recipe.narratorData.gender}
- Narrator relationship to user: ${recipe.narratorData.relationship}
- Narrator description: ${recipe.narratorData.description}
${recipe.narratorData.additionalDetails ? `- Additional narrator details: ${recipe.narratorData.additionalDetails}` : ''}
- User's name with this narrator: ${recipe.narratorData.userNameWithNarrator}
- User's gender with this narrator: ${recipe.narratorData.userGenderWithNarrator}
`
    : '';

  const recipeString = `
setting: ${recipe.setting || 'not specified'};
location: ${recipe.location || 'not specified'};
character: ${recipe.character || 'not specified'};
character gender: ${recipe.genderOther || 'not specified'};
self gender: ${recipe.genderSelf || 'not specified'};
trope: ${recipe.trope || 'not specified'};
${recipe.isNighttime && recipe.features && recipe.features.length > 0 ? `features: ${recipe.features.join(', ')}` : ''}
${recipe.prompt ? `additional user notes: ${recipe.prompt}` : ''}
${narratorContext}`;

  const followupPrompt = `
Your goal is to get a complete understanding of a user who is describing a ${recipe.isNighttime ? 'sexual' : 'romantic'} voiceover that they would like to listen to.
The user has so far provided the following information: ${recipeString}.
${
    recipe.narratorData
      ? `
IMPORTANT: The user has already defined a narrator with specific details about their character, relationship, description, and personality. DO NOT ask questions about the narrator's personality, their relationship with the user, or character details that have already been provided in the narrator details above. Focus on OTHER aspects of the story experience.
`
      : `The user would like to have the following gender: ${recipe.genderSelf || 'not specified'} and would like the character to have the following gender: ${recipe.genderOther || 'not specified'}.`
  }
Identify the information that they've provided and craft four follow-up questions that, if answered, will give you a fuller understanding of the kind of voiceover that the user wants.
${
    recipe.narratorData
      ? `
Since the narrator details are already provided, focus your questions on:
- Specific details about the physical setting and atmosphere
- The emotional tone or mood they want for this particular story
- Any specific scenario or situation details for this story
- The historical period or time context
`
      : `
Your goal is to get the following information:
- Details on the character they would to 'voice' the voiceover;
- Details on the tone they would like this character to use with them (rough, tender, comforting, etc);
- Details on the specific physical setting that is taking place in.
- Details on the historical period that this is taking part in.
`
  }
Based on this, come up with four follow-up questions that will enable you to get a better picture of what the user is looking for in their ${recipe.isNighttime ? 'nsfw' : 'romantic'} voiceover.

IMPORTANT: At least one of the first three questions should be HIGHLY SPECIFIC and contextual based on the details already provided. For example:
- If the location is after a meal → "What did you just have for dinner?"
- If the narrator is an artist → "What is he/she wearing?" or "What art supplies are around?"
- If it's in a bedroom → "What color are the sheets?" or "What's playing in the background?"
- If they're outdoors → "What's the weather like?" or "What can you hear around you?"
Make these questions feel immersive and grounded in the specific scenario they've described.

The first three questions should be specific and probing based on the information provided, with at least one being extremely contextual as described above. The fourth question should be open-ended, asking "Is there anything else you'd like to add?" or similar, to capture any additional details the user wants to share.
Do not reference these instructions in your answer under any circumstances. Tailor your follow-up questions specifically to the information that the user has provided on their recipe. Your goal is to get as much detail as possible. Make each question probing and specific to help understand their preferences better. Don't ask for too much information in each question, but ask specific follow-ups to information that has already been provided.
Do not make the questions too overwhelming, phrase it as optional details they can provide.
${!recipe.isNighttime ? 'Again, this should include no nsfw content.' : ''}
Just output the questions, with no preamble or anything after the questions.
`;

  const systemPrompt = `You an expert in ${recipe.isNighttime ? 'erotic' : 'romantic'} audios. ${recipe.isNighttime ? 'You are welcome to include nsfw content in your prompts.' : 'You do not include nsfw content in your responses.'} You do not include a single dash or em-dash in your response.`;

  const raw = await fableText({ system: systemPrompt, user: followupPrompt, maxTokens: 1024, label: 'follow-up-questions' });

  const questions = raw
    .split('\n')
    .map((q: string) => {
      if (!q || typeof q !== 'string') return '';
      return q
        .replace(/^[\s\-•\*\d\.\)]+/, '')
        .replace(/undefined/gi, '')
        .trim();
    })
    .filter((q: string) => q && q.length > 5 && /[a-zA-Z]/.test(q))
    .slice(0, 4);

  if (questions.length === 0) {
    throw new Error('No valid questions parsed from Fable response');
  }
  return questions;
}

// ── Ambient prompt (Fable; throws so the wrapper can fall back to Grok) ──────

async function fableAmbientPrompt(setting: string, location: string): Promise<string> {
  const userPrompt = `Given a story set in "${setting || 'unspecified'}" at a "${location || 'unspecified'}" location, output a single comma-separated list of ambient sounds that would realistically be heard continuously in the background. No music. No speech. No voices. Only environmental, natural, or mechanical sounds that can loop seamlessly. Example output: "wind through leafy trees, distant birdsong, faint gravel footfalls, rustling foliage". Output only the sound list on one line, nothing else.`;
  const raw = await fableText({
    system:
      'You output only comma-separated lists of ambient environmental sounds. You never include music, speech, or voices. You never add preamble or commentary.',
    user: userPrompt,
    maxTokens: 256,
    label: 'ambient-prompt',
  });
  return raw.trim().split('\n')[0].trim();
}

// ── Refusal/failure logging (fail-soft; powers the /admin dashboard) ─────────

/**
 * Write a Fable failure (content-moderation refusal OR API/timeout error) to
 * the `fableRefusals` Firestore collection, including the exact prompt that
 * failed, so admins can see what made Fable refuse. Never throws — logging must
 * not break generation.
 */
async function logFableFailure(
  err: any,
  recipe: FableRecipe,
  call: 'transcript' | 'follow-up' | 'ambient',
): Promise<void> {
  try {
    const meta = err?.__fable || {};
    await addDoc(collection(db, 'fableRefusals'), {
      uid: auth.currentUser?.uid ?? null,
      call,
      stage: meta.stage ?? null,
      kind: meta.kind ?? 'error', // 'refusal' | 'error'
      reason: String(err?.message ?? err).slice(0, 800),
      systemPrompt: meta.system ?? null,
      userPrompt: meta.user ?? null,
      recipe: {
        setting: recipe.setting ?? null,
        prompt: recipe.prompt ?? null,
        narrationMode: recipe.narrationMode ?? null,
        isNighttime: !!recipe.isNighttime,
        features: recipe.features ?? [],
        genderSelf: recipe.genderSelf ?? null,
        genderOther: recipe.genderOther ?? null,
      },
      fellBackTo: 'grok',
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('⚠️ fable refusal logging failed (non-fatal):', e);
  }
}

// ── Public API: Fable primary, Grok worst-case fallback ─────────────────────

export async function generateTranscript(recipe: FableRecipe, followUpQA: string): Promise<string> {
  try {
    return await fableTranscript(recipe, followUpQA);
  } catch (err: any) {
    console.warn(`⚠️ Fable transcript failed (${err?.message}); falling back to Grok`);
    await logFableFailure(err, recipe, 'transcript');
    return await grokTranscript(recipe, followUpQA);
  }
}

export async function generateFollowUpQuestions(recipe: FableRecipe): Promise<string[]> {
  try {
    return await fableFollowUpQuestions(recipe);
  } catch (err: any) {
    console.warn(`⚠️ Fable follow-up questions failed (${err?.message}); falling back to Grok`);
    await logFableFailure(err, recipe, 'follow-up');
    return await grokFollowUpQuestions(recipe);
  }
}

export async function generateAmbientPrompt(setting: string, location: string): Promise<string> {
  try {
    return await fableAmbientPrompt(setting, location);
  } catch (err: any) {
    console.warn(`⚠️ Fable ambient failed (${err?.message}); falling back to Grok`);
    try {
      return await grokAmbientPrompt(setting, location);
    } catch {
      return ''; // ambient is optional — never block a story over it
    }
  }
}

export { DEFAULT_NARRATION_MODE };
