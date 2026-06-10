/**
 * Audio Generation Service (native)
 * Text via the Fable immersion pipeline (./fable-story, claude-fable-5);
 * audio via ElevenLabs. No backend server needed - fully self-contained!
 */

import { DEFAULT_COVER_COLOR } from '@/constants/cover-colors';
import {
  DEFAULT_NARRATION_MODE,
  LEGACY_RATIO_BY_MODE,
  type NarrationMode,
} from '@/constants/narration-modes';
import { DepthLayer } from '@/types/story';
import Constants from 'expo-constants';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { generateAmbientPrompt, generateTranscript } from './fable-story';
import { saveStory, uploadAmbient, uploadAudioChunk } from './story-service';
import { checkAndIncrementDailyStoryCount } from './user-service';

// Re-exported so existing callers (e.g. app/followup.tsx) keep resolving
// generateFollowUpQuestions from '@/services/audio-generation'.
export { generateFollowUpQuestions } from './fable-story';

const ELEVENLABS_API_KEY = Constants.expoConfig?.extra?.ELEVENLABS || '';

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
  narrationMode?: NarrationMode; // immersive | intermediate | cinematic
  narrativeRatio?: number; // legacy 0–10 descriptive·direct (kept for back-compat)
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
  // expensive Fable/ElevenLabs calls happen. Atomic via Firestore txn.
  await checkAndIncrementDailyStoryCount(userId);

  // Combine questions and answers into Q&A pairs
  const followUpQA = followUpQuestions.map((q, i) => {
    const answer = followUpAnswers[i] || '';
    return answer ? `Q: ${q}\nA: ${answer}` : '';
  }).filter(Boolean).join('\n\n');

  const followUpAnswer = followUpQA || followUpAnswers.join(' ');

  try {
    // STEPS 1–2: Transcript via the Fable 3-stage immersion pipeline
    console.log('📝 Generating transcript with the Fable immersion pipeline...');
    const transcript = await generateTranscript(recipe, followUpAnswer);
    console.log('✅ Transcript generated successfully, length:', transcript.length);

    // STEP 3: Generate audio with ElevenLabs (with chunking for long transcripts)
    // Use the selected voice ID if provided, otherwise fall back to default based on gender
    const voiceId = recipe.voiceId || VOICE_IDS[recipe.genderOther as 'male' | 'female'];

    console.log('🎤 Generating audio with ElevenLabs using voice:', voiceId);

    // Always chunk the transcript for reliable, fast generation. Then pass
    // through the hard-limit enforcer so nothing over 4500 chars ever hits
    // the ElevenLabs API.
    const chunks = enforceHardLimit(splitTextIntoChunks(transcript));
    if (chunks.length === 0) {
      throw new Error('Transcript produced no audio chunks — nothing to synthesize');
    }
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
    const mode: NarrationMode = recipe.narrationMode || DEFAULT_NARRATION_MODE;
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
      narrationMode: mode,
      // Dual-write a derived legacy ratio so old readers still work.
      narrativeRatio: recipe.narrativeRatio ?? LEGACY_RATIO_BY_MODE[mode],
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
