import { auth, db, storage } from '@/config/firebase';
import { PreGeneratedStory, Story } from '@/types/story';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    setDoc,
    Timestamp,
    where,
} from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';

/**
 * Save a user's generated story to Firestore
 */
export async function saveStory(
  userId: string,
  storyData: Omit<Story, 'id' | 'userId' | 'createdAt'>
): Promise<string> {
  try {
    const storyRef = doc(collection(db, 'stories'));
    const story: Story = {
      id: storyRef.id,
      userId,
      ...storyData,
      createdAt: new Date(),
    };

    await setDoc(storyRef, {
      ...story,
      createdAt: Timestamp.fromDate(story.createdAt),
    });

    console.log('Story saved:', storyRef.id);
    return storyRef.id;
  } catch (error) {
    console.error('Error saving story:', error);
    throw error;
  }
}

/**
 * Get all stories for a specific user
 */
export async function getUserStories(userId: string): Promise<Story[]> {
  try {
    const q = query(
      collection(db, 'stories'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const stories: Story[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      stories.push({
        ...data,
        id: doc.id,
        createdAt: data.createdAt.toDate(),
      } as Story);
    });

    return stories;
  } catch (error) {
    console.error('Error getting user stories:', error);
    throw error;
  }
}

/**
 * Get a single story by ID
 */
export async function getStory(storyId: string): Promise<Story | null> {
  try {
    const storyDoc = await getDoc(doc(db, 'stories', storyId));
    
    if (!storyDoc.exists()) {
      return null;
    }

    const data = storyDoc.data();
    return {
      ...data,
      id: storyDoc.id,
      createdAt: data.createdAt.toDate(),
    } as Story;
  } catch (error) {
    console.error('Error getting story:', error);
    throw error;
  }
}

/**
 * Get all pre-generated stories
 */
export async function getPreGeneratedStories(): Promise<PreGeneratedStory[]> {
  try {
    const q = query(
      collection(db, 'preGeneratedStories'),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const stories: PreGeneratedStory[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      stories.push({
        ...data,
        id: doc.id,
        createdAt: data.createdAt.toDate(),
      } as PreGeneratedStory);
    });

    return stories;
  } catch (error) {
    console.error('Error getting pre-generated stories:', error);
    throw error;
  }
}

/**
 * Upload a single audio chunk to Firebase Storage (Web version).
 * Accepts a Blob directly instead of a local file path.
 *
 * @param userId - The user's UID
 * @param audioBlob - The audio Blob to upload
 * @param isNighttime - Whether this is a nighttime story (determines storage folder)
 * @param chunkIndex - Index of this chunk (for unique filenames)
 * @returns The Firebase Storage download URL for this chunk
 */
export async function uploadAudioChunk(
  userId: string,
  audioBlob: Blob,
  isNighttime: boolean,
  chunkIndex: number
): Promise<string> {
  try {
    const timestamp = Date.now();
    const filename = `${userId}-${timestamp}-chunk${chunkIndex}.mp3`;
    const storagePath = isNighttime ? 'generated-audio/nighttime' : 'generated-audio/daytime';
    const fullPath = `${storagePath}/${filename}`;

    console.log(`📤 Uploading chunk ${chunkIndex}...`, {
      path: fullPath,
      fileSizeKB: (audioBlob.size / 1024).toFixed(1),
    });

    if (audioBlob.size === 0) {
      throw new Error(`Audio chunk ${chunkIndex} is empty - cannot upload`);
    }

    // Get auth token
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('No authenticated user');
    const token = await currentUser.getIdToken();

    // Upload via Firebase Storage REST API
    const bucket = storage.app.options.storageBucket || '';
    const encodedPath = encodeURIComponent(fullPath);
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${encodedPath}`;

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Firebase ${token}`,
        'Content-Type': 'audio/mpeg',
      },
      body: audioBlob,
    });

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      console.error('❌ Upload response:', uploadRes.status, errorText.substring(0, 300));
      throw new Error(`Upload failed (chunk ${chunkIndex}): ${uploadRes.status} - ${errorText.substring(0, 200)}`);
    }

    // Get download URL via SDK
    const storageRefObj = ref(storage, fullPath);
    const downloadURL = await getDownloadURL(storageRefObj);
    console.log(`✅ Chunk ${chunkIndex} uploaded: ${downloadURL.substring(0, 80)}...`);

    return downloadURL;
  } catch (error) {
    console.error(`❌ Error uploading chunk ${chunkIndex}:`, error);
    throw error;
  }
}

/**
 * Get all static audio stories (available to all users)
 */
export async function getStaticStories(): Promise<PreGeneratedStory[]> {
  try {
    const q = query(
      collection(db, 'staticStories'),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const stories: PreGeneratedStory[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      stories.push({
        ...data,
        id: doc.id,
        createdAt: data.createdAt.toDate(),
      } as PreGeneratedStory);
    });

    return stories;
  } catch (error) {
    console.error('Error getting static stories:', error);
    throw error;
  }
}
