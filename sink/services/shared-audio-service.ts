import { db } from '@/config/firebase';
import { SharedAudio } from '@/types/shared-audio';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

const SHARED_AUDIO_COLLECTION = 'sharedAudio';

export async function getSharedAudio(id: string): Promise<SharedAudio | null> {
  const docRef = doc(db, SHARED_AUDIO_COLLECTION, id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;

  const data = snap.data();
  return {
    id: snap.id,
    sharedBy: data.sharedBy,
    storyId: data.storyId,
    title: data.title,
    audioChunkURLs: data.audioChunkURLs || [],
    audioUrl: data.audioUrl || '',
    narratorId: data.narratorId || '',
    played: data.played || false,
    createdAt: data.createdAt?.toDate?.() || new Date(),
    expiresAt: data.expiresAt?.toDate?.() || new Date(),
    coverColor: data.coverColor || '',
    topographyLayers: data.topographyLayers || [],
    duration: data.duration,
    isNighttime: data.isNighttime || false,
  };
}

export async function markAsPlayed(id: string): Promise<void> {
  const docRef = doc(db, SHARED_AUDIO_COLLECTION, id);
  await updateDoc(docRef, { played: true });
}
