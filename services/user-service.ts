import { db } from '@/config/firebase';
import { UserProfile } from '@/types/user';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, Timestamp, where } from 'firebase/firestore';

/**
 * Create or update user profile in Firestore
 */
export async function saveUserProfile(
  uid: string,
  email: string,
  name: string,
  onboardingAnswers: UserProfile['onboardingAnswers']
): Promise<void> {
  try {
    const userRef = doc(db, 'users', uid);
    const now = new Date();

    const userProfile: Omit<UserProfile, 'createdAt' | 'updatedAt'> & {
      createdAt: Timestamp;
      updatedAt: Timestamp;
    } = {
      uid,
      email,
      name,
      onboardingAnswers,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    };

    await setDoc(userRef, userProfile, { merge: true });
    console.log('User profile saved:', uid);
  } catch (error) {
    console.error('Error saving user profile:', error);
    throw error;
  }
}

/**
 * Save the silver-card metadata for a user. Merged under users/{uid}.silverCard.
 * Called from CardStage after the Replicate generation succeeds.
 */
export async function saveSilverCard(
  uid: string,
  card: {
    storytellingWords: string;
    archetypeId: string;
    archetypeTitle: string;
    heroSub: string;
    museSub: string;
    shadowSub: string;
    scenePrompt: string;
    imageUrl?: string;
  }
): Promise<void> {
  try {
    const userRef = doc(db, 'users', uid);
    const now = Timestamp.fromDate(new Date());
    await setDoc(
      userRef,
      {
        silverCard: { ...card, generatedAt: now },
        updatedAt: now,
      },
      { merge: true }
    );
  } catch (error) {
    console.error('Error saving silver card:', error);
    throw error;
  }
}

/**
 * Get user profile from Firestore
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const userRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return null;
    }

    const data = userDoc.data();
    return {
      ...data,
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt.toDate(),
    } as UserProfile;
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw error;
  }
}

/**
 * Update user's name
 */
export async function updateUserName(uid: string, name: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', uid);
    await setDoc(
      userRef,
      {
        name,
        updatedAt: Timestamp.fromDate(new Date()),
      },
      { merge: true }
    );
    console.log('User name updated:', uid);
  } catch (error) {
    console.error('Error updating user name:', error);
    throw error;
  }
}

/**
 * Add a story to user's bookmarks
 */
export async function addBookmark(uid: string, storyId: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userRef);
    
    const currentBookmarks = userDoc.exists() ? (userDoc.data().bookmarkedStories || []) : [];
    
    if (!currentBookmarks.includes(storyId)) {
      await setDoc(
        userRef,
        {
          bookmarkedStories: [...currentBookmarks, storyId],
          updatedAt: Timestamp.fromDate(new Date()),
        },
        { merge: true }
      );
      console.log('Bookmark added:', storyId);
    }
  } catch (error) {
    console.error('Error adding bookmark:', error);
    throw error;
  }
}

/**
 * Remove a story from user's bookmarks
 */
export async function removeBookmark(uid: string, storyId: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) return;
    
    const currentBookmarks = userDoc.data().bookmarkedStories || [];
    const updatedBookmarks = currentBookmarks.filter((id: string) => id !== storyId);
    
    await setDoc(
      userRef,
      {
        bookmarkedStories: updatedBookmarks,
        updatedAt: Timestamp.fromDate(new Date()),
      },
      { merge: true }
    );
    console.log('Bookmark removed:', storyId);
  } catch (error) {
    console.error('Error removing bookmark:', error);
    throw error;
  }
}

/**
 * Get user's bookmarked story IDs
 */
export async function getBookmarkedStoryIds(uid: string): Promise<string[]> {
  try {
    const userRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) return [];
    
    return userDoc.data().bookmarkedStories || [];
  } catch (error) {
    console.error('Error getting bookmarked stories:', error);
    throw error;
  }
}

/**
 * Delete all user data from Firestore (user profile and their stories)
 */
export async function deleteUserData(uid: string): Promise<void> {
  try {
    // Delete user's stories
    const storiesQuery = query(collection(db, 'stories'), where('userId', '==', uid));
    const storiesSnapshot = await getDocs(storiesQuery);
    const storyDeletePromises = storiesSnapshot.docs.map(storyDoc => deleteDoc(storyDoc.ref));
    await Promise.all(storyDeletePromises);

    // Delete user profile
    const userRef = doc(db, 'users', uid);
    await deleteDoc(userRef);

    console.log('User data deleted:', uid);
  } catch (error) {
    console.error('Error deleting user data:', error);
    throw error;
  }
}
