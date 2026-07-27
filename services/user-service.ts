import { db } from '@/config/firebase';
import { UserProfile } from '@/types/user';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';

// The old 5/day client-side cap is gone — story allowances (2 lifetime free,
// then $3/mo → 15/month) are enforced server-side in the generation Cloud
// Function's claim transaction; see services/entitlements-service.ts for the
// client view.

export interface CreateUserProfileExtras {
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

/**
 * Create or update user profile in Firestore. `extras` carries optional
 * Stripe-side identifiers populated by the createStripeCustomer Cloud
 * Function — passed through here so we don't need a second Firestore write
 * during signup.
 */
export async function saveUserProfile(
  uid: string,
  email: string,
  name: string,
  onboardingAnswers: UserProfile['onboardingAnswers'],
  extras?: CreateUserProfileExtras,
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
      ...(extras?.stripeCustomerId ? { stripeCustomerId: extras.stripeCustomerId } : {}),
      ...(extras?.stripeSubscriptionId ? { stripeSubscriptionId: extras.stripeSubscriptionId } : {}),
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
 * Merge arbitrary profile fields into users/{uid}. Used for preferences
 * (artworkTint, aboutYou, notifications, etc.) that don't need their own
 * dedicated service call.
 */
export async function updateUserProfile(
  uid: string,
  patch: Partial<UserProfile> & Record<string, unknown>
): Promise<void> {
  try {
    const userRef = doc(db, 'users', uid);
    await setDoc(
      userRef,
      { ...patch, updatedAt: Timestamp.fromDate(new Date()) },
      { merge: true }
    );
  } catch (error) {
    console.error('Error updating user profile:', error);
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

    // Also remove the user's Fable refusal logs (which hold their prompts) and
    // any shared-audio links. Fail-soft per collection so the core deletion
    // still completes even if rules disallow one of them.
    for (const [coll, field] of [['fableRefusals', 'uid'], ['sharedAudio', 'sharedBy']] as const) {
      try {
        const snap = await getDocs(query(collection(db, coll), where(field, '==', uid)));
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      } catch (e) {
        console.warn(`Account-deletion cleanup of ${coll} failed (continuing):`, e);
      }
    }

    // Delete the user's owned subcollections (queue, voices, narrators). Owner
    // rules permit these; fail-soft so one bad collection can't abort the rest.
    for (const sub of ['queue', 'voices', 'narrators'] as const) {
      try {
        const snap = await getDocs(collection(db, 'users', uid, sub));
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      } catch (e) {
        console.warn(`Account-deletion cleanup of users/${uid}/${sub} failed (continuing):`, e);
      }
    }

    // Delete user profile
    const userRef = doc(db, 'users', uid);
    await deleteDoc(userRef);

    console.log('User data deleted:', uid);
  } catch (error) {
    console.error('Error deleting user data:', error);
    throw error;
  }
}
