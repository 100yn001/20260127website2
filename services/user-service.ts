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

/** Beta cap: how many stories a user can generate per local day. */
export const DAILY_STORY_LIMIT = 5;

/** YYYY-MM-DD in the user's local timezone. Used as the rollover key. */
function localDateKey(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Thrown by `checkAndIncrementDailyStoryCount` when the user is at the cap. */
export class DailyStoryLimitError extends Error {
  constructor() {
    super("you've used your 5 stories for today — come back tomorrow");
    this.name = 'DailyStoryLimitError';
  }
}

/**
 * Atomically check the per-day story counter and (if under the cap) bump it.
 * Throws `DailyStoryLimitError` when the user has already generated their
 * `DAILY_STORY_LIMIT` for today. Callers should wrap generation with this
 * BEFORE doing any expensive work.
 *
 * Race-safe: a Firestore transaction reads + writes the counter so two
 * simultaneous create-story taps can't both slip past the cap on the 5th.
 */
export async function checkAndIncrementDailyStoryCount(uid: string): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const today = localDateKey();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    const data = snap.exists() ? snap.data() : {};
    const usage = (data?.dailyUsage as { date?: string; count?: number } | undefined) ?? {};
    const sameDay = usage.date === today;
    const current = sameDay && typeof usage.count === 'number' ? usage.count : 0;
    if (current >= DAILY_STORY_LIMIT) {
      throw new DailyStoryLimitError();
    }
    tx.set(
      userRef,
      {
        dailyUsage: { date: today, count: current + 1 },
        updatedAt: Timestamp.fromDate(new Date()),
      },
      { merge: true },
    );
  });
}

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

    // Delete user profile
    const userRef = doc(db, 'users', uid);
    await deleteDoc(userRef);

    console.log('User data deleted:', uid);
  } catch (error) {
    console.error('Error deleting user data:', error);
    throw error;
  }
}
