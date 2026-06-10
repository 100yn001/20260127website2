import { db } from '@/config/firebase';
import { generateAudioStory } from '@/services/audio-generation';
import { sendStoryReadyNotification } from '@/services/notification-service';
import { collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, setDoc, Timestamp } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

export type GenerationStep = 
  | 'queued'
  | 'generating_prompt'
  | 'generating_transcript'
  | 'generating_audio'
  | 'uploading'
  | 'complete'
  | 'error';

export const STEP_LABELS: Record<GenerationStep, string> = {
  queued: 'Queued',
  generating_prompt: 'Writing story outline...',
  generating_transcript: 'Generating transcript...',
  generating_audio: 'Creating audio...',
  uploading: 'Uploading to library...',
  complete: 'Complete',
  error: 'Error',
};

export interface QueuedStory {
  id: string;
  recipeData: any;
  followUpQuestions: string[];
  followUpAnswers: string[];
  status: 'pending' | 'generating' | 'complete' | 'error';
  progress: number;
  currentStep?: GenerationStep;
  createdAt: Date;
  completedAt?: Date;
  storyId?: string;
  audioUrl?: string;
  audioChunkURLs?: string[];
  transcript?: string;
  error?: string;
  retryCount?: number; // Track network retry attempts
  fcmToken?: string; // For push notifications when story completes
}

interface StoryQueueContextType {
  queue: QueuedStory[];
  addToQueue: (recipeData: any, followUpQuestions: string[], followUpAnswers: string[]) => Promise<string>;
  removeFromQueue: (id: string) => void;
  retryStory: (id: string) => Promise<void>;
  clearQueue: () => Promise<void>;
  resetStuckStories: () => Promise<void>;
}

const StoryQueueContext = createContext<StoryQueueContextType | undefined>(undefined);

export function StoryQueueProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<QueuedStory[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingIdRef = React.useRef<string | null>(null); // Track which story is being processed
  const localProgressRef = React.useRef<{ id: string; progress: number; step: GenerationStep } | null>(null); // Track local progress to prevent Firestore overwrites
  const { user } = useAuth();

  // Load queue from Firestore when user logs in
  useEffect(() => {
    if (!user) {
      setQueue([]);
      setIsLoaded(false);
      setIsProcessing(false);
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
            
            // Skip items older than 24 hours that are stuck in generating state
            const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
            if (data.status === 'generating' && hoursSinceCreation > 24) {
              console.log('🧹 Cleaning up very old generating item (>24h):', docSnap.id);
              await deleteDoc(doc(db, 'users', user.uid, 'queue', docSnap.id));
              continue;
            }
            
            // Skip completed items older than 7 days
            if (data.status === 'complete' && hoursSinceCreation > 168) {
              console.log('🧹 Cleaning up old completed item:', docSnap.id);
              await deleteDoc(doc(db, 'users', user.uid, 'queue', docSnap.id));
              continue;
            }
            
            // Use local progress AND status if this is the currently generating story to prevent Firestore from overwriting
            // BUT: never override if Firestore says 'complete' or 'error' - those are final states
            const isActivelyGenerating = (localProgressRef.current?.id === docSnap.id || processingIdRef.current === docSnap.id) 
              && data.status !== 'complete' && data.status !== 'error';
            const localProgress = localProgressRef.current?.id === docSnap.id ? localProgressRef.current.progress : null;
            const firestoreProgress = data.progress || 0;
            // Never let progress go backwards during active generation - use max of local and firestore
            const progress = isActivelyGenerating 
              ? Math.max(localProgress ?? 0, firestoreProgress)
              : firestoreProgress;
            // If we're actively generating (and not complete/error), force status to 'generating'
            const status = isActivelyGenerating ? 'generating' : data.status;
            
            if (isActivelyGenerating && data.status !== 'generating') {
              console.log('⚠️ Firestore status mismatch - keeping local generating status:', { firestoreStatus: data.status, localProgress: progress });
            }
            
            // Use local step if actively generating
            const currentStep = isActivelyGenerating && localProgressRef.current?.id === docSnap.id
              ? localProgressRef.current.step
              : (data.currentStep || (data.status === 'pending' ? 'queued' : undefined));
            
            loadedQueue.push({
              id: docSnap.id,
              recipeData: data.recipeData,
              followUpQuestions: data.followUpQuestions || [],
              followUpAnswers: data.followUpAnswers,
              status,
              progress,
              currentStep,
              createdAt,
              completedAt: data.completedAt instanceof Timestamp ? data.completedAt.toDate() : undefined,
              storyId: data.storyId,
              audioUrl: data.audioUrl,
              audioChunkURLs: data.audioChunkURLs || [],
              transcript: data.transcript,
              error: data.error,
            });
          }
          
          setQueue(loadedQueue);
          setIsLoaded(true);
        },
        (error) => {
          console.error('Error loading queue:', error);
          setIsLoaded(true);
        }
      );

    return () => unsubscribe();
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

  // Save queue changes to Firestore
  const saveQueueItem = async (item: QueuedStory) => {
    if (!user) {
      console.error('[Queue] saveQueueItem called with no authed user — aborting');
      throw new Error('you must be signed in to queue a story');
    }

    // Deep-clean recipeData so nested undefined values don't silently fail
    // the Firestore write.
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
        fcmToken: item.fcmToken || null,
      });
      console.log('[Queue] saved', item.id, 'status=', item.status, 'uid=', user.uid);
    } catch (error) {
      // Surface the real error to the caller instead of swallowing it —
      // otherwise addToQueue reports "success" even when the doc never
      // actually hit Firestore, and the UI shows nothing in mystories.
      console.error('[Queue] Error saving queue item:', error);
      throw error;
    }
  };

  const deleteQueueItem = async (id: string) => {
    if (!user) return;
    
    try {
      const docRef = doc(db, 'users', user.uid, 'queue', id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Error deleting queue item:', error);
    }
  };

  // Process queue
  useEffect(() => {
    if (!isLoaded || isProcessing) return;
    
    const processQueue = async () => {
      // Check for stuck 'generating' stories (older than 15 minutes — well past the 12-min timeout)
      const FIFTEEN_MINUTES = 15 * 60 * 1000;
      const now = new Date().getTime();
      const stuckStory = queue.find(s => {
        if (s.status !== 'generating') return false;
        const createdTime = s.createdAt instanceof Date ? s.createdAt.getTime() : new Date(s.createdAt).getTime();
        return (now - createdTime) > FIFTEEN_MINUTES;
      });

      if (stuckStory) {
        console.log('🔄 Found stuck story, resetting to error:', stuckStory.id);
        const errorStory = {
          ...stuckStory,
          status: 'error' as const,
          progress: 0,
          error: 'Generation timed out. Please retry.',
        };
        await saveQueueItem(errorStory);
        return; // Let the next cycle pick up pending stories
      }

      // Find next pending story
      const pendingStory = queue.find(s => s.status === 'pending');
      if (!pendingStory || !user) return;

      // Check if already processing (but not stuck)
      const alreadyGenerating = queue.find(s => s.status === 'generating');
      if (alreadyGenerating) {
        console.log('⏳ Story already generating, skipping...');
        return;
      }

      // Double-check we're not already processing this story
      if (processingIdRef.current === pendingStory.id) {
        console.log('⚠️ Already processing this story, skipping:', pendingStory.id);
        return;
      }
      
      setIsProcessing(true);
      processingIdRef.current = pendingStory.id;
      console.log('🎬 Starting story generation for:', pendingStory.id);

      // Mark as generating immediately to prevent other instances from picking it up
      const updatedStory = { ...pendingStory, status: 'generating' as const, progress: 10, currentStep: 'generating_prompt' as GenerationStep };
      localProgressRef.current = { id: pendingStory.id, progress: 10, step: 'generating_prompt' }; // Track locally to prevent Firestore overwrites
      await saveQueueItem(updatedStory);

      // Track progress interval so we can clear it in all cases
      let progressInterval: ReturnType<typeof setInterval> | null = null;
      let isComplete = false;

      try {
        // Simulate progress updates with variable speeds to reflect actual work:
        // - 10-30%: Fast (system prompt generation ~10-15s)
        // - 30-50%: Medium (transcript generation ~15-20s)  
        // - 50-75%: Slow (audio generation takes longest ~30-60s)
        // - 75-85%: Very slow (audio upload/save ~10-15s)
        let currentProgress = 10;
        let tickCount = 0;
        progressInterval = setInterval(async () => {
          if (isComplete) return;
          tickCount++;
          
          let increment = 0;
          if (currentProgress < 30) {
            // Fast progress for system prompt phase
            increment = 4;
          } else if (currentProgress < 50) {
            // Medium progress for transcript phase
            increment = 3;
          } else if (currentProgress < 75) {
            // Slow progress for audio generation (the longest phase)
            increment = 1.5;
          } else if (currentProgress < 85) {
            // Very slow for upload phase
            increment = 0.5;
          }
          
          if (increment > 0 && currentProgress < 85) {
            currentProgress = Math.min(currentProgress + increment, 85);
            const roundedProgress = Math.round(currentProgress);
            
            // Determine current step based on progress
            let currentStep: GenerationStep = 'generating_prompt';
            if (currentProgress >= 75) {
              currentStep = 'uploading';
            } else if (currentProgress >= 50) {
              currentStep = 'generating_audio';
            } else if (currentProgress >= 30) {
              currentStep = 'generating_transcript';
            }
            
            localProgressRef.current = { id: pendingStory.id, progress: roundedProgress, step: currentStep };
            const updated = { 
              ...pendingStory, 
              status: 'generating' as const,
              progress: roundedProgress,
              currentStep
            };
            await saveQueueItem(updated);
          }
        }, 2000);

        // Generate the story with timeout
        const GENERATION_TIMEOUT = 12 * 60 * 1000; // 12 minutes (2 Grok calls + multiple ElevenLabs chunks + upload)
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Generation timed out after 12 minutes')), GENERATION_TIMEOUT);
        });
        
        const result = await Promise.race([
          generateAudioStory(
            pendingStory.recipeData,
            pendingStory.followUpQuestions,
            pendingStory.followUpAnswers,
            user.uid
          ),
          timeoutPromise
        ]);

        // Mark as complete immediately to stop progress updates
        isComplete = true;

        // Fetch the saved story to get the Firebase Storage URL
        const storyDoc = await getDoc(doc(db, 'stories', result.storyId));
        const storyData = storyDoc.data();
        
        if (!storyData) {
          throw new Error('Story was not saved to Firestore');
        }

        // Mark as complete with Firebase Storage URLs
        const completedStory = {
          ...pendingStory,
          status: 'complete' as const,
          progress: 100,
          completedAt: new Date(),
          storyId: result.storyId,
          audioUrl: storyData.audioUrl,
          audioChunkURLs: storyData.audioChunkURLs || [],
          transcript: result.transcript,
        };
        await saveQueueItem(completedStory);
        
        console.log('✅ Queue item updated with Firebase Storage URLs:', storyData.audioChunkURLs?.length, 'chunks');

        // Send notification (only if enabled in settings)
        await sendStoryReadyNotification();

      } catch (error: any) {
        isComplete = true; // Stop progress updates on error too
        console.error('Error generating story:', error);
        console.error('Error name:', error.name, 'Message:', error.message);
        
        // Check if this is a network error that should be retried
        // Be precise to avoid false positives that reset progress unnecessarily
        const errorMessage = error.message?.toLowerCase() || '';
        
        // Timeout errors should NOT be retried - they indicate the API is too slow
        const isTimeoutError = 
          errorMessage.includes('timed out') ||
          errorMessage.includes('timeout') ||
          error.name === 'AbortError';
        
        const isNetworkError = !isTimeoutError && (
          errorMessage.includes('network request failed') ||
          errorMessage.includes('failed to fetch') ||
          errorMessage.includes('networkerror') ||
          errorMessage.includes('econnreset') ||
          errorMessage.includes('enotfound')
        );
        
        console.log('🔍 Error analysis:', { isTimeoutError, isNetworkError, errorName: error.name, errorMessage });
        
        const currentRetryCount = pendingStory.retryCount || 0;
        const MAX_RETRIES = 3;
        
        if (isTimeoutError) {
          // Timeout errors - don't retry, show clear message
          console.log('⏱️ Timeout error, marking as error:', pendingStory.id);
          const errorStory = {
            ...pendingStory,
            status: 'error' as const,
            progress: 0,
            error: 'Generation timed out - please retry',
          };
          await saveQueueItem(errorStory);
        } else if (isNetworkError && currentRetryCount < MAX_RETRIES) {
          // For network errors, reset to pending so it can be retried automatically
          console.log(`🔄 Network error detected, resetting story for retry (${currentRetryCount + 1}/${MAX_RETRIES}):`, pendingStory.id);
          const retryStory = {
            ...pendingStory,
            status: 'pending' as const,
            progress: 0,
            retryCount: currentRetryCount + 1,
          };
          await saveQueueItem(retryStory);
        } else if (isNetworkError) {
          // Max retries exceeded
          const errorStory = {
            ...pendingStory,
            status: 'error' as const,
            progress: 0,
            error: 'Network error - please check your connection and retry',
          };
          await saveQueueItem(errorStory);
        } else {
          // For other errors, mark as error. Map Fable content-moderation
          // refusals to a friendly message rather than leaking the raw
          // "CONTENT_MODERATION: claude-fable-5 refused..." string.
          const isModeration = errorMessage.includes('content_moderation');
          const errorStory = {
            ...pendingStory,
            status: 'error' as const,
            progress: 0,
            error: isModeration
              ? "we couldn't make this one — try rephrasing your prompt and generate again"
              : error.message || 'Failed to generate story',
          };
          await saveQueueItem(errorStory);
        }
      } finally {
        // Always clear the interval and local progress ref
        if (progressInterval) {
          clearInterval(progressInterval);
        }
        localProgressRef.current = null; // Clear local progress tracking
        processingIdRef.current = null;
        setIsProcessing(false);
        console.log('🏁 Story generation finished');
      }
    };

    processQueue();
  }, [queue, user, isLoaded, isProcessing]);

  const addToQueue = async (recipeData: any, followUpQuestions: string[], followUpAnswers: string[]): Promise<string> => {
    const queueId = `queue-${Date.now()}`;
    
    const newStory: QueuedStory = {
      id: queueId,
      recipeData,
      followUpQuestions,
      followUpAnswers,
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
    };

    await saveQueueItem(newStory);
    return queueId;
  };

  const removeFromQueue = async (id: string) => {
    await deleteQueueItem(id);
  };

  const retryStory = async (id: string) => {
    const story = queue.find(s => s.id === id);
    if (!story) return;
    
    const retryStory = {
      ...story,
      status: 'pending' as const,
      progress: 0,
      error: undefined,
    };
    await saveQueueItem(retryStory);
  };

  const clearQueue = async () => {
    // Delete all pending and error items (not currently generating)
    const itemsToDelete = queue.filter(s => s.status === 'pending' || s.status === 'error');
    await Promise.all(itemsToDelete.map(item => deleteQueueItem(item.id)));
  };

  const resetStuckStories = async () => {
    // Reset any 'generating' stories to 'pending' so they can be retried
    const stuckStories = queue.filter(s => s.status === 'generating');
    console.log('🔄 Resetting stuck stories:', stuckStories.length);
    await Promise.all(stuckStories.map(async (story) => {
      const resetStory = {
        ...story,
        status: 'pending' as const,
        progress: 0,
      };
      await saveQueueItem(resetStory);
    }));
    // Reset local processing state
    setIsProcessing(false);
  };

  return (
    <StoryQueueContext.Provider value={{ queue, addToQueue, removeFromQueue, retryStory, clearQueue, resetStuckStories }}>
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
