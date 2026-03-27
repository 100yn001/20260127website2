import TopographicArtwork from '@/components/TopographicArtwork';
import { getSharedAudio, markAsPlayed } from '@/services/shared-audio-service';
import { SharedAudio } from '@/types/shared-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    GestureResponderEvent,
    LayoutChangeEvent,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const RECEIVED_IDS_KEY = 'sink_received_ids';
const SCREEN_WIDTH = Dimensions.get('window').width;
const ARTWORK_SIZE = Math.min(SCREEN_WIDTH - 80, 280);

export default function PlayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [sharedAudio, setSharedAudio] = useState<SharedAudio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const progressBarWidth = useRef(0);

  const addLog = (msg: string) => {
    setDebugLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
    console.log('[synk]', msg);
  };

  useEffect(() => {
    if (id) loadSharedAudio(id);
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, [id]);

  const loadSharedAudio = async (sharedId: string) => {
    try {
      addLog(`fetching doc: ${sharedId}`);
      const audio = await getSharedAudio(sharedId);
      if (!audio) {
        addLog('doc not found or null');
        setError('story not found or link expired');
        setLoading(false);
        return;
      }
      addLog(`got doc: title="${audio.title}", chunks=${audio.audioChunkURLs?.length || 0}, audioUrl=${audio.audioUrl ? 'yes' : 'no'}`);
      setSharedAudio(audio);

      // Save to received list
      const stored = await AsyncStorage.getItem(RECEIVED_IDS_KEY);
      const ids: string[] = stored ? JSON.parse(stored) : [];
      if (!ids.includes(sharedId)) {
        ids.unshift(sharedId);
        await AsyncStorage.setItem(RECEIVED_IDS_KEY, JSON.stringify(ids));
      }

      // Mark as played (non-fatal — sink app has no auth)
      try {
        await markAsPlayed(sharedId);
        addLog('marked as played');
      } catch (markErr: any) {
        addLog(`markAsPlayed failed (non-fatal): ${markErr?.message || markErr}`);
      }
      setLoading(false);
    } catch (err: any) {
      const msg = err?.message || String(err);
      addLog(`LOAD ERROR: ${msg}`);
      console.error('Error loading shared audio:', err);
      setError(`failed to load story`);
      setLoading(false);
    }
  };

  const loadAndPlayChunk = useCallback(async (chunkIndex: number) => {
    if (!sharedAudio) return;

    const urls = sharedAudio.audioChunkURLs?.length
      ? sharedAudio.audioChunkURLs
      : sharedAudio.audioUrl
        ? [sharedAudio.audioUrl]
        : [];

    if (chunkIndex >= urls.length) {
      setIsPlaying(false);
      setCurrentChunkIndex(0);
      setPosition(0);
      return;
    }

    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: urls[chunkIndex] },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded && !isSeeking) {
            setPosition(status.positionMillis);
            setDuration(status.durationMillis || 0);
            if (status.didJustFinish) {
              const nextIndex = chunkIndex + 1;
              setCurrentChunkIndex(nextIndex);
              loadAndPlayChunk(nextIndex);
            }
          }
        }
      );

      soundRef.current = sound;
      setIsPlaying(true);
    } catch (err) {
      console.error('Error playing audio:', err);
      setError('failed to play audio');
    }
  }, [sharedAudio, isSeeking]);

  const handlePlayPause = async () => {
    if (!soundRef.current) {
      setCurrentChunkIndex(0);
      await loadAndPlayChunk(0);
      return;
    }

    const status = await soundRef.current.getStatusAsync();
    if (status.isLoaded) {
      if (status.isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      } else {
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    }
  };

  const handleSeek = async (evt: GestureResponderEvent) => {
    if (!soundRef.current || duration === 0 || progressBarWidth.current === 0) return;
    const x = evt.nativeEvent.locationX;
    const ratio = Math.max(0, Math.min(1, x / progressBarWidth.current));
    const seekMs = Math.floor(ratio * duration);
    setPosition(seekMs);
    await soundRef.current.setPositionAsync(seekMs);
  };

  const onProgressBarLayout = (evt: LayoutChangeEvent) => {
    progressBarWidth.current = evt.nativeEvent.layout.width;
  };

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorState}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={handleGoBack}>
            <Text style={styles.backBtnText}>go back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.backBtn, { marginTop: 12 }]} onPress={() => setShowDebug(!showDebug)}>
            <Text style={styles.backBtnText}>{showDebug ? 'hide logs' : 'show logs'}</Text>
          </TouchableOpacity>
          {showDebug && (
            <View style={{ marginTop: 16, maxHeight: 200, width: '100%' }}>
              <ScrollView>
                {debugLogs.map((log, i) => (
                  <Text key={i} style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'Courier', marginBottom: 2 }}>{log}</Text>
                ))}
                {debugLogs.length === 0 && <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>no logs</Text>}
              </ScrollView>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const chunkCount = sharedAudio?.audioChunkURLs?.length || 1;
  const progressPercent = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Back button */}
      <TouchableOpacity style={styles.navBack} onPress={handleGoBack}>
        <Text style={styles.navBackText}>← back</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        {/* Artwork */}
        <View style={styles.artworkWrap}>
          <TopographicArtwork
            baseColor={sharedAudio?.coverColor || '#1a1a2e'}
            layers={sharedAudio?.topographyLayers}
            size={ARTWORK_SIZE}
          />
        </View>

        {/* Title */}
        <Text style={styles.title}>{sharedAudio?.title || 'untitled'}</Text>
        <Text style={styles.meta}>
          {sharedAudio?.duration || ''}{chunkCount > 1 ? ` · ${chunkCount} parts` : ''}
        </Text>

        {/* Seekable progress bar */}
        <View
          style={styles.progressBarTouch}
          onLayout={onProgressBarLayout}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(evt) => {
            setIsSeeking(true);
            handleSeek(evt);
          }}
          onResponderMove={handleSeek}
          onResponderRelease={(evt) => {
            handleSeek(evt);
            setIsSeeking(false);
          }}
        >
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          {/* Thumb indicator */}
          <View style={[styles.progressThumb, { left: `${progressPercent}%` }]} />
        </View>

        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>

        {/* Chunk indicator */}
        {chunkCount > 1 && (
          <Text style={styles.chunkIndicator}>
            part {currentChunkIndex + 1} of {chunkCount}
          </Text>
        )}

        {/* Play/Pause button */}
        <TouchableOpacity style={styles.playButton} onPress={handlePlayPause} activeOpacity={0.7}>
          <Text style={styles.playButtonText}>{isPlaying ? '❚❚' : '▶'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  navBack: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
  },
  navBackText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  artworkWrap: {
    marginBottom: 32,
    borderRadius: 20,
    overflow: 'hidden',
  },
  title: {
    fontSize: 26,
    color: '#fff',
    fontFamily: 'EBGaramond-SemiBold',
    textTransform: 'lowercase',
    textAlign: 'center',
    marginBottom: 4,
  },
  meta: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.45)',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    marginBottom: 24,
  },
  progressBarTouch: {
    width: '100%',
    height: 32,
    justifyContent: 'center',
    position: 'relative',
  },
  progressBarTrack: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 999,
  },
  progressThumb: {
    position: 'absolute',
    top: 10,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    marginLeft: -6,
  },
  timeRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  timeText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    fontFamily: 'EBGaramond-Regular',
  },
  chunkIndicator: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    marginBottom: 20,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  playButtonText: {
    color: '#fff',
    fontSize: 24,
  },
  errorState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
  },
  errorText: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
    textAlign: 'center',
    marginBottom: 20,
  },
  backBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  backBtnText: {
    fontSize: 16,
    color: '#fff',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
});
