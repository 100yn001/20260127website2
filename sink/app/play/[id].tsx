import { getSharedAudio, markAsPlayed } from '@/services/shared-audio-service';
import { SharedAudio } from '@/types/shared-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    GestureResponderEvent,
    Image,
    LayoutChangeEvent,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const RECEIVED_IDS_KEY = 'sink_received_ids';

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
  const isSeeking = useRef(false);
  const barWidth = useRef(0);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);

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
      addLog(`got doc: title="${audio.title}", chunks=${audio.audioChunkURLs?.length || 0}, audioUrl=${audio.audioUrl ? 'yes' : 'no'}, artworkUrl=${audio.artworkUrl ? audio.artworkUrl.substring(0, 60) + '...' : 'EMPTY'}`);
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
      // All chunks played
      setIsPlaying(false);
      setCurrentChunkIndex(0);
      setPosition(0);
      return;
    }

    try {
      // Unload previous
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
          if (status.isLoaded) {
            if (!isSeeking.current) {
              setPosition(status.positionMillis);
            }
            setDuration(status.durationMillis || 0);
            if (status.didJustFinish) {
              // Play next chunk
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
  }, [sharedAudio]);

  const handlePlayPause = async () => {
    if (!soundRef.current) {
      // Start playing from first chunk
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
    if (!soundRef.current || duration <= 0 || barWidth.current <= 0) return;
    const x = evt.nativeEvent.locationX;
    const ratio = Math.max(0, Math.min(1, x / barWidth.current));
    const seekMs = Math.floor(ratio * duration);
    setPosition(seekMs);
    await soundRef.current.setPositionAsync(seekMs);
  };

  const onBarLayout = (e: LayoutChangeEvent) => {
    barWidth.current = e.nativeEvent.layout.width;
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
        <ActivityIndicator color="#fff" size="large" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorState}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/')}>
            <Text style={styles.backButtonText}>go back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.backButton, { marginTop: 12 }]} onPress={() => setShowDebug(!showDebug)}>
            <Text style={styles.backButtonText}>{showDebug ? 'hide logs' : 'show logs'}</Text>
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
      {/* Back button + debug toggle */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 }}>
        <TouchableOpacity onPress={() => router.replace('/')}>
          <Text style={styles.navBackText}>← back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowDebug(!showDebug)}>
          <Text style={styles.navBackText}>{showDebug ? 'hide logs' : 'logs'}</Text>
        </TouchableOpacity>
      </View>
      {showDebug && (
        <View style={{ maxHeight: 150, paddingHorizontal: 16, marginBottom: 8 }}>
          <ScrollView>
            {debugLogs.map((log, i) => (
              <Text key={i} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontFamily: 'Courier', marginBottom: 1 }}>{log}</Text>
            ))}
            {debugLogs.length === 0 && <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>no logs yet</Text>}
          </ScrollView>
        </View>
      )}

      <View style={styles.content}>
        {/* Cover art */}
        <View style={[styles.coverArt, { backgroundColor: sharedAudio?.coverColor || '#1a1a2e' }]}>
          {sharedAudio?.artworkUrl ? (
            <Image
              source={{ uri: sharedAudio.artworkUrl }}
              style={styles.coverImage}
              resizeMode="cover"
            />
          ) : (
            <Text style={styles.coverText}>{'{synk}'}</Text>
          )}
        </View>

        {/* Title */}
        <Text style={styles.title}>{sharedAudio?.title || 'untitled'}</Text>
        <Text style={styles.meta}>
          {sharedAudio?.duration || ''}{chunkCount > 1 ? ` · ${chunkCount} parts` : ''}
        </Text>

        {/* Progress bar (seekable) */}
        <View
          style={styles.progressBarHitArea}
          onLayout={onBarLayout}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => { isSeeking.current = true; handleSeek(e); }}
          onResponderMove={handleSeek}
          onResponderRelease={(e) => { handleSeek(e); isSeeking.current = false; }}
          onResponderTerminate={() => { isSeeking.current = false; }}
        >
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          <View style={[styles.scrubber, { left: `${progressPercent}%` }]} />
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
  coverArt: {
    width: 220,
    height: 220,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverText: {
    fontSize: 28,
    color: 'rgba(255,255,255,0.3)',
    fontFamily: 'EBGaramond-Medium',
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
  progressBarHitArea: {
    width: '100%',
    height: 30,
    justifyContent: 'center',
    marginBottom: 0,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  scrubber: {
    position: 'absolute',
    top: 9,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    marginLeft: -7,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 999,
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
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  backButtonText: {
    fontSize: 16,
    color: '#fff',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
});
