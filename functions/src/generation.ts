/**
 * Server-side story generation — the ONLY generator (the client just writes
 * queue docs and renders snapshots).
 *
 * Flow:
 *   users/{uid}/queue/{id} written with status 'pending'
 *     → onQueueWrite (thin trigger): short grace sleep (lets old cached
 *       clients claim during the transition window), then a transaction that
 *       checks/consumes an entitlement slot and marks the doc 'generating'
 *       (or 'payment_required'), then enqueues the heavy worker.
 *     → generateStoryWorker (task queue, 1800s): Fable text pipeline (Grok
 *       fallback) + ElevenLabs TTS/ambient + Storage upload + story doc.
 *     → sweepStuckQueue (schedule): refunds + errors docs stuck 'generating'
 *       (worker killed by timeout/OOM — its catch can never see that).
 */

import * as admin from 'firebase-admin';
import { getFunctions } from 'firebase-admin/functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  generateAmbientPrompt,
  generateTranscript,
  type FableRecipe,
} from './fable';
import {
  claimStorySlot,
  entitlementsRef,
  readEntitlements,
  refundStorySlot,
  type StorySlot,
} from './entitlements';

export const DEFAULT_COVER_COLOR = '#7f1d1d'; // constants/cover-colors.ts
const MAX_CHUNK_SIZE = 1000; // eleven_v3 has a lower char limit than older models
const HARD_TTS_LIMIT = 4500; // ElevenLabs rejects payloads over 5000 chars
const TTS_CONCURRENCY = 3;

// Transition grace: old cached web bundles still claim queue docs client-side
// within ~1s. New clients never claim. Once old bundles age out, drop to ~3s.
const CLAIM_GRACE_MS = 15_000;

export const VOICE_IDS: Record<string, string> = {
  male: 'Qe9WSybioZxssVEwlBSo',
  female: 'LEnmbrrxYsUYS7vsRRwD',
};

export interface RecipeData extends FableRecipe {
  voiceId?: string;
  narratorId?: string;
  coverColor?: string;
  ambientPrompts?: string[];
  ambientMode?: 'auto' | 'off' | 'custom';
  ambientCustomPrompt?: string;
}

interface QueueItem {
  recipeData: RecipeData;
  followUpQuestions: string[];
  followUpAnswers: string[];
  status: string;
  progress: number;
  currentStep?: string;
  createdAt: admin.firestore.Timestamp;
  storyId?: string;
  audioUrl?: string;
  audioChunkURLs?: string[];
  transcript?: string;
  completedAt?: admin.firestore.Timestamp;
  error?: string;
  generatedBy?: string;
  entitlementSlot?: StorySlot;
  refunded?: boolean;
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// ── Text chunking (unchanged from the original function) ────────────────────

export function enforceHardLimit(chunks: string[]): string[] {
  const out: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= HARD_TTS_LIMIT) {
      out.push(chunk);
      continue;
    }
    console.warn(`⚠️ TTS chunk ${chunk.length} chars exceeds HARD_TTS_LIMIT ${HARD_TTS_LIMIT} — re-splitting`);
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

export function splitTextIntoChunks(text: string): string[] {
  if (text.length <= MAX_CHUNK_SIZE) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK_SIZE) {
      chunks.push(remaining.trim());
      break;
    }

    const searchArea = remaining.substring(0, MAX_CHUNK_SIZE);
    let splitIndex = -1;

    for (let i = searchArea.length - 1; i >= 0; i--) {
      const char = searchArea[i];
      if ((char === '.' || char === '!' || char === '?') &&
          (i === searchArea.length - 1 || searchArea[i + 1] === ' ' || searchArea[i + 1] === '\n')) {
        splitIndex = i + 1;
        break;
      }
    }

    if (splitIndex === -1) {
      const lastNewline = searchArea.lastIndexOf('\n');
      if (lastNewline > MAX_CHUNK_SIZE * 0.5) splitIndex = lastNewline + 1;
    }

    if (splitIndex === -1) {
      for (let i = searchArea.length - 1; i >= MAX_CHUNK_SIZE * 0.5; i--) {
        if (searchArea[i] === ',' || searchArea[i] === ';') {
          splitIndex = i + 1;
          break;
        }
      }
    }

    if (splitIndex === -1) {
      const lastSpace = searchArea.lastIndexOf(' ');
      splitIndex = lastSpace > 0 ? lastSpace + 1 : MAX_CHUNK_SIZE;
    }

    chunks.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }

  return chunks;
}

export function generateDepthLayers(count: number = 5) {
  const layers = [];
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

// ── ElevenLabs + Storage ────────────────────────────────────────────────────

export async function ttsChunkBuffer(text: string, voiceId: string): Promise<Buffer> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY || '',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_v3',
        voice_settings: { stability: 0.5, similarity_boost: 0.5 },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`ElevenLabs TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** 30s seamless ambient loop via ElevenLabs sound-generation; null on failure. */
export async function ambientClipBuffer(prompt: string): Promise<Buffer | null> {
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY || '',
      },
      body: JSON.stringify({ text: prompt, duration_seconds: 30, loop: true, prompt_influence: 0.3 }),
    });
    if (!res.ok) {
      console.warn('ElevenLabs SFX error:', res.status, (await res.text()).slice(0, 200));
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.warn('Ambient clip generation failed:', err);
    return null;
  }
}

export async function uploadPublicMp3(path: string, buf: Buffer): Promise<string> {
  const bucket = admin.storage().bucket();
  const file = bucket.file(path);
  await file.save(buf, { metadata: { contentType: 'audio/mpeg' } });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${path}`;
}

/** Run tasks with bounded concurrency, preserving order of results. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

async function updateQueue(userId: string, queueId: string, updates: Record<string, unknown>) {
  await admin.firestore().doc(`users/${userId}/queue/${queueId}`).update({
    ...updates,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ── Trigger: claim + enqueue ────────────────────────────────────────────────

export const onQueueWrite = onDocumentWritten(
  { document: 'users/{userId}/queue/{queueId}', timeoutSeconds: 120 },
  async (event) => {
    const after = event.data?.after;
    const before = event.data?.before;
    if (!after?.exists) return;
    const afterData = after.data() as QueueItem;
    const beforeStatus = before?.exists ? (before.data() as QueueItem).status : null;
    // Fire on create-with-pending and on any transition back to pending
    // (retry / reset paths setDoc the same id — onDocumentCreated misses those).
    if (afterData.status !== 'pending' || beforeStatus === 'pending') return;

    const { userId, queueId } = event.params;

    // Transition grace: old cached clients claim within ~1s; let them win.
    await sleep(CLAIM_GRACE_MS);

    const db = admin.firestore();
    const queueRef = db.doc(`users/${userId}/queue/${queueId}`);
    const slot = await db.runTransaction(async (tx) => {
      const [queueSnap, entSnap] = await Promise.all([
        tx.get(queueRef),
        tx.get(entitlementsRef(userId)),
      ]);
      if (!queueSnap.exists || (queueSnap.data() as QueueItem).status !== 'pending') return 'claimed-elsewhere';
      const ent = readEntitlements(entSnap);
      const claimed = claimStorySlot(tx, userId, ent);
      if (!claimed) {
        tx.update(queueRef, {
          status: 'payment_required',
          currentStep: 'payment_required',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return null;
      }
      tx.update(queueRef, {
        status: 'generating',
        currentStep: 'generating_prompt',
        progress: 10,
        generatedBy: 'cloud-function',
        entitlementSlot: claimed,
        refunded: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return claimed;
    });

    if (slot === 'claimed-elsewhere') {
      console.log(`Queue ${queueId}: already claimed — skipping`);
      return;
    }
    if (slot === null) {
      console.log(`Queue ${queueId}: no entitlement — payment_required`);
      return;
    }

    await getFunctions().taskQueue('generateStoryWorker').enqueue({ userId, queueId });
    console.log(`Queue ${queueId}: claimed (${slot}) and enqueued for generation`);
  },
);

// ── Worker: the actual pipeline ─────────────────────────────────────────────

export const generateStoryWorker = onTaskDispatched(
  {
    timeoutSeconds: 1800,
    memory: '1GiB',
    retryConfig: { maxAttempts: 1 },
    rateLimits: { maxConcurrentDispatches: 6 },
  },
  async (req) => {
    const { userId, queueId } = req.data as { userId: string; queueId: string };
    const db = admin.firestore();
    const snap = await db.doc(`users/${userId}/queue/${queueId}`).get();
    if (!snap.exists) return;
    const data = snap.data() as QueueItem;
    if (data.status !== 'generating') {
      console.log(`Worker: queue ${queueId} status is ${data.status} — nothing to do`);
      return;
    }

    const recipe = data.recipeData;
    const slot: StorySlot = data.entitlementSlot || 'free';

    try {
      // Build follow-up Q&A exactly like the client did
      const followUpQA = (data.followUpQuestions || [])
        .map((q, i) => {
          const answer = (data.followUpAnswers || [])[i] || '';
          return answer ? `Q: ${q}\nA: ${answer}` : '';
        })
        .filter(Boolean)
        .join('\n\n');
      const followUpAnswer = followUpQA || (data.followUpAnswers || []).join(' ');

      // STEP 1-2: transcript (Fable 3-stage; Grok fallback inside)
      await updateQueue(userId, queueId, { currentStep: 'generating_transcript', progress: 30 });
      const transcript = await generateTranscript(recipe, followUpAnswer, userId);

      // STEP 3: TTS chunks (bounded parallelism) + ambient in parallel
      await updateQueue(userId, queueId, { currentStep: 'generating_audio', progress: 50 });
      const voiceId =
        recipe.voiceId || VOICE_IDS[(recipe.genderOther as string) || ''] || VOICE_IDS.male;
      const chunks = enforceHardLimit(splitTextIntoChunks(transcript));
      if (chunks.length === 0) throw new Error('Transcript produced no audio chunks');
      console.log(`📝 ${chunks.length} chunk(s) for TTS, voice ${voiceId}`);

      const ambientPromise = (async (): Promise<{ prompt: string; buf: Buffer | null }> => {
        const picked = (recipe.ambientPrompts || []).map((p) => (p || '').trim()).filter(Boolean).slice(0, 2);
        const mode = recipe.ambientMode || 'auto';
        if (picked.length > 0) {
          const prompt = picked.join(' and ');
          return { prompt, buf: await ambientClipBuffer(prompt) };
        }
        if (mode === 'off') return { prompt: '', buf: null };
        let prompt = mode === 'custom' && (recipe.ambientCustomPrompt || '').trim()
          ? (recipe.ambientCustomPrompt || '').trim()
          : await generateAmbientPrompt(recipe.setting || '', recipe.location || '');
        if (!prompt) return { prompt: '', buf: null };
        return { prompt, buf: await ambientClipBuffer(prompt) };
      })();

      const chunkBuffers = await mapWithConcurrency(chunks, TTS_CONCURRENCY, (chunk, i) => {
        console.log(`🎤 chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);
        return ttsChunkBuffer(chunk, voiceId);
      });

      // STEP 4: uploads
      await updateQueue(userId, queueId, { currentStep: 'uploading', progress: 75 });
      const folder = recipe.isNighttime ? 'generated-audio/nighttime' : 'generated-audio/daytime';
      const timestamp = Date.now();
      const audioChunkURLs = await mapWithConcurrency(chunkBuffers, 4, (buf, i) =>
        uploadPublicMp3(`${folder}/${userId}-${timestamp}-chunk${i}.mp3`, buf),
      );
      const audioUrl = audioChunkURLs[0];

      let ambientUrl: string | undefined;
      let ambientPrompt: string | undefined;
      try {
        const { prompt, buf } = await ambientPromise;
        if (buf && prompt) {
          ambientUrl = await uploadPublicMp3(`${folder}/${userId}-${timestamp}-ambient.mp3`, buf);
          ambientPrompt = prompt;
        }
      } catch (err) {
        console.warn('Ambient failed, continuing narration-only:', err);
      }

      // STEP 5: story doc (client shape — see services/audio-generation*.ts)
      const createdAt = admin.firestore.Timestamp.now();
      const title = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });

      const storyRef = db.collection('stories').doc();
      const storyData: any = {
        id: storyRef.id,
        userId,
        title,
        audioUrl,
        audioChunkURLs,
        transcript,
        prompt: recipe.prompt || null,
        tags: recipe.tags || [],
        setting: recipe.setting,
        location: recipe.location,
        character: recipe.character,
        genderSelf: recipe.genderSelf,
        genderOther: recipe.genderOther,
        trope: recipe.trope,
        isNighttime: !!recipe.isNighttime,
        features: recipe.features || [],
        featurePreferences: recipe.featurePreferences || {},
        duration: recipe.duration || '10min',
        narrativeRatio: recipe.narrativeRatio || 5,
        createdAt,
        coverColor: recipe.coverColor || DEFAULT_COVER_COLOR,
        topographyLayers: generateDepthLayers(5),
      };
      if (recipe.narrationMode) storyData.narrationMode = recipe.narrationMode;
      if (recipe.narratorId) storyData.narratorId = recipe.narratorId;
      if (recipe.narratorData?.name) storyData.narratorName = recipe.narratorData.name;
      if (ambientUrl) {
        storyData.ambientUrl = ambientUrl;
        storyData.ambientPrompt = ambientPrompt;
      }
      await storyRef.set(storyData);

      // STEP 6: complete
      await updateQueue(userId, queueId, {
        status: 'complete',
        currentStep: 'complete',
        progress: 100,
        storyId: storyRef.id,
        audioUrl,
        audioChunkURLs,
        transcript,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`🎉 Story ${storyRef.id} complete for queue ${queueId}`);
    } catch (error: any) {
      console.error('❌ Story generation failed:', error);
      await failAndRefund(userId, queueId, slot, error?.message || 'Unknown error');
    }
  },
);

/** Mark a queue doc failed and refund its slot exactly once. */
async function failAndRefund(userId: string, queueId: string, slot: StorySlot, message: string) {
  const db = admin.firestore();
  const ref = db.doc(`users/${userId}/queue/${queueId}`);
  const shouldRefund = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const d = snap.data() as QueueItem;
    if (d.refunded) return false;
    tx.update(ref, {
      status: 'error',
      currentStep: 'error',
      error: message,
      refunded: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (shouldRefund) await refundStorySlot(userId, slot);
}

// ── Sweeper: catch worker kills (timeout/OOM) the catch block can't see ─────

export const sweepStuckQueue = onSchedule('every 15 minutes', async () => {
  const db = admin.firestore();
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 35 * 60 * 1000);
  const snap = await db
    .collectionGroup('queue')
    .where('status', '==', 'generating')
    .where('updatedAt', '<', cutoff)
    .limit(50)
    .get();
  for (const doc of snap.docs) {
    const userId = doc.ref.parent.parent?.id;
    if (!userId) continue;
    const d = doc.data() as QueueItem;
    console.warn(`Sweeper: refunding stuck queue ${doc.id} (user ${userId})`);
    await failAndRefund(userId, doc.id, d.entitlementSlot || 'free', 'Generation timed out — please try again');
  }
});
