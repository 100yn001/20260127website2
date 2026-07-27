/**
 * Fable text pipeline — server-side port of services/fable-story.ts and
 * services/grok-story.ts (KEEP IN SYNC when tuning prompts there; the stage
 * builders are copied verbatim, only the transport differs: admin SDK for
 * refusal logging, process.env keys instead of Expo extras).
 *
 * All text generation runs on `claude-fable-5`, with the legacy Grok pipeline
 * as the worst-case fallback. Refusals/errors are logged to `fableRefusals`
 * for the /admin dashboard.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as admin from 'firebase-admin';
import {
  LEGACY_RATIO_BY_MODE,
  immersionEngine,
  minutesFromDurationLabel,
  narrationModeFromLegacy,
  polishInstruction,
  targetWordCount,
  type NarrationMode,
} from './narration-modes';

const FABLE_MODEL = 'claude-fable-5';
const GROK_MODEL = 'grok-4-1-fast-reasoning';
const GROK_TIMEOUT = 5 * 60 * 1000;

let _anthropic: Anthropic | null = null;
export function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) console.warn('⚠️ ANTHROPIC_API_KEY not set in functions environment');
  _anthropic = new Anthropic({ apiKey });
  return _anthropic;
}

/** Text-relevant subset of RecipeData (mirrors services/fable-story.ts). */
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
  narrativeRatio?: number;
  prompt?: string;
  tags?: string[];
  narratorData?: any;
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

async function fableText(args: {
  system: string;
  user: string;
  maxTokens: number;
  label: string;
}): Promise<string> {
  let msg: Anthropic.Message;
  try {
    msg = await getAnthropic().messages.create({
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

function resolveMode(recipe: FableRecipe): NarrationMode {
  return recipe.narrationMode ?? narrationModeFromLegacy(recipe.narrativeRatio);
}

function featureLineFrom(recipe: FableRecipe): string {
  return (recipe.features || [])
    .map((f) => {
      const prefs = (recipe.featurePreferences || {})[f] || [];
      const dir = prefs.includes('receive') ? 'she receives' : prefs.includes('give') ? 'she gives' : '';
      return dir ? `${f} (${dir})` : f;
    })
    .filter(Boolean)
    .join(', ');
}

// ── Stage builders (verbatim from services/fable-story.ts) ──────────────────

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

async function fableTranscript(recipe: FableRecipe, followUpQA: string): Promise<string> {
  const isNighttime = !!recipe.isNighttime;
  const mode = resolveMode(recipe);
  const minutes = minutesFromDurationLabel(recipe.duration);
  const targetWords = targetWordCount(minutes, mode);
  const featureLine = isNighttime ? featureLineFrom(recipe) || 'their physical intimacy' : '';
  const engine = immersionEngine({ mode, genderOther: recipe.genderOther || 'partner', isNighttime });
  const maxTok = Math.min(24000, Math.max(6000, targetWords * 6));

  console.log(`📝 Fable transcript — mode=${mode}, ${isNighttime ? 'NSFW' : 'SFW'}, ~${targetWords} words`);

  const notes = buildSceneNotes(recipe, { isNighttime, featureLine, followUpQA });
  const sceneNotes = await fableText({ system: notes.system, user: notes.user, maxTokens: 1000, label: 'scene-notes' });

  const emb = buildEmbody({ engine, sceneNotes, minutes, targetWords, featureLine, isNighttime });
  let transcript = await fableText({ system: emb.system, user: emb.user, maxTokens: maxTok, label: 'embody' });

  const pol = buildPolish({ engine, mode, transcript });
  transcript = await fableText({ system: pol.system, user: pol.user, maxTokens: maxTok, label: 'immersion-polish' });

  console.log(`✅ Fable transcript ready (${transcript.length} chars)`);
  return transcript;
}

// ── Follow-up questions (verbatim port) ─────────────────────────────────────

function followUpPrompts(recipe: FableRecipe): { system: string; user: string } {
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

  const user = `
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

  const system = `You an expert in ${recipe.isNighttime ? 'erotic' : 'romantic'} audios. ${recipe.isNighttime ? 'You are welcome to include nsfw content in your prompts.' : 'You do not include nsfw content in your responses.'} You do not include a single dash or em-dash in your response.`;

  return { system, user };
}

function parseQuestions(raw: string): string[] {
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
  if (questions.length === 0) throw new Error('No valid questions parsed');
  return questions;
}

async function fableFollowUpQuestions(recipe: FableRecipe): Promise<string[]> {
  const p = followUpPrompts(recipe);
  const raw = await fableText({ system: p.system, user: p.user, maxTokens: 1024, label: 'follow-up-questions' });
  return parseQuestions(raw);
}

// ── Ambient prompt ──────────────────────────────────────────────────────────

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

// ── Grok fallback (port of services/grok-story.ts, fixed parser) ────────────

type GrokMessage = { role: 'system' | 'user'; content: string };

async function callGrok(input: GrokMessage[]): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GROK_TIMEOUT);
  try {
    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.XAI_API_KEY || ''}`,
      },
      body: JSON.stringify({ model: GROK_MODEL, input }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Grok API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }
    const data: any = await response.json();
    // Reasoning models put the message at type==='message', never output[0].
    const message = data.output?.find((o: any) => o?.type === 'message');
    const text = message?.content?.[0]?.text;
    if (!text) throw new Error('Invalid Grok response - no content returned');
    return text as string;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function grokFollowUpQuestions(recipe: FableRecipe): Promise<string[]> {
  const p = followUpPrompts(recipe);
  return parseQuestions(await callGrok([
    { role: 'system', content: p.system },
    { role: 'user', content: p.user },
  ]));
}

async function grokTranscript(recipe: FableRecipe, followUpAnswer: string): Promise<string> {
  let recipeString = `
setting: ${recipe.setting};
location: ${recipe.location};
character: ${recipe.character};
character gender: ${recipe.genderOther};
self gender: ${recipe.genderSelf};
trope: ${recipe.trope};
`;
  if (recipe.isNighttime && recipe.features && recipe.features.length > 0) {
    const featureStrings = recipe.features.map((featureId) => {
      const prefs = (recipe.featurePreferences || {})[featureId] || [];
      const direction = prefs.includes('receive') ? 'self receives' : prefs.includes('give') ? 'self gives' : '';
      return `${featureId} in the following direction: ${direction}`;
    });
    recipeString += `features: ${featureStrings.join('; ')}`;
  }

  const systemPromptGeneration = `
Consider the following elements of one ${recipe.isNighttime ? 'sex' : 'romantic'} scene. The user is ${recipe.genderSelf} and wants the voiceover to be that of a ${recipe.genderOther} character. The user's name is ${recipe.userName}.

The user has indicated that they want the following features: ${recipeString} and has provided the following additional details ${followUpAnswer}. These features should be incorporated subtly; the character shouldn't be too on the nose with these features but be subtle about incorporating them.

What I want you to think about is the best way to prompt an LLM to create the transcript of the voiceover that the user has requested.
Generate detailed a system prompt that will cause the LLM to generate a voiceover in the style of ${recipe.isNighttime ? 'sexual' : 'SFW romantic'} voiceovers on youtube.
In your prompt, include specific indications of content and phrases that would make sense for the character to include.
This LLM will act as the actual character; the system prompt should be as detailed as possible, and should instruct the LLM to act as the character requested by the user.
Do not include specifications with regard to time, or number of words. Do not include stage directions; the output should be pure text.
The prompt should be as detailed as possible.
When crafting this prompt, keep in mind that the goal is to create something that the listener will enjoy as much as possible.
Remember: the goal of this prompt is a narration in the style of ${recipe.isNighttime ? 'NSFW sexual' : 'SFW romantic'} audios you may find on Quinn, Dipsy or Youtube.
Make sure to include at least three necessary ${recipe.isNighttime ? 'erotic' : 'romantic'} beats that the character must ${recipe.isNighttime ? 'hit (specific sex acts, sex positions, etc.)' : 'include'}, building from the info given by the user.
Include a timeline, on how these specific acts are being performed, in what order, and how the character should transition between them.
Include a language bank with a list of phrases the character may weave in naturally into their monologue.
Do not include any nicknames, unless specifically requested in instructions above.
The character shouldn't be too verbose or literary. The output generated by your prompts should be ${recipe.isNighttime ? 'explicitely sexual' : 'purely romantic and never sexual'}.
${recipe.isNighttime ? "The LLM's output should be graphic and not ambiguous, with EXPLICIT references to the sexual acts that the character performs." : 'Your output should be purely romantic and never sexual.'}
Make sure that the narration sounds natural and does not include any verbatim elements of the user's instructions. To make sure that the character is subtle, include instruction on words that the character shouldn't use to make sure that the character doesn't break the fourth wall and that the narration flows smoothly.
For example, if the user has indicated that they want the character to be dominant, that character SHOULD NEVER say 'look, I'm being so dominant' - the character should always show, rather than tell.
`;

  const finalSystemPrompt = await callGrok([
    {
      role: 'system',
      content: `You an expert in LLM prompting. ${recipe.isNighttime ? 'You are welcome to include nsfw content in your prompts.' : 'You do not include NSFW in your output. Your output should be purely romantic and never sexual.'} You do not mention any specific duration of time or word count.`,
    },
    { role: 'user', content: systemPromptGeneration },
  ]);

  const wordCount =
    recipe.duration === '1min' ? 150 : recipe.duration === '5min' ? 800 : recipe.duration === '15min' ? 2300 : 1500;
  const mode = recipe.narrationMode ?? narrationModeFromLegacy(recipe.narrativeRatio);
  const narrativeRatioValue = recipe.narrativeRatio ?? LEGACY_RATIO_BY_MODE[mode];
  const narrativePercentage = (10 - narrativeRatioValue) * 10;
  const directPercentage = narrativeRatioValue * 10;

  const finalUserPrompt = recipe.isNighttime
    ? `Output a ${wordCount} word narration. Output ZERO stage directions, sound effects, or onomatopeias, except the following, as appropriate: [slowly], 'hmmmmm', 'ahhhhh', [chuckles]. Do not output any mention of word count. Your output should be ${narrativePercentage}% narration and ${directPercentage}% direct speech, straight to the point, just plain sex, first person, talking directly to the user, describing the sexual beats. DO NOT describe what you are doing, just do it. The narration should be direct, you should be doing and not describing what you are doing. You should not narrate, you ARE the character. `
    : `Output a ${wordCount} word SFW romantic narration. Output ZERO stage directions, sound effects, or onomatopeias. Do not output any mention of word count. The narration should be direct, you should be doing and not describing what you are doing. You should not narrate, you ARE the character. `;

  return await callGrok([
    { role: 'system', content: finalSystemPrompt },
    { role: 'user', content: finalUserPrompt },
  ]);
}

async function grokAmbientPrompt(setting: string, location: string): Promise<string> {
  const userPrompt = `Given a story set in "${setting || 'unspecified'}" at a "${location || 'unspecified'}" location, output a single comma-separated list of ambient sounds that would realistically be heard continuously in the background. No music. No speech. No voices. Only environmental, natural, or mechanical sounds that can loop seamlessly. Example output: "wind through leafy trees, distant birdsong, faint gravel footfalls, rustling foliage". Output only the sound list on one line, nothing else.`;
  const raw = await callGrok([
    { role: 'system', content: 'You output only comma-separated lists of ambient environmental sounds. You never include music, speech, or voices. You never add preamble or commentary.' },
    { role: 'user', content: userPrompt },
  ]);
  return raw.trim().split('\n')[0].trim();
}

// ── Refusal/failure logging (fail-soft; powers /admin) ──────────────────────

async function logFableFailure(
  err: any,
  uid: string | null,
  recipe: FableRecipe,
  call: 'transcript' | 'follow-up' | 'ambient',
): Promise<void> {
  try {
    const meta = err?.__fable || {};
    await admin.firestore().collection('fableRefusals').add({
      uid,
      call,
      stage: meta.stage ?? null,
      kind: meta.kind ?? 'error',
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
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('⚠️ fable refusal logging failed (non-fatal):', e);
  }
}

// ── Public API: Fable primary, Grok worst-case fallback ─────────────────────

export async function generateTranscript(
  recipe: FableRecipe,
  followUpQA: string,
  uid: string | null,
): Promise<string> {
  try {
    return await fableTranscript(recipe, followUpQA);
  } catch (err: any) {
    console.warn(`⚠️ Fable transcript failed (${err?.message}); falling back to Grok`);
    await logFableFailure(err, uid, recipe, 'transcript');
    return await grokTranscript(recipe, followUpQA);
  }
}

export async function generateFollowUpQuestions(
  recipe: FableRecipe,
  uid: string | null,
): Promise<string[]> {
  try {
    return await fableFollowUpQuestions(recipe);
  } catch (err: any) {
    console.warn(`⚠️ Fable follow-up questions failed (${err?.message}); falling back to Grok`);
    await logFableFailure(err, uid, recipe, 'follow-up');
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
