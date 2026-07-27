/**
 * Grok Story Service — the PREVIOUS (pre-Fable) text pipeline, kept as a
 * worst-case FALLBACK. Fable (claude-fable-5) is primary everywhere; if a Fable
 * text stage fails (refusal or error), the wrapper in services/fable-story.ts
 * logs it and calls the matching Grok function here so the user still gets a
 * story. Ported verbatim from the old audio-generation Grok logic.
 */

import Constants from 'expo-constants';
import {
  LEGACY_RATIO_BY_MODE,
  narrationModeFromLegacy,
} from '@/constants/narration-modes';
import type { FableRecipe } from './fable-story';

const XAI_API_KEY = Constants.expoConfig?.extra?.XAI || '';
const GROK_TIMEOUT = 5 * 60 * 1000;

type GrokMessage = { role: 'system' | 'user'; content: string };

async function callGrok(input: GrokMessage[]): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GROK_TIMEOUT);
  try {
    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({ model: 'grok-4-1-fast-reasoning', input }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Grok API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }
    const data = await response.json();
    // Reasoning models (grok-4-1-fast-reasoning) return output[0] as the
    // reasoning block (no text); the actual message is the `type: 'message'`
    // entry. Never index output[0] directly.
    const message = data.output?.find((o: any) => o?.type === 'message');
    const text = message?.content?.[0]?.text;
    if (!text) throw new Error('Invalid Grok response - no content returned');
    return text as string;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Follow-up questions (Grok) ──────────────────────────────────────────────
export async function grokFollowUpQuestions(recipe: FableRecipe): Promise<string[]> {
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

IMPORTANT: At least one of the first three questions should be HIGHLY SPECIFIC and contextual based on the details already provided.
The first three questions should be specific and probing based on the information provided, with at least one being extremely contextual. The fourth question should be open-ended, asking "Is there anything else you'd like to add?" or similar.
Do not reference these instructions in your answer under any circumstances.
${!recipe.isNighttime ? 'Again, this should include no nsfw content.' : ''}
Just output the questions, with no preamble or anything after the questions.
`;

  const systemPrompt = `You an expert in ${recipe.isNighttime ? 'erotic' : 'romantic'} audios. ${recipe.isNighttime ? 'You are welcome to include nsfw content in your prompts.' : 'You do not include nsfw content in your responses.'} You do not include a single dash or em-dash in your response.`;

  const raw = await callGrok([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: followupPrompt },
  ]);

  const questions = raw
    .split('\n')
    .map((q: string) =>
      q
        .replace(/^[\s\-•\*\d\.\)]+/, '')
        .replace(/undefined/gi, '')
        .trim(),
    )
    .filter((q: string) => q && q.length > 5 && /[a-zA-Z]/.test(q))
    .slice(0, 4);
  if (questions.length === 0) throw new Error('No valid questions parsed from Grok response');
  return questions;
}

// ── Transcript (Grok 2-stage: system-prompt → transcript) ───────────────────
export async function grokTranscript(recipe: FableRecipe, followUpAnswer: string): Promise<string> {
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

// ── Ambient prompt (Grok) ───────────────────────────────────────────────────
export async function grokAmbientPrompt(setting: string, location: string): Promise<string> {
  const userPrompt = `Given a story set in "${setting || 'unspecified'}" at a "${location || 'unspecified'}" location, output a single comma-separated list of ambient sounds that would realistically be heard continuously in the background. No music. No speech. No voices. Only environmental, natural, or mechanical sounds that can loop seamlessly. Example output: "wind through leafy trees, distant birdsong, faint gravel footfalls, rustling foliage". Output only the sound list on one line, nothing else.`;
  const raw = await callGrok([
    { role: 'system', content: 'You output only comma-separated lists of ambient environmental sounds. You never include music, speech, or voices. You never add preamble or commentary.' },
    { role: 'user', content: userPrompt },
  ]);
  return raw.trim().split('\n')[0].trim();
}
