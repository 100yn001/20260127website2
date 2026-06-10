/**
 * First-Story Service
 *
 * Generates a short (~2-minute) introductory story for new users during
 * onboarding, BEFORE they sign up. Returns Blobs in memory so they can be
 * played in the browser without persisting anything to Firebase. After the
 * user finishes signup, `saveFirstStory` uploads those Blobs and writes the
 * story doc to Firestore.
 *
 * Web-only for now: generation uses fetch + Blob, playback assumes
 * URL.createObjectURL is available. The onboarding step that calls this is
 * gated on Platform.OS === 'web'.
 */

import { auth } from '@/config/firebase';
import { DEFAULT_COVER_COLOR } from '@/constants/cover-colors';
import Anthropic from '@anthropic-ai/sdk';
import Constants from 'expo-constants';
import { saveStory, uploadAmbient, uploadAudioChunk } from './story-service';

const ELEVENLABS_API_KEY = Constants.expoConfig?.extra?.ELEVENLABS || '';

export type FirstStoryGender = 'male' | 'female' | 'neutral';
export type FirstStoryScenario = 'walk' | 'meditation';

// Hardcoded narrator voices used ONLY by the onboarding first-story step.
// The rest of the app's voice picker is unaffected — users still see the
// full voice library (constants/voices.ts + Firestore staticVoices) once
// they're signed in.
//   male    → "the British one" already in constants/voices.ts (smooth, calming)
//   female  → julialovespomegranate's voice (saved public narrator)
//   neutral → 'whisperer' — designed once via ElevenLabs voice-design and
//             pinned here as a permanent voice_id. Also added to the
//             FALLBACK_VOICES list in constants/voices.ts so it shows up
//             in the broader library too.
const VOICE_IDS: Record<FirstStoryGender, string> = {
  male: 'Qe9WSybioZxssVEwlBSo',
  female: 'p8JbsRMDYK9keH2updon',
  neutral: 'pCbBcqcQw2exKK3vigeF',
};

const SCENARIO_LABELS: Record<FirstStoryScenario, string> = {
  walk: 'a walk in the park',
  meditation: 'a meditation',
};

const AMBIENT_PROMPTS: Record<FirstStoryScenario, string> = {
  walk:
    'gentle birdsong, soft breeze rustling through leaves, distant warbler calls, faint footsteps on a quiet park path, peaceful springtime atmosphere',
  meditation:
    'calming ambient meditation music, soft synth pads, slow resonant bell tones, gentle low drone, peaceful and slow, no vocals, no rhythm',
};

const TARGET_WORD_COUNT = 280; // ~2 minutes at ~140 wpm

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  const apiKey = Constants.expoConfig?.extra?.ANTHROPIC_API_KEY || '';
  _anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  return _anthropic;
}

const MAX_TTS_CHUNK = 1000;

function splitForTts(text: string): string[] {
  if (text.length <= MAX_TTS_CHUNK) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_TTS_CHUNK) {
      chunks.push(remaining.trim());
      break;
    }
    const window = remaining.slice(0, MAX_TTS_CHUNK);
    let cut = -1;
    for (let i = window.length - 1; i >= MAX_TTS_CHUNK * 0.5; i--) {
      const ch = window[i];
      if ((ch === '.' || ch === '!' || ch === '?') && (i === window.length - 1 || window[i + 1] === ' ')) {
        cut = i + 1;
        break;
      }
    }
    if (cut === -1) {
      const lastSpace = window.lastIndexOf(' ');
      cut = lastSpace > 0 ? lastSpace + 1 : MAX_TTS_CHUNK;
    }
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  return chunks;
}

async function generateTranscript(args: {
  name: string;
  scenario: FirstStoryScenario;
}): Promise<string> {
  const { name, scenario } = args;
  const sceneInstruction =
    scenario === 'walk'
      ? `The setting is a slow, sun-warmed walk through a quiet park on a soft afternoon. Anchor the listener in small physical details: the give of grass underfoot, the texture of bark, dappled light, a curl of breeze. Keep the pace strolling, not striving.`
      : `The setting is a guided meditation. Lead the listener into stillness. Cue gentle breathing, soften body parts in sequence, invite warmth into the chest, let thoughts drift past without grabbing them. Keep the language low and unhurried.`;

  const system = [
    `You write short, soothing audio narrations meant to be read aloud by a calm voice over peaceful ambient sound.`,
    `Output PURE narration only — no titles, no headings, no stage directions, no sound-effect cues, no parentheticals, no markdown.`,
    `Second-person, present tense. Address the listener directly using their name a few times, but not so often that it sounds canned.`,
    `Aim for ${TARGET_WORD_COUNT - 20}–${TARGET_WORD_COUNT + 20} words and DO NOT exceed ${TARGET_WORD_COUNT + 20}; this is a strictly ~2-minute audio.`,
    `No mention of word counts, durations, or that this is a script.`,
  ].join(' ');

  const user = `The listener's name is ${name}. ${sceneInstruction} Begin gently. End with a soft closing line that lets ${name} land.`;

  const extractText = (res: Anthropic.Message): string | null => {
    for (const block of res.content) {
      if (block.type === 'text') return block.text.trim();
    }
    return null;
  };

  // Fable primary; on any failure fall back to Haiku (its prior model — the
  // user asked for "back to where we used to have it" worst-case behaviour).
  try {
    const res = await getAnthropic().messages.create({
      model: 'claude-fable-5',
      max_tokens: 2000, // generous headroom: Fable's adaptive thinking shares the budget
      // NB: no `temperature` — claude-fable-5 rejects it (adaptive thinking always on).
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = extractText(res);
    if (text) return text;
    throw new Error('No transcript returned');
  } catch (err) {
    console.warn('⚠️ first-story Fable failed; falling back to Opus:', (err as any)?.message);
    const res = await getAnthropic().messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2000,
      // no `temperature` — Opus 4.8 uses always-on adaptive thinking; keep params minimal
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = extractText(res);
    if (text) return text;
    throw new Error('No transcript returned');
  }
}

async function ttsChunk(text: string, voiceId: string): Promise<Blob> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_v3',
        voice_settings: { stability: 0.55, similarity_boost: 0.55 },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs TTS ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.blob();
}

async function fetchAmbientLoop(prompt: string): Promise<Blob | null> {
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text: prompt,
        duration_seconds: 30,
        loop: true,
        prompt_influence: 0.3,
      }),
    });
    if (!res.ok) {
      console.warn('ambient SFX failed:', res.status);
      return null;
    }
    return await res.blob();
  } catch (err) {
    console.warn('ambient SFX error:', err);
    return null;
  }
}

export interface GeneratedFirstStory {
  transcript: string;
  narrationBlobs: Blob[];
  ambientBlob: Blob | null;
  scenario: FirstStoryScenario;
  gender: FirstStoryGender;
}

export async function generateFirstStory(args: {
  name: string;
  gender: FirstStoryGender;
  scenario: FirstStoryScenario;
}): Promise<GeneratedFirstStory> {
  const { name, gender, scenario } = args;
  const transcript = await generateTranscript({ name, scenario });
  const voiceId = VOICE_IDS[gender];

  const chunks = splitForTts(transcript);
  // Narration chunks generate sequentially (ElevenLabs is rate-limited per-key
  // and back-to-back parallel calls have caused 429s in this codebase before).
  // Ambient runs in parallel with the first narration call to hide its latency.
  const ambientPromise = fetchAmbientLoop(AMBIENT_PROMPTS[scenario]);
  const narrationBlobs: Blob[] = [];
  for (const chunk of chunks) {
    narrationBlobs.push(await ttsChunk(chunk, voiceId));
  }
  const ambientBlob = await ambientPromise;

  return { transcript, narrationBlobs, ambientBlob, scenario, gender };
}

/**
 * Persist a generated first story after the user has signed up and Firebase
 * auth.currentUser is populated. Uploads each narration chunk + ambient loop
 * and writes the story doc to Firestore.
 */
export async function saveFirstStory(
  uid: string,
  story: GeneratedFirstStory,
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('saveFirstStory: not authenticated');

  // tsc resolves './story-service' to the native (.ts) overload which takes
  // a filePath: string. At runtime Metro picks story-service.web.ts which
  // accepts a Blob. The casts bridge that platform-overload gap.
  const audioChunkURLs: string[] = [];
  for (let i = 0; i < story.narrationBlobs.length; i++) {
    audioChunkURLs.push(
      await uploadAudioChunk(uid, story.narrationBlobs[i] as unknown as string, false, i),
    );
  }

  let ambientUrl: string | undefined;
  if (story.ambientBlob) {
    try {
      ambientUrl = await uploadAmbient(uid, story.ambientBlob as unknown as string, false);
    } catch (err) {
      console.warn('first-story ambient upload failed:', err);
    }
  }

  const title =
    story.scenario === 'walk' ? 'a walk in the park' : 'a meditation';

  const characterByGender: Record<FirstStoryGender, string> = {
    male: 'narrator (he)',
    female: 'narrator (she)',
    neutral: 'narrator (they)',
  };

  const storyData = {
    title,
    audioUrl: audioChunkURLs[0],
    audioChunkURLs,
    transcript: story.transcript,
    setting: SCENARIO_LABELS[story.scenario],
    location: SCENARIO_LABELS[story.scenario],
    character: characterByGender[story.gender],
    genderSelf: '',
    genderOther: story.gender,
    trope: 'first-story',
    isNighttime: false,
    duration: '5min' as const,
    narrativeRatio: 0,
    coverColor: DEFAULT_COVER_COLOR,
    ...(ambientUrl
      ? { ambientUrl, ambientPrompt: AMBIENT_PROMPTS[story.scenario] }
      : {}),
  };

  return saveStory(uid, storyData);
}
