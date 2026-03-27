import { db } from '@/config/firebase';
import { addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';

const SHARED_AUDIO_COLLECTION = 'sharedAudio';
const EXPIRY_DAYS = 7;

interface ShareStoryParams {
  userId: string;
  storyId: string;
  title: string;
  audioChunkURLs: string[];
  audioUrl?: string;
  narratorId?: string;
  coverColor?: string;
  topographyLayers?: any[];
  duration?: '5min' | '10min' | '15min';
  isNighttime: boolean;
}

/**
 * Creates a SharedAudio document in Firestore and returns a deep link
 * that can be opened in the sink iOS app.
 */
export async function shareStoryToSink(params: ShareStoryParams): Promise<string> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + EXPIRY_DAYS);

  const sharedDoc = {
    sharedBy: params.userId,
    storyId: params.storyId,
    title: params.title,
    audioChunkURLs: params.audioChunkURLs,
    audioUrl: params.audioUrl || '',
    narratorId: params.narratorId || '',
    played: false,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAt),
    coverColor: params.coverColor || '',
    topographyLayers: params.topographyLayers || [],
    duration: params.duration || '10min',
    isNighttime: params.isNighttime,
  };

  const docRef = await addDoc(collection(db, SHARED_AUDIO_COLLECTION), sharedDoc);
  const deepLink = `sink://play/${docRef.id}`;
  return deepLink;
}
