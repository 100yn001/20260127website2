/**
 * Audio Generation Service
 * Calls Grok and ElevenLabs APIs directly from React Native
 * No backend server needed - fully self-contained!
 */

import { DEFAULT_COVER_COLOR } from '@/constants/cover-colors';
import { DepthLayer } from '@/types/story';
import Constants from 'expo-constants';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { saveStory, uploadAmbient, uploadAudioChunk } from './story-service';
import { checkAndIncrementDailyStoryCount } from './user-service';

// Get API keys from Expo environment variables
const XAI_API_KEY = Constants.expoConfig?.extra?.XAI || '';
const ELEVENLABS_API_KEY = Constants.expoConfig?.extra?.ELEVENLABS || '';

// Debug logging (remove in production)
if (!XAI_API_KEY) {
  console.warn('⚠️ XAI API key not found in environment');
}
if (!ELEVENLABS_API_KEY) {
  console.warn('⚠️ ELEVENLABS API key not found in environment');
}

const VOICE_IDS = {
  male: 'Qe9WSybioZxssVEwlBSo',
  female: 'LEnmbrrxYsUYS7vsRRwD',
};

// Maximum characters per chunk — kept well under ElevenLabs limit (5000)
// so each chunk generates quickly and doesn't risk timing out
const MAX_CHUNK_SIZE = 1000; // eleven_v3 has a lower char limit than older models

// Hard ceiling defense — ElevenLabs v1/text-to-speech returns 400
// ("text_too_long") for payloads over 5000 chars. If anything slips past the
// sentence-aware splitter above this limit, brute-split it at word/char
// boundaries before the API call.
const HARD_TTS_LIMIT = 4500;

function enforceHardLimit(chunks: string[]): string[] {
  const out: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= HARD_TTS_LIMIT) {
      out.push(chunk);
      continue;
    }
    console.warn(
      `⚠️ TTS chunk ${chunk.length} chars exceeds HARD_TTS_LIMIT ${HARD_TTS_LIMIT} — re-splitting`,
    );
    let rem = chunk;
    while (rem.length > HARD_TTS_LIMIT) {
      const head = rem.slice(0, HARD_TTS_LIMIT);
      const lastSpace = head.lastIndexOf(' ');
      const cut = lastSpace > HARD_TTS_LIMIT * 0.5 ? lastSpace : HARD_TTS_LIMIT;
      out.push(head.slice(0, cut).trim());
      rem = rem.slice(cut).trim();
    }
    if (rem.length > 0) out.push(rem);
  }
  return out;
}

/**
 * Split text into chunks at sentence boundaries, each under MAX_CHUNK_SIZE chars.
 * Ensures we don't cut mid-sentence for natural audio flow.
 */
function splitTextIntoChunks(text: string): string[] {
  if (text.length <= MAX_CHUNK_SIZE) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK_SIZE) {
      chunks.push(remaining.trim());
      break;
    }

    // Find the last sentence boundary within the limit
    const searchArea = remaining.substring(0, MAX_CHUNK_SIZE);
    
    // Look for sentence endings: . ! ? followed by space or end
    let splitIndex = -1;
    
    // Search backwards from the limit for a good split point
    for (let i = searchArea.length - 1; i >= 0; i--) {
      const char = searchArea[i];
      if ((char === '.' || char === '!' || char === '?') && 
          (i === searchArea.length - 1 || searchArea[i + 1] === ' ' || searchArea[i + 1] === '\n')) {
        splitIndex = i + 1;
        break;
      }
    }

    // If no sentence boundary found, look for paragraph breaks
    if (splitIndex === -1) {
      const lastNewline = searchArea.lastIndexOf('\n');
      if (lastNewline > MAX_CHUNK_SIZE * 0.5) {
        splitIndex = lastNewline + 1;
      }
    }

    // If still no good split point, look for comma or semicolon
    if (splitIndex === -1) {
      for (let i = searchArea.length - 1; i >= MAX_CHUNK_SIZE * 0.5; i--) {
        if (searchArea[i] === ',' || searchArea[i] === ';') {
          splitIndex = i + 1;
          break;
        }
      }
    }

    // Last resort: split at word boundary
    if (splitIndex === -1) {
      const lastSpace = searchArea.lastIndexOf(' ');
      splitIndex = lastSpace > 0 ? lastSpace + 1 : MAX_CHUNK_SIZE;
    }

    chunks.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }

  console.log(`📝 Split transcript into ${chunks.length} chunks:`, chunks.map(c => c.length));
  return chunks;
}

/**
 * Fetch audio from ElevenLabs and save directly to a temp file.
 * Uses react-native-blob-util to bypass React Native Blob limitations.
 */
async function fetchAudioChunkToFile(
  text: string,
  voiceId: string,
): Promise<string> {
  const response = await ReactNativeBlobUtil.config({
    fileCache: true,
    appendExt: 'mp3',
    timeout: 90000, // 90 seconds per chunk
  }).fetch(
    'POST',
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY,
    },
    JSON.stringify({
      text,
      model_id: 'eleven_v3',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5,
      },
    }),
  );

  const { status } = response.respInfo;
  if (status !== 200) {
    const errorBody = await response.text();
    throw new Error(`ElevenLabs API error: ${status} - ${errorBody}`);
  }

  return response.path();
}

/**
 * Strip ID3v2 header from base64-encoded MP3 data.
 * This ensures the player calculates duration from CBR file size
 * rather than per-chunk metadata headers.
 */
function stripID3FromBase64(base64Data: string): string {
  // Decode first 10 bytes (need 14 base64 chars to cover 10 bytes)
  const headerSlice = atob(base64Data.substring(0, 16));
  
  // Check for "ID3" magic bytes
  if (headerSlice.charCodeAt(0) === 0x49 &&
      headerSlice.charCodeAt(1) === 0x44 &&
      headerSlice.charCodeAt(2) === 0x33) {
    // Parse synchsafe integer size from bytes 6-9
    const tagSize = ((headerSlice.charCodeAt(6) & 0x7F) << 21) |
                    ((headerSlice.charCodeAt(7) & 0x7F) << 14) |
                    ((headerSlice.charCodeAt(8) & 0x7F) << 7) |
                    (headerSlice.charCodeAt(9) & 0x7F);
    const totalHeaderBytes = 10 + tagSize;
    
    // Align to 3-byte boundary for clean base64 slicing
    const alignedBytes = Math.ceil(totalHeaderBytes / 3) * 3;
    const base64CharsToSkip = (alignedBytes / 3) * 4;
    
    console.log(`🔧 Stripped ID3v2 header: ${totalHeaderBytes} bytes`);
    return base64Data.substring(base64CharsToSkip);
  }
  
  return base64Data;
}

/**
 * Combine multiple audio chunk files into a single file.
 * Strips ID3v2 headers from all chunks so the player uses
 * CBR file-size-based duration estimation (correct for concatenated files).
 */
async function combineAudioFiles(filePaths: string[]): Promise<string> {
  if (filePaths.length === 1) return filePaths[0];

  const combinedPath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/combined_${Date.now()}.mp3`;

  // Write first chunk (strip ID3 header so no stale duration metadata)
  const firstBase64 = await ReactNativeBlobUtil.fs.readFile(filePaths[0], 'base64');
  await ReactNativeBlobUtil.fs.writeFile(combinedPath, stripID3FromBase64(firstBase64), 'base64');

  // Append remaining chunks (strip ID3 headers)
  for (let i = 1; i < filePaths.length; i++) {
    const chunkBase64 = await ReactNativeBlobUtil.fs.readFile(filePaths[i], 'base64');
    await ReactNativeBlobUtil.fs.appendFile(combinedPath, stripID3FromBase64(chunkBase64), 'base64');
  }

  return combinedPath;
}

/**
 * Ask Grok for a short, comma-separated SFX description that can be
 * fed to ElevenLabs SFX v2 as a seamless-loop ambient bed.
 * Returns empty string if the call fails — caller should treat as optional.
 */
async function generateAmbientPrompt(setting: string, location: string): Promise<string> {
  const userPrompt = `Given a story set in "${setting || 'unspecified'}" at a "${location || 'unspecified'}" location, output a single comma-separated list of ambient sounds that would realistically be heard continuously in the background. No music. No speech. No voices. Only environmental, natural, or mechanical sounds that can loop seamlessly. Example output: "wind through leafy trees, distant birdsong, faint gravel footfalls, rustling foliage". Output only the sound list on one line, nothing else.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    let response;
    try {
      response = await fetch('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'grok-4-1-fast-reasoning',
          input: [
            { role: 'system', content: 'You output only comma-separated lists of ambient environmental sounds. You never include music, speech, or voices. You never add preamble or commentary.' },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) return '';
    const data = await response.json();
    const text = data.output?.[0]?.content?.[0]?.text || '';
    return text.trim().split('\n')[0].trim();
  } catch (err) {
    console.warn('Ambient prompt generation failed:', err);
    return '';
  }
}

/**
 * Call ElevenLabs SFX v2 to produce a 30s seamless ambient loop.
 * Returns the local cache file path, or null on failure.
 */
async function fetchAmbientClipToFile(prompt: string): Promise<string | null> {
  try {
    const response = await ReactNativeBlobUtil.config({
      fileCache: true,
      appendExt: 'mp3',
      timeout: 90_000,
    }).fetch(
      'POST',
      'https://api.elevenlabs.io/v1/sound-generation',
      {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      JSON.stringify({
        text: prompt,
        duration_seconds: 30,
        loop: true,
        prompt_influence: 0.3,
      }),
    );
    const { status } = response.respInfo;
    if (status !== 200) {
      console.warn('ElevenLabs SFX error:', status, await response.text());
      return null;
    }
    return response.path();
  } catch (err) {
    console.warn('Ambient clip generation failed:', err);
    return null;
  }
}

interface RecipeData {
  userName: string;
  setting: string;
  location: string;
  character: string;
  genderSelf: string;
  genderOther: string;
  trope: string;
  features: string[];
  featurePreferences: Record<string, string[]>;
  isNighttime: boolean;
  duration?: string;
  narrativeRatio?: number;
  voiceId?: string;
  prompt?: string; // From create tab
  tags?: string[]; // From recipe tab
  narratorId?: string; // For narrator-based stories
  narratorData?: any; // Full narrator data for context
  coverColor?: string; // User-assigned cover color
  ambientMode?: 'auto' | 'off' | 'custom'; // User-selected ambient mode; defaults to 'auto'
  ambientCustomPrompt?: string; // User-supplied ambient prompt when ambientMode === 'custom'
  /** Up to two discrete background-sound prompts from the picker; preferred over ambientMode/customPrompt when set. */
  ambientPrompts?: string[];
}

/**
 * Generate random depth layers for topographic artwork
 */
function generateDepthLayers(count: number = 12): DepthLayer[] {
  const layers: DepthLayer[] = [];
  for (let i = 0; i < count; i++) {
    layers.push({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 20 + Math.random() * 50,
      opacity: 0.2 + Math.random() * 0.5,
      depth: Math.random(),
    });
  }
  return layers;
}

/**
 * Generate follow-up questions using Grok API
 */
export async function generateFollowUpQuestions(recipe: RecipeData): Promise<string[]> {
  // Build narrator context if present
  const narratorContext = recipe.narratorData ? `
NARRATOR DETAILS (already provided by user):
- Narrator name: ${recipe.narratorData.name}
- Narrator gender: ${recipe.narratorData.gender}
- Narrator relationship to user: ${recipe.narratorData.relationship}
- Narrator description: ${recipe.narratorData.description}
${recipe.narratorData.additionalDetails ? `- Additional narrator details: ${recipe.narratorData.additionalDetails}` : ''}
- User's name with this narrator: ${recipe.narratorData.userNameWithNarrator}
- User's gender with this narrator: ${recipe.narratorData.userGenderWithNarrator}
` : '';

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
${recipe.narratorData ? `
IMPORTANT: The user has already defined a narrator with specific details about their character, relationship, description, and personality. DO NOT ask questions about the narrator's personality, their relationship with the user, or character details that have already been provided in the narrator details above. Focus on OTHER aspects of the story experience.
` : `The user would like to have the following gender: ${recipe.genderSelf || 'not specified'} and would like the character to have the following gender: ${recipe.genderOther || 'not specified'}.`}
Identify the information that they've provided and craft four follow-up questions that, if answered, will give you a fuller understanding of the kind of voiceover that the user wants.
${recipe.narratorData ? `
Since the narrator details are already provided, focus your questions on:
- Specific details about the physical setting and atmosphere
- The emotional tone or mood they want for this particular story
- Any specific scenario or situation details for this story
- The historical period or time context
` : `
Your goal is to get the following information:
- Details on the character they would to 'voice' the voiceover;
- Details on the tone they would like this character to use with them (rough, tender, comforting, etc);
- Details on the specific physical setting that is taking place in.
- Details on the historical period that this is taking part in.
`}
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

  // Log recipe payload for debugging
  console.log('\n========================================');
  console.log('📝 RECIPE PAYLOAD SENT TO FOLLOW-UP API');
  console.log('========================================');
  console.log(JSON.stringify(recipe, null, 2));
  console.log('========================================\n');

  try {
    // Reasoning models need longer timeouts (5 minutes)
    const GROK_TIMEOUT = 5 * 60 * 1000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GROK_TIMEOUT);
    
    let response;
    try {
      response = await fetch('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'grok-4-1-fast-reasoning',
          input: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: followupPrompt },
          ],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Grok API error:', response.status, errorText);
      throw new Error(`Grok API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Grok API response:', JSON.stringify(data, null, 2));

    // New Responses API format: output[0].content[0].text
    if (!data.output || data.output.length === 0 || !data.output[0].content || data.output[0].content.length === 0) {
      console.error('Invalid Grok response structure:', JSON.stringify(data).substring(0, 500));
      throw new Error('No response from Grok API');
    }

    const questionsText = data.output[0].content[0].text || '';

    // Parse questions from response - clean up any undefined or empty values
    const questions = questionsText
      .split('\n')
      .map((q: string) => {
        if (!q || typeof q !== 'string') return '';
        // Remove numbering, bullets, dashes, and trim
        return q
          .replace(/^[\s\-•\*\d\.\)]+/, '')
          .replace(/undefined/gi, '')
          .trim();
      })
      .filter((q: string) => q && q.length > 5 && /[a-zA-Z]/.test(q))
      .slice(0, 4);

    // Ensure we have valid questions
    if (questions.length === 0) {
      throw new Error('No valid questions parsed from response');
    }

    return questions;
  } catch (error) {
    console.error('Error generating follow-up questions:', error);
    throw error;
  }
}

/**
 * Generate complete audio story from recipe
 * Includes follow-up answers from user
 * Automatically uploads to Firebase Storage and saves metadata to Firestore
 */
export async function generateAudioStory(
  recipe: RecipeData,
  followUpQuestions: string[],
  followUpAnswers: string[],
  userId: string
): Promise<{ audioUrl: string; audioChunkURLs: string[]; transcript: string; storyId: string }> {

  // Beta cap: 5 stories/day. Throws DailyStoryLimitError if the user is at
  // their limit, in which case we want to surface to the UI before any
  // expensive Grok/ElevenLabs calls happen. Atomic via Firestore txn.
  await checkAndIncrementDailyStoryCount(userId);

  // Combine questions and answers into Q&A pairs
  const followUpQA = followUpQuestions.map((q, i) => {
    const answer = followUpAnswers[i] || '';
    return answer ? `Q: ${q}\nA: ${answer}` : '';
  }).filter(Boolean).join('\n\n');
  
  const followUpAnswer = followUpQA || followUpAnswers.join(' ');
  
  // Build recipe string with features
  let recipeString = `
setting: ${recipe.setting};
location: ${recipe.location};
character: ${recipe.character};
character gender: ${recipe.genderOther};
self gender: ${recipe.genderSelf};
trope: ${recipe.trope};
`;

  if (recipe.isNighttime && recipe.features.length > 0) {
    const featureStrings = recipe.features.map((featureId) => {
      const prefs = recipe.featurePreferences[featureId] || [];
      const direction = prefs.includes('receive') ? 'self receives' : prefs.includes('give') ? 'self gives' : '';
      return `${featureId} in the following direction: ${direction}`;
    });
    recipeString += `features: ${featureStrings.join('; ')}`;
  }

  // STEP 1: Generate system prompt using Grok
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

  try {
    // STEP 1: Generate system prompt
    console.log('📝 Step 1: Generating system prompt...');
    
    // Reasoning models need longer timeouts (5 minutes)
    const GROK_TIMEOUT = 5 * 60 * 1000;
    const systemPromptController = new AbortController();
    const systemPromptTimeout = setTimeout(() => systemPromptController.abort(), GROK_TIMEOUT);
    
    let systemPromptResponse;
    try {
      systemPromptResponse = await fetch('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'grok-4-1-fast-reasoning',
          input: [
            {
              role: 'system',
              content: `You an expert in LLM prompting. ${recipe.isNighttime ? 'You are welcome to include nsfw content in your prompts.' : 'You do not include NSFW in your output. Your output should be purely romantic and never sexual.'} You do not mention any specific duration of time or word count.`,
            },
            { role: 'user', content: systemPromptGeneration },
          ],
        }),
        signal: systemPromptController.signal,
      });
    } finally {
      clearTimeout(systemPromptTimeout);
    }

    if (!systemPromptResponse.ok) {
      const errorText = await systemPromptResponse.text();
      console.error('❌ Grok API error (system prompt):', systemPromptResponse.status, errorText);
      throw new Error(`Grok API error: ${systemPromptResponse.status} - ${errorText.substring(0, 200)}`);
    }

    const systemPromptData = await systemPromptResponse.json();
    // New Responses API format: output[0].content[0].text
    if (!systemPromptData.output?.[0]?.content?.[0]?.text) {
      console.error('❌ Invalid Grok response (system prompt):', JSON.stringify(systemPromptData).substring(0, 500));
      throw new Error('Invalid response from Grok API - no content returned');
    }
    const finalSystemPrompt = systemPromptData.output[0].content[0].text;
    console.log('✅ System prompt generated successfully');

    // STEP 2: Generate transcript
    // Calculate word count based on duration
    const wordCount = recipe.duration === '1min' ? 150 : recipe.duration === '5min' ? 800 : recipe.duration === '15min' ? 2300 : 1500;
    
    // Calculate narrative/direct ratio
    const narrativeRatioValue = recipe.narrativeRatio ?? 5; // Default to 50/50 if not provided
    const narrativePercentage = ((10 - narrativeRatioValue) * 10); // narrative = 100% when ratio is 0
    const directPercentage = (narrativeRatioValue * 10); // direct = 100% when ratio is 10
    
    const finalUserPrompt = recipe.isNighttime
      ? `Output a ${wordCount} word narration. Output ZERO stage directions, sound effects, or onomatopeias, except the following, as appropriate: [slowly], 'hmmmmm', 'ahhhhh', [chuckles]. Do not output any mention of word count. Your output should be ${narrativePercentage}% narration and ${directPercentage}% direct speech, straight to the point, just plain sex, first person, talking directly to the user, describing the sexual beats. DO NOT describe what you are doing, just do it. The narration should be direct, you should be doing and not describing what you are doing. You should not narrate, you ARE the character. `
      : `Output a ${wordCount} word SFW romantic narration. Output ZERO stage directions, sound effects, or onomatopeias. Do not output any mention of word count. The narration should be direct, you should be doing and not describing what you are doing. You should not narrate, you ARE the character. `;

    console.log('📝 Step 2: Generating transcript...');
    const transcriptController = new AbortController();
    const transcriptTimeout = setTimeout(() => transcriptController.abort(), GROK_TIMEOUT);
    
    let transcriptResponse;
    try {
      transcriptResponse = await fetch('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'grok-4-1-fast-reasoning',
          input: [
            { role: 'system', content: finalSystemPrompt },
            { role: 'user', content: finalUserPrompt },
          ],
        }),
        signal: transcriptController.signal,
      });
    } finally {
      clearTimeout(transcriptTimeout);
    }

    if (!transcriptResponse.ok) {
      const errorText = await transcriptResponse.text();
      console.error('❌ Grok API error (transcript):', transcriptResponse.status, errorText);
      throw new Error(`Grok API error: ${transcriptResponse.status} - ${errorText.substring(0, 200)}`);
    }

    const transcriptData = await transcriptResponse.json();
    // New Responses API format: output[0].content[0].text
    if (!transcriptData.output?.[0]?.content?.[0]?.text) {
      console.error('❌ Invalid Grok response (transcript):', JSON.stringify(transcriptData).substring(0, 500));
      throw new Error('Invalid response from Grok API - no transcript content returned');
    }
    const transcript = transcriptData.output[0].content[0].text;
    console.log('✅ Transcript generated successfully, length:', transcript.length);

    // STEP 3: Generate audio with ElevenLabs (with chunking for long transcripts)
    // Use the selected voice ID if provided, otherwise fall back to default based on gender
    const voiceId = recipe.voiceId || VOICE_IDS[recipe.genderOther as 'male' | 'female'];

    console.log('🎤 Generating audio with ElevenLabs using voice:', voiceId);
    
    // Always chunk the transcript for reliable, fast generation. Then pass
    // through the hard-limit enforcer so nothing over 4500 chars ever hits
    // the ElevenLabs API.
    const chunks = enforceHardLimit(splitTextIntoChunks(transcript));
    const longest = chunks.reduce((m, c) => Math.max(m, c.length), 0);
    console.log(`📝 Split into ${chunks.length} chunk(s) for TTS (longest=${longest} chars)`);

    // STEP 3a: Kick off ambient generation in parallel with narration chunks.
    // New path: recipe.ambientPrompts (up to 2 discrete sources from the picker).
    // Legacy path: recipe.ambientMode ('auto' | 'off' | 'custom') + ambientCustomPrompt.
    const ambientPrompts: string[] = (recipe.ambientPrompts || [])
      .map((p) => (p || '').trim())
      .filter(Boolean)
      .slice(0, 2);
    const ambientMode: 'auto' | 'off' | 'custom' = recipe.ambientMode || 'auto';
    const ambientCustomPrompt: string = (recipe.ambientCustomPrompt || '').trim();
    const ambientPromise = (async (): Promise<{ prompt: string; filePath: string | null }> => {
      if (ambientPrompts.length > 0) {
        const prompt = ambientPrompts.join(' and ');
        console.log(`🌿 Ambient prompts (picker): ${prompt}`);
        const filePath = await fetchAmbientClipToFile(prompt);
        if (filePath) {
          const stat = await ReactNativeBlobUtil.fs.stat(filePath);
          console.log(`✅ Ambient clip saved: ${(Number(stat.size) / 1024).toFixed(1)} KB`);
        }
        return { prompt, filePath };
      }
      if (ambientMode === 'off') {
        console.log('🌿 Ambient mode = off; skipping');
        return { prompt: '', filePath: null };
      }
      let prompt: string;
      if (ambientMode === 'custom' && ambientCustomPrompt) {
        prompt = ambientCustomPrompt;
        console.log(`🌿 Ambient mode = custom; using user prompt: ${prompt}`);
      } else {
        console.log('🌿 Ambient mode = auto; generating from setting+location');
        prompt = await generateAmbientPrompt(recipe.setting, recipe.location);
        if (!prompt) return { prompt: '', filePath: null };
        console.log(`🌿 Ambient prompt: ${prompt}`);
      }
      const filePath = await fetchAmbientClipToFile(prompt);
      if (filePath) {
        const stat = await ReactNativeBlobUtil.fs.stat(filePath);
        console.log(`✅ Ambient clip saved: ${(Number(stat.size) / 1024).toFixed(1)} KB`);
      }
      return { prompt, filePath };
    })();

    // STEP 3b: Generate narration chunks locally
    const chunkFilePaths: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`🎤 Generating chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);

      const filePath = await fetchAudioChunkToFile(chunk, voiceId);
      chunkFilePaths.push(filePath);

      const stat = await ReactNativeBlobUtil.fs.stat(filePath);
      console.log(`✅ Chunk ${i + 1} saved: ${(Number(stat.size) / 1024).toFixed(1)} KB`);
    }
    
    // STEP 4: Upload each chunk individually to Firebase Storage
    console.log('📤 Uploading audio chunks to Firebase Storage...');
    const audioChunkURLs: string[] = [];
    for (let i = 0; i < chunkFilePaths.length; i++) {
      console.log(`📤 Uploading chunk ${i + 1}/${chunkFilePaths.length}...`);
      const chunkUrl = await uploadAudioChunk(userId, chunkFilePaths[i], recipe.isNighttime, i);
      audioChunkURLs.push(chunkUrl);
    }
    console.log(`✅ All ${audioChunkURLs.length} chunks uploaded`);

    // STEP 4b: Upload ambient if it generated successfully
    let ambientUrl: string | undefined;
    let ambientPrompt: string | undefined;
    try {
      const { prompt, filePath } = await ambientPromise;
      if (filePath && prompt) {
        console.log('📤 Uploading ambient loop...');
        ambientUrl = await uploadAmbient(userId, filePath, recipe.isNighttime);
        ambientPrompt = prompt;
        ReactNativeBlobUtil.fs.unlink(filePath).catch(() => {});
        console.log('✅ Ambient uploaded');
      } else {
        console.log('ℹ️ No ambient generated (skipped or failed); continuing narration-only');
      }
    } catch (err) {
      console.warn('Ambient upload failed, continuing narration-only:', err);
    }

    // STEP 5: Save story metadata to Firestore
    const createdAt = new Date();
    const title = createdAt.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    const storyData: any = {
      title,
      audioUrl: audioChunkURLs[0],
      audioChunkURLs,
      transcript,
      prompt: recipe.prompt,
      tags: recipe.tags,
      setting: recipe.setting,
      location: recipe.location,
      character: recipe.character,
      genderSelf: recipe.genderSelf,
      genderOther: recipe.genderOther,
      trope: recipe.trope,
      isNighttime: recipe.isNighttime,
      features: recipe.features,
      featurePreferences: recipe.featurePreferences,
      duration: (recipe.duration || '10min') as '5min' | '10min' | '15min',
      narrativeRatio: recipe.narrativeRatio || 5,
      createdAt,
      coverColor: recipe.coverColor || DEFAULT_COVER_COLOR,
      topographyLayers: generateDepthLayers(5),
    };

    if (ambientUrl) {
      storyData.ambientUrl = ambientUrl;
      storyData.ambientPrompt = ambientPrompt;
    }

    // Only include narratorId if it exists
    if (recipe.narratorId) {
      storyData.narratorId = recipe.narratorId;
    }
    
    const storyId = await saveStory(userId, storyData);

    console.log('✅ Story saved successfully! ID:', storyId);

    // Clean up local chunk files
    for (const chunkPath of chunkFilePaths) {
      ReactNativeBlobUtil.fs.unlink(chunkPath).catch(() => {});
    }

    return {
      audioUrl: audioChunkURLs[0],
      audioChunkURLs,
      transcript,
      storyId,
    };
  } catch (error) {
    console.error('Error generating audio story:', error);
    throw error;
  }
}
