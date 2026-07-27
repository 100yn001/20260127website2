import { db } from '@/config/firebase';
import {
  canGenerate,
  subscribeToEntitlements,
  type Entitlements,
} from '@/services/entitlements-service';
import { sendStoryReadyNotification } from '@/services/notification-service';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, Timestamp } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

/**
 * Story queue — CLIENT VIEW ONLY.
 *
 * Generation happens server-side: writing a doc with status 'pending' to
 * users/{uid}/queue triggers the generateStory Cloud Function pipeline, which
 * owns every status/progress transition from there (including
 * 'payment_required' when the user has no free stories or subscription
 * allowance left). This context just writes pending docs and mirrors
 * Firestore snapshots into React state.
 */

export type GenerationStep =
  | 'queued'
  | 'generating_prompt'
  | 'generating_transcript'
  | 'generating_audio'
  | 'uploading'
  | 'complete'
  | 'payment_required'
  | 'error';

export const STEP_LABELS: Record<GenerationStep, string> = {
  queued: 'Queued',
  generating_prompt: 'Writing story outline...',
  generating_transcript: 'Generating transcript...',
  generating_audio: 'Creating audio...',
  uploading: 'Uploading to library...',
  complete: 'Complete',
  payment_required: 'Subscription needed',
  error: 'Error',
};

export interface QueuedStory {
  id: string;
  recipeData: any;
  followUpQuestions: string[];
  followUpAnswers: string[];
  status: 'pending' | 'generating' | 'complete' | 'payment_required' | 'error';
  progress: number;
  currentStep?: GenerationStep;
  createdAt: Date;
  completedAt?: Date;
  storyId?: string;
  audioUrl?: string;
  audioChunkURLs?: string[];
  transcript?: string;
  error?: string;
}

interface StoryQueueContextType {
  queue: QueuedStory[];
  /** False until the first queue snapshot arrives for the current user. */
  queueLoaded: boolean;
  /** Most recent item blocked on payment, if any — drives the paywall sheet. */
  paymentRequiredItem: QueuedStory | null;
  /** Live view of the server-only entitlements doc (null before first snapshot). */
  entitlements: Entitlements | null;
  addToQueue: (recipeData: any, followUpQuestions: string[], followUpAnswers: string[]) => Promise<string>;
  removeFromQueue: (id: string) => void;
  retryStory: (id: string) => Promise<void>;
  /** Re-pend payment_required items (once each) — used right after subscribing. */
  resumeBlockedStories: () => Promise<number>;
  clearQueue: () => Promise<void>;
  resetStuckStories: () => Promise<void>;
}

const StoryQueueContext = createContext<StoryQueueContextType | undefined>(undefined);

export function StoryQueueProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<QueuedStory[]>([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const prevStatusRef = React.useRef<Record<string, string>>({});
  const autoResumedRef = React.useRef<Set<string>>(new Set());
  const prevCanGenerateRef = React.useRef<boolean | null>(null);
  const { user } = useAuth();

  // Mirror the Firestore queue. The Cloud Function writes real progress, so
  // there is no local progress simulation any more.
  useEffect(() => {
    if (!user) {
      setQueue([]);
      setQueueLoaded(false);
      prevStatusRef.current = {};
      autoResumedRef.current = new Set();
      prevCanGenerateRef.current = null;
      return;
    }

    const queueRef = collection(db, 'users', user.uid, 'queue');
    const q = query(queueRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const loadedQueue: QueuedStory[] = [];
        const now = new Date();

        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
          const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

          // Very old stuck items (>24h): the server sweeper should have
          // refunded + errored these long ago; if one survives, drop it.
          if (data.status === 'generating' && hoursSinceCreation > 24) {
            console.log('🧹 Cleaning up very old generating item (>24h):', docSnap.id);
            await deleteDoc(doc(db, 'users', user.uid, 'queue', docSnap.id));
            continue;
          }

          // Completed items older than 7 days
          if (data.status === 'complete' && hoursSinceCreation > 168) {
            console.log('🧹 Cleaning up old completed item:', docSnap.id);
            await deleteDoc(doc(db, 'users', user.uid, 'queue', docSnap.id));
            continue;
          }

          loadedQueue.push({
            id: docSnap.id,
            recipeData: data.recipeData,
            followUpQuestions: data.followUpQuestions || [],
            followUpAnswers: data.followUpAnswers,
            status: data.status,
            progress: data.progress || 0,
            currentStep: data.currentStep || (data.status === 'pending' ? 'queued' : undefined),
            createdAt,
            completedAt: data.completedAt instanceof Timestamp ? data.completedAt.toDate() : undefined,
            storyId: data.storyId,
            audioUrl: data.audioUrl,
            audioChunkURLs: data.audioChunkURLs || [],
            transcript: data.transcript,
            error: data.error,
          });
        }

        // Local notification when a story finishes (server has no push path).
        for (const item of loadedQueue) {
          const prev = prevStatusRef.current[item.id];
          if (prev && prev !== 'complete' && item.status === 'complete') {
            sendStoryReadyNotification().catch(() => {});
          }
        }
        prevStatusRef.current = Object.fromEntries(loadedQueue.map((i) => [i.id, i.status]));

        setQueue(loadedQueue);
        setQueueLoaded(true);
      },
      (error) => {
        console.error('Error loading queue:', error);
        setQueueLoaded(true);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Mirror the entitlements doc alongside the queue so the paywall sheet and
  // billing-return flows share one live view.
  useEffect(() => {
    if (!user) {
      setEntitlements(null);
      return;
    }
    return subscribeToEntitlements(user.uid, setEntitlements);
  }, [user]);

  // Recursively strip undefined values — Firestore rejects writes that
  // contain any undefined value at any depth.
  const stripUndefined = (value: any): any => {
    if (value === undefined) return null;
    if (value === null) return null;
    if (Array.isArray(value)) return value.map(stripUndefined);
    if (typeof value === 'object') {
      const out: any = {};
      for (const [k, v] of Object.entries(value)) {
        if (v === undefined) continue;
        out[k] = stripUndefined(v);
      }
      return out;
    }
    return value;
  };

  const saveQueueItem = async (item: QueuedStory) => {
    if (!user) {
      console.error('[Queue] saveQueueItem called with no authed user — aborting');
      throw new Error('you must be signed in to queue a story');
    }

    const cleanedRecipeData = stripUndefined(item.recipeData);

    const docRef = doc(db, 'users', user.uid, 'queue', item.id);
    try {
      await setDoc(docRef, {
        recipeData: cleanedRecipeData,
        followUpQuestions: item.followUpQuestions,
        followUpAnswers: item.followUpAnswers,
        status: item.status,
        progress: item.progress,
        currentStep: item.currentStep || null,
        createdAt: Timestamp.fromDate(item.createdAt),
        completedAt: item.completedAt ? Timestamp.fromDate(item.completedAt) : null,
        storyId: item.storyId || null,
        audioUrl: item.audioUrl || null,
        audioChunkURLs: item.audioChunkURLs || [],
        transcript: item.transcript || null,
        error: item.error || null,
      });
      console.log('[Queue] saved', item.id, 'status=', item.status, 'uid=', user.uid);
    } catch (error) {
      console.error('[Queue] Error saving queue item:', error);
      throw error;
    }
  };

  const deleteQueueItem = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'queue', id));
    } catch (error) {
      console.error('Error deleting queue item:', error);
    }
  };

  const addToQueue = async (recipeData: any, followUpQuestions: string[], followUpAnswers: string[]): Promise<string> => {
    const queueId = `queue-${Date.now()}`;

    const newStory: QueuedStory = {
      id: queueId,
      recipeData,
      followUpQuestions,
      followUpAnswers,
      status: 'pending', // the server claims it from here
      progress: 0,
      createdAt: new Date(),
    };

    await saveQueueItem(newStory);
    return queueId;
  };

  const removeFromQueue = async (id: string) => {
    await deleteQueueItem(id);
  };

  /**
   * Retry an errored (refunded) or payment_required item: setting it back to
   * 'pending' re-fires the server trigger, which re-checks entitlements.
   */
  const retryStory = async (id: string) => {
    const story = queue.find(s => s.id === id);
    if (!story) return;

    await saveQueueItem({
      ...story,
      status: 'pending',
      progress: 0,
      error: undefined,
    });
  };

  /**
   * Re-pend every payment_required item so the server re-checks entitlements —
   * called right after a subscription activates. Each item is only ever
   * auto-resumed once (if the server blocks it again, it stays blocked until
   * the user retries by hand).
   */
  const resumeBlockedStories = React.useCallback(async (): Promise<number> => {
    const blocked = queue.filter(
      (s) => s.status === 'payment_required' && !autoResumedRef.current.has(s.id)
    );
    blocked.forEach((s) => autoResumedRef.current.add(s.id));
    await Promise.all(
      blocked.map((item) =>
        saveQueueItem({ ...item, status: 'pending', progress: 0, error: undefined })
      )
    );
    if (blocked.length > 0) console.log('[Queue] resumed blocked stories:', blocked.length);
    return blocked.length;
  }, [queue, user]);

  // Same-session unlock (native checkout browser, or webhook landing while the
  // app is open): when entitlements flip from "can't generate" to "can",
  // resume anything that was blocked on payment. A fresh page load lands with
  // canGenerate already true (no transition) — the vault's ?billing=success
  // handler covers that path explicitly.
  useEffect(() => {
    if (!entitlements || !queueLoaded) return;
    const can = canGenerate(entitlements);
    const prev = prevCanGenerateRef.current;
    prevCanGenerateRef.current = can;
    if (prev === false && can) {
      resumeBlockedStories().catch((e) => console.warn('[Queue] auto-resume failed:', e));
    }
  }, [entitlements, queueLoaded, resumeBlockedStories]);

  const clearQueue = async () => {
    const itemsToDelete = queue.filter(s => s.status === 'pending' || s.status === 'error' || s.status === 'payment_required');
    await Promise.all(itemsToDelete.map(item => deleteQueueItem(item.id)));
  };

  /**
   * Escape hatch for items the server sweeper somehow missed (it errors +
   * refunds stuck 'generating' docs within ~35 min). Only touches items well
   * past that window; deleting rather than re-pending avoids double-charging
   * the user's allowance.
   */
  const resetStuckStories = async () => {
    const cutoff = Date.now() - 45 * 60 * 1000;
    const stuck = queue.filter(s => s.status === 'generating' && s.createdAt.getTime() < cutoff);
    console.log('🔄 Clearing stuck stories:', stuck.length);
    await Promise.all(stuck.map(story => deleteQueueItem(story.id)));
  };

  const paymentRequiredItem = queue.find(s => s.status === 'payment_required') ?? null;

  return (
    <StoryQueueContext.Provider value={{ queue, queueLoaded, paymentRequiredItem, entitlements, addToQueue, removeFromQueue, retryStory, resumeBlockedStories, clearQueue, resetStuckStories }}>
      {children}
    </StoryQueueContext.Provider>
  );
}

export function useStoryQueue() {
  const context = useContext(StoryQueueContext);
  if (!context) {
    throw new Error('useStoryQueue must be used within StoryQueueProvider');
  }
  return context;
}
