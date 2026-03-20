import { auth, db } from '@/config/firebase';
import { CustomVoice } from '@/types/voice';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
} from 'firebase/firestore';

/**
 * Save a custom voice to the user's voice library in Firestore.
 */
export async function saveCustomVoice(voice: Omit<CustomVoice, 'id' | 'userId' | 'createdAt'>): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const voiceId = `voice_${Date.now()}`;
  const voiceData = {
    ...voice,
    id: voiceId,
    userId: user.uid,
    createdAt: Timestamp.fromDate(new Date()),
  };

  await setDoc(doc(db, 'users', user.uid, 'voices', voiceId), voiceData);
  return voiceId;
}

/**
 * Delete a custom voice from the user's library.
 */
export async function deleteCustomVoice(voiceDocId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  await deleteDoc(doc(db, 'users', user.uid, 'voices', voiceDocId));
}

/**
 * Subscribe to the user's custom voices in real-time.
 * Returns an unsubscribe function.
 */
export function subscribeToCustomVoices(
  callback: (voices: CustomVoice[]) => void
): () => void {
  const user = auth.currentUser;
  if (!user) {
    callback([]);
    return () => {};
  }

  const voicesRef = collection(db, 'users', user.uid, 'voices');
  const q = query(voicesRef, orderBy('createdAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const voices: CustomVoice[] = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        userId: data.userId,
        voiceId: data.voiceId,
        name: data.name,
        gender: data.gender,
        accent: data.accent || '',
        descriptors: data.descriptors || '',
        voiceDesignDescription: data.voiceDesignDescription || '',
        previewAudioBase64: data.previewAudioBase64,
        createdAt: data.createdAt?.toDate?.() || new Date(),
      };
    });
    callback(voices);
  });
}
