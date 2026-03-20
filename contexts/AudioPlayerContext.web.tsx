import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export interface TrackInfo {
  id?: string;
  title: string;
  subtitle?: string;
  audioUrl: string;
  audioChunkURLs?: string[];
  transcript?: string;
  coverColor?: string;
  topographyLayers?: any[];
  metadata?: Record<string, any>;
}

interface AudioPlayerContextValue {
  currentTrack: TrackInfo | null;
  isPlaying: boolean;
  isLoading: boolean;
  position: number;
  duration: number;
  loadTrack: (track: TrackInfo, autoplay?: boolean) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seek: (millis: number) => Promise<void>;
  skipForward: (seconds?: number) => Promise<void>;
  skipBackward: (seconds?: number) => Promise<void>;
  stop: () => Promise<void>;
  isAudioReady: boolean;
  debugInfo: string;
}

/**
 * Fix Firebase Storage URLs where %2F in the object path got decoded to /
 * (e.g. by Expo Router param passing). Re-encodes the path segment after /o/.
 */
function fixFirebaseStorageUrl(url: string): string {
  const match = url.match(/^(https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/)([^?]+)(\?.*)$/);
  if (match) {
    const [, prefix, path, query] = match;
    // Decode first (in case it's partially encoded), then fully re-encode
    const encodedPath = encodeURIComponent(decodeURIComponent(path));
    return prefix + encodedPath + query;
  }
  return url;
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | undefined>(undefined);

export const AudioPlayerProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentTrack, setCurrentTrack] = useState<TrackInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const loadGenerationRef = useRef(0);
  const audioElementsRef = useRef<HTMLAudioElement[]>([]);
  const chunkDurationsRef = useRef<number[]>([]);
  const activeChunkIndexRef = useRef(0);
  const positionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup audio elements
  const cleanupAudioElements = useCallback(() => {
    for (const audio of audioElementsRef.current) {
      try {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      } catch { /* ignore */ }
    }
    audioElementsRef.current = [];
  }, []);

  // Start position tracking interval
  const startPositionTracking = useCallback(() => {
    if (positionIntervalRef.current) clearInterval(positionIntervalRef.current);
    positionIntervalRef.current = setInterval(() => {
      const activeIndex = activeChunkIndexRef.current;
      const audio = audioElementsRef.current[activeIndex];
      if (!audio) return;

      const durations = chunkDurationsRef.current;
      const isChunked = durations.length > 1;

      if (isChunked) {
        // Update chunk durations dynamically if they were initially unknown
        for (let i = 0; i < audioElementsRef.current.length; i++) {
          const el = audioElementsRef.current[i];
          if (el && Number.isFinite(el.duration) && el.duration > 0) {
            durations[i] = Math.round(el.duration * 1000);
          }
        }
        let elapsed = 0;
        for (let i = 0; i < activeIndex; i++) {
          elapsed += durations[i];
        }
        const nextPosition = elapsed + Math.round(audio.currentTime * 1000);
        const nextDuration = durations.reduce((s, d) => s + d, 0);
        setPosition(nextPosition);
        setDuration((currentDuration) =>
          nextDuration > 0 ? Math.max(currentDuration, nextDuration) : currentDuration
        );
      } else {
        const nextPosition = Math.round(audio.currentTime * 1000);
        const nextDuration = Number.isFinite(audio.duration) && audio.duration > 0
          ? Math.round(audio.duration * 1000)
          : 0;
        setPosition(nextPosition);
        setDuration((currentDuration) =>
          nextDuration > 0 ? Math.max(currentDuration, nextDuration) : currentDuration
        );
      }
    }, 250);
  }, []);

  const stopPositionTracking = useCallback(() => {
    if (positionIntervalRef.current) {
      clearInterval(positionIntervalRef.current);
      positionIntervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPositionTracking();
      cleanupAudioElements();
    };
  }, [stopPositionTracking, cleanupAudioElements]);

  // ─── loadTrack ───
  const loadTrack = useCallback(async (track: TrackInfo, autoplay = true) => {
    try {
      setIsLoading(true);
      setIsAudioReady(false);
      setIsPlaying(false);
      stopPositionTracking();

      const currentGen = loadGenerationRef.current + 1;
      loadGenerationRef.current = currentGen;

      // Cleanup previous
      cleanupAudioElements();
      chunkDurationsRef.current = [];
      activeChunkIndexRef.current = 0;
      setPosition(0);
      setDuration(0);

      setCurrentTrack({ ...track });

      // Collect remote URLs
      const remoteURLs = (track.audioChunkURLs && track.audioChunkURLs.length > 0)
        ? track.audioChunkURLs
        : [track.audioUrl];

      // Validate
      for (const u of remoteURLs) {
        if (!u || !u.startsWith('https://')) {
          throw new Error(`Invalid audio URL: ${u?.substring(0, 40)}`);
        }
      }

      setDebugInfo(`loading ${remoteURLs.length} file(s)...`);
      console.log(`🔊 Loading ${remoteURLs.length} audio file(s) for web playback...`);

      // Create Audio elements directly from Firebase download URLs
      // (no blob download needed — <audio> can play cross-origin URLs natively)
      const audioElements: HTMLAudioElement[] = [];
      const durations: number[] = [];

      for (let i = 0; i < remoteURLs.length; i++) {
        const fixedUrl = fixFirebaseStorageUrl(remoteURLs[i]);
        const audio = new Audio(fixedUrl);
        audio.preload = 'auto';

        // Wait until the file is ready enough to play; duration can resolve later.
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const onReady = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve();
          };
          const onError = () => {
            if (settled) return;
            settled = true;
            cleanup();
            const code = audio.error?.code;
            const msg = audio.error?.message || '';
            const codeStr = code === 1 ? 'ABORTED' : code === 2 ? 'NETWORK' : code === 3 ? 'DECODE' : code === 4 ? 'SRC_NOT_SUPPORTED' : `UNKNOWN(${code})`;
            reject(new Error(`Failed to load audio chunk ${i}: ${codeStr} ${msg} [url: ${remoteURLs[i]?.substring(0, 100)}]`));
          };
          const cleanup = () => {
            clearTimeout(timer);
            audio.removeEventListener('loadedmetadata', onReady);
            audio.removeEventListener('canplay', onReady);
            audio.removeEventListener('canplaythrough', onReady);
            audio.removeEventListener('error', onError);
          };
          const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error(`Timeout loading audio chunk ${i}`));
          }, 15000);
          if (audio.readyState >= 1) {
            settled = true;
            clearTimeout(timer);
            resolve();
            return;
          }
          audio.addEventListener('loadedmetadata', onReady);
          audio.addEventListener('canplay', onReady);
          audio.addEventListener('canplaythrough', onReady);
          audio.addEventListener('error', onError);
        });

        durations.push(
          Number.isFinite(audio.duration) && audio.duration > 0
            ? Math.round(audio.duration * 1000)
            : 0
        );
        audioElements.push(audio);
      }

      if (loadGenerationRef.current !== currentGen) {
        audioElements.forEach(a => { try { a.pause(); a.removeAttribute('src'); a.load(); } catch {} });
        return;
      }

      audioElementsRef.current = audioElements;
      chunkDurationsRef.current = durations;

      for (let i = 0; i < audioElements.length; i++) {
        const syncDuration = () => {
          if (loadGenerationRef.current !== currentGen) return;
          const nextDuration =
            Number.isFinite(audioElements[i].duration) && audioElements[i].duration > 0
              ? Math.round(audioElements[i].duration * 1000)
              : 0;
          if (!nextDuration) return;
          chunkDurationsRef.current[i] = nextDuration;
          const nextTotalDuration = chunkDurationsRef.current.reduce((s, d) => s + d, 0);
          setDuration((currentDuration) => Math.max(currentDuration, nextTotalDuration));
        };
        audioElements[i].addEventListener('loadedmetadata', syncDuration);
        audioElements[i].addEventListener('durationchange', syncDuration);
        syncDuration();
      }

      const totalDur = chunkDurationsRef.current.reduce((s, d) => s + d, 0);
      console.log(`📏 Chunk durations: ${durations.map(d => Math.round(d/1000) + 's').join(', ')} = ${Math.round(totalDur/1000)}s total`);
      if (totalDur > 0) {
        setDuration((currentDuration) => Math.max(currentDuration, totalDur));
      }

      // Wire up chunk chaining: when one chunk ends, play the next
      for (let i = 0; i < audioElements.length - 1; i++) {
        const nextIndex = i + 1;
        audioElements[i].addEventListener('ended', () => {
          if (loadGenerationRef.current !== currentGen) return;
          activeChunkIndexRef.current = nextIndex;
          audioElements[nextIndex].currentTime = 0;
          audioElements[nextIndex].play().catch(console.warn);
        });
      }

      // Last chunk ended = playback finished
      audioElements[audioElements.length - 1].addEventListener('ended', () => {
        if (loadGenerationRef.current !== currentGen) return;
        setIsPlaying(false);
        stopPositionTracking();
        console.log('🎵 Queue ended');
      });

      // Track play/pause state changes on all elements
      for (const audio of audioElements) {
        audio.addEventListener('play', () => setIsPlaying(true));
        audio.addEventListener('pause', () => {
          // Only mark as not playing if this is the active chunk
          const activeAudio = audioElementsRef.current[activeChunkIndexRef.current];
          if (audio === activeAudio) setIsPlaying(false);
        });
      }

      setIsAudioReady(true);

      if (autoplay) {
        activeChunkIndexRef.current = 0;
        await audioElements[0].play();
        setIsPlaying(true);
        startPositionTracking();
      }

      setDebugInfo(`playing from web (${remoteURLs.length > 1 ? remoteURLs.length + ' chunks' : 'single'})`);
      console.log('✅ Track loaded via Web Audio:', track.title);
    } catch (error) {
      console.error('❌ Error loading track:', error);
      setDebugInfo(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
      setIsAudioReady(false);
      setIsLoading(false);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [cleanupAudioElements, startPositionTracking, stopPositionTracking]);

  // ─── play / pause / toggle ───
  const play = useCallback(async () => {
    try {
      if (isLoading) return;
      const audio = audioElementsRef.current[activeChunkIndexRef.current];
      if (audio) {
        await audio.play();
        setIsPlaying(true);
        startPositionTracking();
      }
    } catch (e) {
      console.warn('Error playing:', e);
    }
  }, [isLoading, startPositionTracking]);

  const pause = useCallback(async () => {
    try {
      const audio = audioElementsRef.current[activeChunkIndexRef.current];
      if (audio) {
        audio.pause();
        setIsPlaying(false);
        stopPositionTracking();
      }
    } catch (e) {
      console.warn('Error pausing:', e);
    }
  }, [stopPositionTracking]);

  const togglePlayPause = useCallback(async () => {
    if (isPlaying) {
      await pause();
    } else {
      await play();
    }
  }, [isPlaying, pause, play]);

  // ─── seek ───
  const seek = useCallback(async (millis: number) => {
    try {
      const durations = chunkDurationsRef.current;
      if (durations.length > 1) {
        // Multi-chunk: find the right chunk
        let accumulated = 0;
        for (let i = 0; i < durations.length; i++) {
          const chunkDur = durations[i];
          if (accumulated + chunkDur > millis || i === durations.length - 1) {
            const localPos = millis - accumulated;
            const currentIndex = activeChunkIndexRef.current;

            // Pause current chunk if switching
            if (i !== currentIndex) {
              audioElementsRef.current[currentIndex]?.pause();
              activeChunkIndexRef.current = i;
            }

            const audio = audioElementsRef.current[i];
            if (audio) {
              audio.currentTime = Math.max(0, localPos) / 1000;
              if (isPlaying) {
                await audio.play();
              }
            }
            return;
          }
          accumulated += chunkDur;
        }
      } else {
        const audio = audioElementsRef.current[0];
        if (audio) {
          audio.currentTime = millis / 1000;
        }
      }
    } catch (e) {
      console.warn('Error seeking:', e);
    }
  }, [isPlaying]);

  const skipForward = useCallback(async (seconds = 15) => {
    const newPosition = Math.min(position + seconds * 1000, duration);
    await seek(newPosition);
  }, [position, duration, seek]);

  const skipBackward = useCallback(async (seconds = 15) => {
    const newPosition = Math.max(0, position - seconds * 1000);
    await seek(newPosition);
  }, [position, seek]);

  // ─── stop ───
  const stop = useCallback(async () => {
    loadGenerationRef.current += 1;
    stopPositionTracking();
    cleanupAudioElements();
    chunkDurationsRef.current = [];
    activeChunkIndexRef.current = 0;
    setCurrentTrack(null);
    setIsPlaying(false);
    setIsAudioReady(false);
    setPosition(0);
    setDuration(0);
  }, [stopPositionTracking, cleanupAudioElements]);

  const value: AudioPlayerContextValue = {
    currentTrack,
    isPlaying,
    isLoading,
    position,
    duration,
    loadTrack,
    togglePlayPause,
    play,
    pause,
    seek,
    skipForward,
    skipBackward,
    stop,
    isAudioReady,
    debugInfo,
  };

  return <AudioPlayerContext.Provider value={value}>{children}</AudioPlayerContext.Provider>;
};

export const useAudioPlayer = () => {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
  }
  return context;
};
