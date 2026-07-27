/**
 * Onboarding first story — server-side port of services/first-story.web.ts.
 * Callable (anonymous auth OK); one per uid, enforced via the entitlements
 * doc's firstStoryUsed flag, claimed atomically before any provider spend.
 */

import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { entitlementsRef, readEntitlements } from './entitlements';
import { getAnthropic } from './fable';
import {
  ambientClipBuffer,
  generateDepthLayers,
  mapWithConcurrency,
  splitTextIntoChunks,
  ttsChunkBuffer,
  uploadPublicMp3,
} from './generation';

type FirstStoryGender = 'male' | 'female' | 'neutral';
type FirstStoryScenario = 'walk' | 'meditation';

// Pinned onboarding voices (KEEP IN SYNC with services/first-story.web.ts)
const FIRST_STORY_VOICE_IDS: Record<FirstStoryGender, string> = {
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

async function firstStoryTranscript(name: string, scenario: FirstStoryScenario): Promise<string> {
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

  const extractText = (res: any): string | null => {
    for (const block of res.content) {
      if (block.type === 'text') return block.text.trim();
    }
    return null;
  };

  // Fable primary; Opus fallback (same worst-case behaviour as the client had).
  try {
    const res = await getAnthropic().messages.create({
      model: 'claude-fable-5',
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = extractText(res);
    if (text) return text;
    throw new Error('No transcript returned');
  } catch (err: any) {
    console.warn('⚠️ first-story Fable failed; falling back to Opus:', err?.message);
    const res = await getAnthropic().messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = extractText(res);
    if (text) return text;
    throw new Error('No transcript returned');
  }
}

export const generateFirstStory = onCall(
  { timeoutSeconds: 540, memory: '1GiB' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'must be signed in');

    const name = String(request.data?.name || 'friend').slice(0, 40);
    const gender = (['male', 'female', 'neutral'] as const).includes(request.data?.gender)
      ? (request.data.gender as FirstStoryGender)
      : 'neutral';
    const scenario = (['walk', 'meditation'] as const).includes(request.data?.scenario)
      ? (request.data.scenario as FirstStoryScenario)
      : 'walk';

    // Claim the one-per-uid slot BEFORE any provider spend; revert on failure.
    const db = admin.firestore();
    const claimed = await db.runTransaction(async (tx) => {
      const ent = readEntitlements(await tx.get(entitlementsRef(uid)));
      if (ent.firstStoryUsed) return false;
      tx.set(
        entitlementsRef(uid),
        { firstStoryUsed: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
      return true;
    });
    if (!claimed) throw new HttpsError('resource-exhausted', 'first story already generated');

    try {
      const transcript = await firstStoryTranscript(name, scenario);
      const voiceId = FIRST_STORY_VOICE_IDS[gender];
      const chunks = splitTextIntoChunks(transcript);

      const ambientPromise = ambientClipBuffer(AMBIENT_PROMPTS[scenario]);
      const chunkBuffers = await mapWithConcurrency(chunks, 2, (c) => ttsChunkBuffer(c, voiceId));
      const ambientBuf = await ambientPromise;

      const timestamp = Date.now();
      const folder = 'generated-audio/daytime';
      const audioChunkURLs = await mapWithConcurrency(chunkBuffers, 4, (buf, i) =>
        uploadPublicMp3(`${folder}/${uid}-${timestamp}-chunk${i}.mp3`, buf),
      );
      let ambientUrl: string | undefined;
      if (ambientBuf) {
        try {
          ambientUrl = await uploadPublicMp3(`${folder}/${uid}-${timestamp}-ambient.mp3`, ambientBuf);
        } catch (err) {
          console.warn('first-story ambient upload failed:', err);
        }
      }

      const characterByGender: Record<FirstStoryGender, string> = {
        male: 'narrator (he)',
        female: 'narrator (she)',
        neutral: 'narrator (they)',
      };

      const storyRef = db.collection('stories').doc();
      const storyData: any = {
        id: storyRef.id,
        userId: uid,
        title: SCENARIO_LABELS[scenario],
        audioUrl: audioChunkURLs[0],
        audioChunkURLs,
        transcript,
        setting: SCENARIO_LABELS[scenario],
        location: SCENARIO_LABELS[scenario],
        character: characterByGender[gender],
        genderSelf: '',
        genderOther: gender,
        trope: 'first-story',
        isNighttime: false,
        duration: '5min',
        narrativeRatio: 0,
        coverColor: '#7f1d1d',
        topographyLayers: generateDepthLayers(5),
        createdAt: admin.firestore.Timestamp.now(),
      };
      if (ambientUrl) {
        storyData.ambientUrl = ambientUrl;
        storyData.ambientPrompt = AMBIENT_PROMPTS[scenario];
      }
      await storyRef.set(storyData);

      return { storyId: storyRef.id, transcript, audioChunkURLs, ambientUrl: ambientUrl ?? null };
    } catch (err: any) {
      // Give the slot back so the user can retry.
      await entitlementsRef(uid).set(
        { firstStoryUsed: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
      console.error('first-story generation failed:', err);
      throw new HttpsError('internal', err?.message || 'first story generation failed');
    }
  },
);
