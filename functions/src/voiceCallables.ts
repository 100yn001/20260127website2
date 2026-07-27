/**
 * Voice callables — server-side ElevenLabs voice design/create/preview
 * (previously direct client calls in app/voice-library.tsx and
 * app/narrators/public.tsx). Enforces the max-3-custom-voices-per-user cap.
 */

import * as admin from 'firebase-admin';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { MAX_CUSTOM_VOICES } from './entitlements';

function requireAuth(request: { auth?: { uid?: string } }): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'must be signed in');
  return uid;
}

function elHeaders() {
  return {
    'Content-Type': 'application/json',
    'xi-api-key': process.env.ELEVENLABS_API_KEY || '',
  };
}

/** Generate 3 design previews for a described voice. */
export const designVoicePreviews = onCall({ timeoutSeconds: 120 }, async (request) => {
  requireAuth(request);
  const voiceDescription = String(request.data?.voiceDescription || '').slice(0, 1000);
  const text = String(request.data?.text || '').slice(0, 1000);
  if (voiceDescription.length < 20) {
    throw new HttpsError('invalid-argument', 'voice description must be at least 20 characters');
  }
  if (text.length < 100) {
    throw new HttpsError('invalid-argument', 'preview text must be at least 100 characters');
  }

  const res = await fetch('https://api.elevenlabs.io/v1/text-to-voice/design', {
    method: 'POST',
    headers: elHeaders(),
    body: JSON.stringify({ voice_description: voiceDescription, text, model_id: 'eleven_ttv_v3' }),
  });
  if (!res.ok) {
    throw new HttpsError('internal', `voice design failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data: any = await res.json();
  return { previews: data.previews || [] };
});

/** Persist a designed voice (≤3 per user) and write the voice doc. */
export const saveDesignedVoice = onCall({ timeoutSeconds: 120 }, async (request) => {
  const uid = requireAuth(request);
  const voiceName = String(request.data?.voiceName || '').slice(0, 60).trim();
  const voiceDescription = String(request.data?.voiceDescription || '').slice(0, 1000);
  const generatedVoiceId = String(request.data?.generatedVoiceId || '');
  const gender = String(request.data?.gender || 'neutral');
  const accent = String(request.data?.accent || '');
  const descriptors: string[] = Array.isArray(request.data?.descriptors)
    ? request.data.descriptors.filter((d: unknown) => typeof d === 'string').slice(0, 8)
    : [];
  const previewAudioBase64 = typeof request.data?.previewAudioBase64 === 'string'
    ? request.data.previewAudioBase64.slice(0, 1_000_000)
    : null;
  if (!voiceName || !generatedVoiceId) {
    throw new HttpsError('invalid-argument', 'voiceName and generatedVoiceId are required');
  }

  const db = admin.firestore();
  const voicesRef = db.collection(`users/${uid}/voices`);
  const existing = await voicesRef.count().get();
  if (existing.data().count >= MAX_CUSTOM_VOICES) {
    throw new HttpsError(
      'resource-exhausted',
      `you can save up to ${MAX_CUSTOM_VOICES} custom voices — delete one to make room`,
    );
  }

  const res = await fetch('https://api.elevenlabs.io/v1/text-to-voice', {
    method: 'POST',
    headers: elHeaders(),
    body: JSON.stringify({
      voice_name: voiceName,
      voice_description: voiceDescription,
      generated_voice_id: generatedVoiceId,
    }),
  });
  if (!res.ok) {
    throw new HttpsError('internal', `voice save failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const saveData: any = await res.json();
  const permanentVoiceId = saveData.voice_id;
  if (!permanentVoiceId) throw new HttpsError('internal', 'ElevenLabs returned no voice_id');

  // Mirror services/voice-service.ts saveCustomVoice doc shape.
  const docId = `voice_${Date.now()}`;
  await voicesRef.doc(docId).set({
    id: docId,
    userId: uid,
    voiceId: permanentVoiceId,
    name: voiceName,
    gender,
    accent,
    descriptors: descriptors.join(', '), // CustomVoice type expects "warm, deep"
    voiceDesignDescription: voiceDescription,
    previewAudioBase64,
    createdAt: admin.firestore.Timestamp.now(),
  });

  return { voiceId: permanentVoiceId, docId };
});

/** Short spoken preview for a voice (static library + public narrator greetings). */
export const previewVoiceTts = onCall({ timeoutSeconds: 60 }, async (request) => {
  requireAuth(request);
  const voiceId = String(request.data?.voiceId || '');
  const text = String(request.data?.text || '').slice(0, 300);
  if (!voiceId || !text) throw new HttpsError('invalid-argument', 'voiceId and text are required');

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: 'POST',
    headers: elHeaders(),
    body: JSON.stringify({
      text,
      model_id: 'eleven_v3',
      voice_settings: { stability: 0.5, similarity_boost: 0.5 },
    }),
  });
  if (!res.ok) {
    throw new HttpsError('internal', `voice preview failed (${res.status})`);
  }
  const audioBase64 = Buffer.from(await res.arrayBuffer()).toString('base64');
  return { audioBase64, mediaType: 'audio/mpeg' };
});

/**
 * When a user deletes a voice doc (frees one of their 3 slots), also delete
 * the underlying ElevenLabs voice — otherwise create/delete cycles leak
 * permanent voices on the shared account past the cap.
 */
export const onVoiceDeleted = onDocumentDeleted(
  'users/{userId}/voices/{voiceDocId}',
  async (event) => {
    const voiceId = (event.data?.data() as any)?.voiceId;
    if (!voiceId || typeof voiceId !== 'string') return;
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, {
        method: 'DELETE',
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY || '' },
      });
      if (!res.ok && res.status !== 404) {
        console.warn(`ElevenLabs voice delete failed for ${voiceId}: ${res.status}`);
      }
    } catch (err) {
      console.warn('ElevenLabs voice delete errored:', err);
    }
  },
);
