import { db, storage } from '@/config/firebase';
import { DepthLayer } from '@/types/story';
import { renderArtworkToPng } from '@/utils/artwork-to-png';
import { addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Platform } from 'react-native';

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
  topographyLayers?: DepthLayer[];
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

  // Upload artwork PNG on web
  let artworkUrl = '';
  if (Platform.OS === 'web' && params.coverColor) {
    try {
      const blob = await renderArtworkToPng(params.coverColor, params.topographyLayers, 440);
      const path = `sharedArtwork/${params.userId}/${params.storyId}_${Date.now()}.png`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, blob);
      artworkUrl = await getDownloadURL(storageRef);
    } catch (err: any) {
      console.warn('Artwork upload failed:', err?.message || err);
    }
  }

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
    duration: params.duration || '10min',
    isNighttime: params.isNighttime,
    artworkUrl,
  };

  const docRef = await addDoc(collection(db, SHARED_AUDIO_COLLECTION), sharedDoc);
  return `https://yourname.media/sink/${docRef.id}`;
}
