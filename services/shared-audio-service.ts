import { db, storage } from '@/config/firebase';
import { SharedAudio, Story } from '@/types/story';
import { renderArtworkToPng } from '@/utils/artwork-to-png';
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    setDoc,
    Timestamp,
    where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Platform } from 'react-native';

const COLLECTION = 'sharedAudio';

/** Default TTL for shared audio links: 24 hours */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Share a story's audio by creating a document in the sharedAudio collection.
 * Returns the shared audio document ID (used to build the share link).
 */
export async function shareStoryAudio(
  userId: string,
  story: Story,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<string> {
  try {
    const sharedRef = doc(collection(db, COLLECTION));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    // Upload artwork PNG on web
    let artworkUrl = '';
    if (Platform.OS === 'web' && story.coverColor) {
      try {
        const blob = await renderArtworkToPng(story.coverColor, story.topographyLayers, 440);
        const path = `sharedArtwork/${userId}/${story.id}_${Date.now()}.png`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, blob);
        artworkUrl = await getDownloadURL(storageRef);
      } catch (err: any) {
        console.warn('Artwork upload failed:', err?.message || err);
      }
    }

    const shared: SharedAudio = {
      id: sharedRef.id,
      sharedBy: userId,
      storyId: story.id,
      title: story.title,
      audioChunkURLs: story.audioChunkURLs || [],
      audioUrl: story.audioUrl,
      narratorId: story.narratorId || '',
      played: false,
      createdAt: now,
      expiresAt,
      coverColor: story.coverColor,
      duration: story.duration,
      isNighttime: story.isNighttime,
    };

    await setDoc(sharedRef, {
      ...shared,
      createdAt: Timestamp.fromDate(now),
      expiresAt: Timestamp.fromDate(expiresAt),
      artworkUrl,
    });

    console.log('🔗 Shared audio created:', sharedRef.id);
    return sharedRef.id;
  } catch (error) {
    console.error('Error sharing story audio:', error);
    throw error;
  }
}

/**
 * Fetch a shared audio document by ID.
 * Returns null if not found or expired.
 */
export async function getSharedAudio(
  sharedId: string
): Promise<SharedAudio | null> {
  try {
    const docSnap = await getDoc(doc(db, COLLECTION, sharedId));

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    const shared: SharedAudio = {
      ...data,
      id: docSnap.id,
      createdAt: data.createdAt.toDate(),
      expiresAt: data.expiresAt.toDate(),
    } as SharedAudio;

    // Check if expired
    if (shared.expiresAt < new Date()) {
      console.log('⏰ Shared audio expired, cleaning up:', sharedId);
      await deleteSharedAudio(sharedId);
      return null;
    }

    return shared;
  } catch (error) {
    console.error('Error getting shared audio:', error);
    throw error;
  }
}

/**
 * Mark a shared audio as played.
 * Called by the Sink app after playback completes.
 */
export async function markSharedAudioPlayed(sharedId: string): Promise<void> {
  try {
    const sharedRef = doc(db, COLLECTION, sharedId);
    await setDoc(sharedRef, { played: true }, { merge: true });
    console.log('✅ Shared audio marked as played:', sharedId);
  } catch (error) {
    console.error('Error marking shared audio as played:', error);
    throw error;
  }
}

/**
 * Delete a shared audio document (after playback or expiration).
 */
export async function deleteSharedAudio(sharedId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTION, sharedId));
    console.log('🗑️ Shared audio deleted:', sharedId);
  } catch (error) {
    console.error('Error deleting shared audio:', error);
    throw error;
  }
}

/**
 * Get all active (non-expired, non-played) shared audio for a user.
 * Useful for a "Shared" tab or list.
 */
export async function getUserSharedAudio(
  userId: string
): Promise<SharedAudio[]> {
  try {
    const q = query(
      collection(db, COLLECTION),
      where('sharedBy', '==', userId),
      where('played', '==', false)
    );

    const snapshot = await getDocs(q);
    const results: SharedAudio[] = [];
    const now = new Date();

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const shared: SharedAudio = {
        ...data,
        id: docSnap.id,
        createdAt: data.createdAt.toDate(),
        expiresAt: data.expiresAt.toDate(),
      } as SharedAudio;

      // Filter out expired (in case cleanup hasn't run)
      if (shared.expiresAt > now) {
        results.push(shared);
      }
    });

    return results;
  } catch (error) {
    console.error('Error getting user shared audio:', error);
    throw error;
  }
}

/**
 * Build the share URL for a given shared audio ID.
 * This URL will be opened by universal links (Sink app) or fall back to web.
 *
 * For now, returns a web URL. When you set up a custom domain, update the base.
 */
export function buildShareUrl(sharedId: string): string {
  return `https://yourname.media/sink/${sharedId}`;
}
