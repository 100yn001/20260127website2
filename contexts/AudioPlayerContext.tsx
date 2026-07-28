import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { getBlob, ref as storageRef } from 'firebase/storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import ReactNativeBlobUtil from 'react-native-blob-util';
import TrackPlayer, {
    Capability,
    Event,
    PitchAlgorithm,
    State,
    usePlaybackState,
    useProgress,
} from 'react-native-track-player';

import { storage } from '@/config/firebase';

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
  playbackRate: number;
  setPlaybackRate: (rate: number) => Promise<void>;
  isAudioReady: boolean;
  debugInfo: string;
}

// Pitch-corrected time-stretch keeps voices natural between ~0.75× and ~1.5×;
// outside that the artifacts get audible, so clamp anything persisted/passed.
export const PLAYBACK_RATE_MIN = 0.75;
export const PLAYBACK_RATE_MAX = 1.5;
const PLAYBACK_RATE_KEY = 'yn:playbackRate';

const clampRate = (rate: number) =>
  Math.min(PLAYBACK_RATE_MAX, Math.max(PLAYBACK_RATE_MIN, rate));

const AudioPlayerContext = createContext<AudioPlayerContextValue | undefined>(undefined);

// Extract Firebase Storage path from a download URL
// e.g. "https://firebasestorage.googleapis.com/v0/b/.../o/generated-audio%2F...mp3?alt=media&token=..."
//   → "generated-audio/daytime/...mp3"
function extractStoragePath(downloadURL: string): string {
  const match = downloadURL.match(/\/o\/([^?]+)/);
  if (!match) throw new Error('Cannot parse storage path from URL');
  return decodeURIComponent(match[1]);
}

// ─── Download helper ───
// Uses Firebase Storage SDK (getBlob) to download directly.
// Bypasses iOS NSURL which mangles %2F in Firebase URLs.
const downloadToCache = async (
  url: string,
  index: number,
  generation: number,
): Promise<string> => {
  // Get storage path and download via Firebase SDK
  const path = extractStoragePath(url);
  console.log(`⬇️ chunk${index}: downloading via SDK, path=${path}`);
  const fileRef = storageRef(storage, path);
  const blob = await getBlob(fileRef);
  console.log(`⬇️ chunk${index}: blob size=${blob.size}`);

  // Convert blob to base64 via FileReader
  const base64: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.substring(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });

  // Write to cache file
  const cacheDir = ReactNativeBlobUtil.fs.dirs.CacheDir;
  const localPath = `${cacheDir}/yn-audio-${generation}-${index}.mp3`;
  await ReactNativeBlobUtil.fs.writeFile(localPath, base64, 'base64');

  const stat = await ReactNativeBlobUtil.fs.stat(localPath);
  console.log(`⬇️ chunk${index}: ${stat.size} bytes saved to ${localPath}`);

  if (Number(stat.size) < 1000) {
    throw new Error(`chunk${index} file too small: ${stat.size} bytes`);
  }

  return `file://${localPath}`;
};

// Clean up downloaded files
const cleanupFiles = async (paths: string[]) => {
  for (const p of paths) {
    try {
      const raw = p.startsWith('file://') ? p.substring(7) : p;
      if (await ReactNativeBlobUtil.fs.exists(raw)) {
        await ReactNativeBlobUtil.fs.unlink(raw);
      }
    } catch { /* ignore */ }
  }
};

let isPlayerSetup = false;

export const AudioPlayerProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentTrack, setCurrentTrack] = useState<TrackInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');
  const loadGenerationRef = useRef(0);
  const localFilesRef = useRef<string[]>([]);
  const chunkDurationsRef = useRef<number[]>([]);
  const [activeChunkIndex, setActiveChunkIndex] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const playbackRateRef = useRef(1);

  // Restore persisted speed
  useEffect(() => {
    AsyncStorage.getItem(PLAYBACK_RATE_KEY)
      .then((v) => {
        const rate = v ? parseFloat(v) : NaN;
        if (Number.isFinite(rate)) {
          const clamped = clampRate(rate);
          playbackRateRef.current = clamped;
          setPlaybackRateState(clamped);
        }
      })
      .catch(() => {});
  }, []);

  const setPlaybackRate = useCallback(async (rate: number) => {
    const clamped = clampRate(rate);
    playbackRateRef.current = clamped;
    setPlaybackRateState(clamped);
    try {
      await TrackPlayer.setRate(clamped);
    } catch (e) {
      console.warn('Error setting playback rate:', e);
    }
    AsyncStorage.setItem(PLAYBACK_RATE_KEY, String(clamped)).catch(() => {});
  }, []);

  const playbackState = usePlaybackState();
  const { position: trackPosSec, duration: trackDurSec } = useProgress(500);

  // ─── Compute total position/duration across chunks ───
  const chunkDurations = chunkDurationsRef.current;
  const isChunked = chunkDurations.length > 1;

  let position: number;
  let duration: number;

  if (isChunked) {
    let elapsed = 0;
    for (let i = 0; i < activeChunkIndex && i < chunkDurations.length; i++) {
      elapsed += chunkDurations[i];
    }
    position = elapsed + Math.round(trackPosSec * 1000);
    duration = chunkDurations.reduce((s, d) => s + d, 0);
  } else {
    position = Math.round(trackPosSec * 1000);
    duration = Math.round(trackDurSec * 1000);
  }

  const isPlaying = playbackState.state === State.Playing;

  // ─── Setup RNTP once ───
  useEffect(() => {
    const setup = async () => {
      if (isPlayerSetup) return;
      try {
        await TrackPlayer.setupPlayer({
          waitForBuffer: true,
        });
        await TrackPlayer.updateOptions({
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.Stop,
            Capability.SeekTo,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
          ],
          compactCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SeekTo,
          ],
        });
        isPlayerSetup = true;
        console.log('✅ TrackPlayer setup complete');
      } catch (error) {
        if (String(error).includes('already been initialized')) {
          isPlayerSetup = true;
        } else {
          console.error('Error setting up TrackPlayer:', error);
        }
      }
    };
    setup();

    return () => {
      cleanupFiles(localFilesRef.current);
    };
  }, []);

  // ─── Track active track changes (for multi-chunk) ───
  useEffect(() => {
    const sub = TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (event) => {
      if (event.index !== undefined && event.index !== null) {
        setActiveChunkIndex(event.index);
        console.log(`🎵 Active track changed to chunk ${event.index + 1}`);
      }
    });
    return () => sub.remove();
  }, []);

  // ─── Track playback state for isAudioReady ───
  useEffect(() => {
    const state = playbackState.state;
    if (state === State.Ready || state === State.Playing || state === State.Paused || state === State.Buffering) {
      setIsAudioReady(true);
    } else if (state === State.None || state === State.Stopped) {
      setIsAudioReady(false);
    }
  }, [playbackState.state]);

  // ─── Track queue end ───
  useEffect(() => {
    const sub = TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
      console.log('🎵 Queue ended');
    });
    return () => sub.remove();
  }, []);

  // ─── loadTrack ───
  const loadTrack = useCallback(async (track: TrackInfo, autoplay = true) => {
    try {
      setIsLoading(true);
      setIsAudioReady(false);

      const currentGen = loadGenerationRef.current + 1;
      loadGenerationRef.current = currentGen;

      // Reset player queue
      await TrackPlayer.reset();

      // Clean up previous downloads
      if (localFilesRef.current.length > 0) {
        cleanupFiles(localFilesRef.current);
        localFilesRef.current = [];
      }

      // Reset chunk state
      chunkDurationsRef.current = [];
      setActiveChunkIndex(0);

      setCurrentTrack({ ...track });

      // Collect remote URLs to download
      const remoteURLs = (track.audioChunkURLs && track.audioChunkURLs.length > 0)
        ? track.audioChunkURLs
        : [track.audioUrl];

      const isMultiChunk = remoteURLs.length > 1;

      // Validate
      for (const u of remoteURLs) {
        if (!u || !u.startsWith('https://')) {
          throw new Error(`Invalid audio URL: ${u?.substring(0, 40)}`);
        }
      }

      // ─── Download all files to local cache ───
      setDebugInfo(`downloading ${remoteURLs.length} file(s)...`);
      console.log(`⬇️ Downloading ${remoteURLs.length} audio file(s) to cache...`);

      const localPaths = await Promise.all(
        remoteURLs.map((url, i) => downloadToCache(url, i, currentGen))
      );

      // Abort if a new track was loaded while we were downloading
      if (loadGenerationRef.current !== currentGen) {
        cleanupFiles(localPaths);
        return;
      }

      // Store local paths for cleanup later
      localFilesRef.current = localPaths;

      // Show file sizes in debug
      let totalSize = 0;
      for (const lp of localPaths) {
        try {
          const raw = lp.startsWith('file://') ? lp.substring(7) : lp;
          const s = await ReactNativeBlobUtil.fs.stat(raw);
          totalSize += Number(s.size);
        } catch { /* */ }
      }
      console.log(`✅ Downloaded ${localPaths.length} file(s), total ${Math.round(totalSize/1024)}KB`);
      setDebugInfo(`downloaded ${localPaths.length} files (${Math.round(totalSize/1024)}KB), loading...`);

      // Pre-compute chunk durations for multi-chunk stories
      if (isMultiChunk) {
        setDebugInfo(`probing ${localPaths.length} chunk durations...`);
        const durations: number[] = [];
        for (let i = 0; i < localPaths.length; i++) {
          try {
            const { sound: probe, status: probeStatus } = await Audio.Sound.createAsync(
              { uri: localPaths[i] },
              { shouldPlay: false },
            );
            if (probeStatus.isLoaded && probeStatus.durationMillis) {
              durations.push(probeStatus.durationMillis);
            } else {
              durations.push(0);
            }
            probe.setOnPlaybackStatusUpdate(null);
            await probe.unloadAsync();
          } catch {
            durations.push(0);
          }
        }
        chunkDurationsRef.current = durations;
        const totalDur = durations.reduce((s, d) => s + d, 0);
        console.log(`📏 Chunk durations: ${durations.map(d => Math.round(d/1000) + 's').join(', ')} = ${Math.round(totalDur/1000)}s total`);
      }

      // Abort if a new track was loaded while we were probing
      if (loadGenerationRef.current !== currentGen) return;

      // ─── Add tracks to RNTP queue ───
      const rnTracks = localPaths.map((localPath, i) => ({
        id: `${track.id || 'track'}-chunk-${i}`,
        url: localPath,
        title: track.title,
        artist: track.subtitle || 'yn',
        // iOS: time-domain stretch tuned for speech, so slowed narration
        // keeps its pitch instead of going underwater. No-op on Android.
        pitchAlgorithm: PitchAlgorithm.Voice,
        ...(isMultiChunk && chunkDurationsRef.current[i]
          ? { duration: chunkDurationsRef.current[i] / 1000 }
          : {}),
      }));

      await TrackPlayer.add(rnTracks);

      if (loadGenerationRef.current !== currentGen) return;

      // reset() clears the rate, so re-apply the user's speed per load
      if (playbackRateRef.current !== 1) {
        await TrackPlayer.setRate(playbackRateRef.current);
      }

      if (autoplay) {
        await TrackPlayer.play();
      }

      setDebugInfo(`playing from local (${isMultiChunk ? localPaths.length + ' chunks' : 'single'})`);
      console.log('✅ Track loaded via RNTP:', track.title);
    } catch (error) {
      console.error('❌ Error loading track:', error);
      setDebugInfo(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
      setIsAudioReady(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ─── play / pause / toggle ───
  const play = useCallback(async () => {
    try {
      if (isLoading) return;
      await TrackPlayer.play();
    } catch (e) {
      console.warn('Error playing:', e);
    }
  }, [isLoading]);

  const pause = useCallback(async () => {
    try {
      await TrackPlayer.pause();
    } catch (e) {
      console.warn('Error pausing:', e);
    }
  }, []);

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
        // Multi-chunk: find the right chunk and position within it
        let accumulated = 0;
        for (let i = 0; i < durations.length; i++) {
          const chunkDur = durations[i];
          if (accumulated + chunkDur > millis || i === durations.length - 1) {
            const localPos = millis - accumulated;
            const currentIndex = await TrackPlayer.getActiveTrackIndex();
            if (i !== currentIndex) {
              await TrackPlayer.skip(i);
              await new Promise(r => setTimeout(r, 100));
            }
            await TrackPlayer.seekTo(Math.max(0, localPos) / 1000);
            return;
          }
          accumulated += chunkDur;
        }
      } else {
        await TrackPlayer.seekTo(millis / 1000);
      }
    } catch (e) {
      console.warn('Error seeking:', e);
    }
  }, []);

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
    try {
      await TrackPlayer.reset();
    } catch (e) {
      console.warn('Error stopping:', e);
    }
    // Clean up downloaded files
    if (localFilesRef.current.length > 0) {
      cleanupFiles(localFilesRef.current);
      localFilesRef.current = [];
    }
    chunkDurationsRef.current = [];
    setActiveChunkIndex(0);
    setCurrentTrack(null);
    setIsAudioReady(false);
  }, []);

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
    playbackRate,
    setPlaybackRate,
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
