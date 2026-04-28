import RNSlider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme as useNWColorScheme } from 'nativewind';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import {
  Bookmark,
  BookOpenText,
  ChevronDown,
  MoreHorizontal,
  Pause,
  Play,
  Share2,
  SkipBack,
  SkipForward,
  Waves,
  X,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { Screen, TopBar } from '@/components/screen';
import { db } from '@/config/firebase';
import { useAudioPlayer } from '@/contexts/AudioPlayerContext';
import { cn } from '@/lib/cn';
import { coverFor } from '@/lib/cover';

export default function PlayerScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const {
    currentTrack,
    isPlaying,
    position,
    duration,
    loadTrack,
    togglePlayPause,
    seek,
    skipForward,
    skipBackward,
    hasAmbient,
    ambientEnabled,
    setAmbientEnabled,
  } = useAudioPlayer();

  const [story, setStory] = useState<any>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      try {
        // Try user stories first, then public library.
        let snap = await getDoc(doc(db, 'stories', id));
        if (!snap.exists()) {
          snap = await getDoc(doc(db, 'publicStories', id));
        }
        if (cancelled || !snap.exists()) {
          console.warn('[player] story not found in stories or publicStories', id);
          return;
        }
        const data = snap.data() as any;
        setStory({ id: snap.id, ...data });
        const hasAudio =
          !!data.audioUrl || (Array.isArray(data.audioChunkURLs) && data.audioChunkURLs.length);
        if (!hasAudio) {
          console.warn('[player] story has no audio yet', id);
          return;
        }
        await loadTrack(
          {
            id: snap.id,
            title: data.title ?? 'untitled',
            audioUrl: data.audioUrl,
            audioChunkURLs: data.audioChunkURLs,
            transcript: data.transcript,
            coverColor: data.coverColor,
            topographyLayers: data.topographyLayers,
            ambientUrl: data.ambientUrl,
            metadata: data,
          },
          true
        );
      } catch (e) {
        console.error('[player] load failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const cover = useMemo(() => coverFor(story?.coverColor ?? id ?? 'x'), [story, id]);
  const mode = story?.isNighttime ? 'night' : 'day';

  // Defensive math — `duration` and `position` come from the audio context
  // and can be undefined / NaN during the first render while chunks load.
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : NaN;
  const fallbackMs =
    Number.isFinite(story?.duration) && story?.duration > 0
      ? Math.round(story.duration * 1000)
      : 0;
  const dur = Number.isFinite(safeDuration)
    ? safeDuration
    : fallbackMs > 0
    ? fallbackMs
    : 0;
  const safePosition = Number.isFinite(position) && position >= 0 ? position : 0;
  const pos = dur > 0 ? Math.min(safePosition, dur) : safePosition;
  const remaining = dur > 0 ? Math.max(0, Math.floor((dur - pos) / 1000)) : 0;
  const timingReady = dur > 0;
  const titleReady = !!story?.title;

  const minimize = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/library');
    }
  };

  return (
    <Screen wide mode={mode as 'night' | 'day'} auraIntensity="subtle">
      <TopBar
        onBack={minimize}
        backLabel="minimize"
        backIcon={<ChevronDown size={20} color="hsl(var(--foreground))" />}
        right={
          <Pressable className="h-8 w-8 items-center justify-center rounded-full active:bg-accent">
            <MoreHorizontal size={16} color="hsl(var(--foreground))" />
          </Pressable>
        }
      />

      <View className="flex-1 items-center justify-center px-5 pb-10">
        <View className="w-full max-w-[420px] items-center">
          <View className="w-full max-w-[380px] aspect-square overflow-hidden rounded-[28px]">
            <LinearGradient
              colors={[cover.a, cover.b]}
              start={{ x: 0.28, y: 0.22 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1 }}
            />
          </View>

          <View className="mt-6 w-full">
            {titleReady ? (
              <Text className="text-center text-[1.5rem] font-serif-medium text-foreground">
                {story.title}
              </Text>
            ) : (
              <View className="self-center h-6 w-48 rounded-full bg-muted" />
            )}
            {titleReady ? (
              <Text className="mt-1.5 text-center text-sm font-serif text-foreground/70">
                {story.narratorName ?? (story.character ? story.character : '—')}
                {story.narratorName && story.character ? <>  ·  {story.character}</> : null}
              </Text>
            ) : (
              <View className="self-center mt-2 h-3 w-28 rounded-full bg-muted" />
            )}
          </View>

          <View className="mt-7 w-full">
            <PlayerScrubber value={pos} max={Math.max(dur, 1)} onSlidingComplete={(v) => seek(v)} />
            <View className="mt-1 h-4 flex-row items-center justify-between">
              {timingReady ? (
                <>
                  <Text className="text-[11px] font-sans text-foreground/60">{fmt(pos / 1000)}</Text>
                  <Text className="text-[11px] font-sans text-foreground/60">-{fmt(remaining)}</Text>
                </>
              ) : (
                <View className="flex-1 items-center">
                  <ActivityIndicator size="small" color="hsl(var(--foreground) / 0.6)" />
                </View>
              )}
            </View>
          </View>

          <View className="mt-4 flex-row items-center gap-6">
            <Pressable onPress={() => skipBackward(15)} className="h-12 w-12 items-center justify-center">
              <SkipBack size={22} color="hsl(var(--foreground))" />
            </Pressable>
            <Pressable
              onPress={togglePlayPause}
              className="h-16 w-16 items-center justify-center bg-black"
              style={Platform.OS === 'web' ? ({ outlineWidth: 0 } as any) : undefined}
            >
              {isPlaying ? (
                <Pause size={24} color="#fff" fill="#fff" />
              ) : (
                <Play size={24} color="#fff" fill="#fff" />
              )}
            </Pressable>
            <Pressable onPress={() => skipForward(15)} className="h-12 w-12 items-center justify-center">
              <SkipForward size={22} color="hsl(var(--foreground))" />
            </Pressable>
          </View>

          <View className="mt-8 flex-row items-center justify-center gap-3 w-full max-w-[360px]">
            {hasAmbient && (
              <Chip
                active={ambientEnabled}
                onPress={() => setAmbientEnabled(!ambientEnabled)}
                label="ambient"
              >
                <Waves
                  size={14}
                  color={ambientEnabled ? 'hsl(var(--background))' : 'hsl(var(--foreground))'}
                />
              </Chip>
            )}
            <Chip active={bookmarked} onPress={() => setBookmarked((v) => !v)} label="bookmark">
              <Bookmark
                size={14}
                color={bookmarked ? 'hsl(var(--background))' : 'hsl(var(--foreground))'}
                fill={bookmarked ? 'hsl(var(--background))' : 'none'}
              />
            </Chip>
            <Chip onPress={() => setTranscriptOpen(true)} label="transcript">
              <BookOpenText size={14} color="hsl(var(--foreground))" />
            </Chip>
            <Chip onPress={() => {}} label="share">
              <Share2 size={14} color="hsl(var(--foreground))" />
            </Chip>
          </View>
        </View>
      </View>

      <Modal
        visible={transcriptOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setTranscriptOpen(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View
            className="bg-card border-t border-border rounded-t-[var(--radius)]"
            style={{ maxHeight: '80%' }}
          >
            <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
              <View>
                <Text className="text-[11px] font-serif text-muted-foreground">transcript</Text>
                <Text className="text-base font-serif-medium text-foreground" numberOfLines={1}>
                  {story?.title ?? 'untitled'}
                </Text>
              </View>
              <Pressable
                onPress={() => setTranscriptOpen(false)}
                className="h-8 w-8 items-center justify-center rounded-full"
              >
                <X size={16} color="hsl(var(--foreground))" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
              <Text className="text-[0.95rem] font-serif text-foreground leading-relaxed">
                {story?.transcript ?? '— transcript not available.'}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function PlayerScrubber({
  value,
  max,
  onSlidingComplete,
}: {
  value: number;
  max: number;
  onSlidingComplete: (v: number) => void;
}) {
  const { colorScheme } = useNWColorScheme();
  const isDark = colorScheme === 'dark';
  const primary = isDark ? '#fafafa' : '#151519';
  const track = isDark ? '#2b2b2b' : '#d9dae0';
  return (
    <RNSlider
      value={value}
      minimumValue={0}
      maximumValue={max}
      onSlidingComplete={onSlidingComplete}
      minimumTrackTintColor={primary}
      maximumTrackTintColor={track}
      thumbTintColor={primary}
    />
  );
}

function Chip({
  active,
  onPress,
  label,
  children,
}: {
  active?: boolean;
  onPress: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      className={cn('h-9 w-9 items-center justify-center rounded-full', active && 'bg-foreground')}
    >
      {children}
    </Pressable>
  );
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

