import RNSlider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import {
  Bookmark,
  BookOpenText,
  Gauge,
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
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { Screen, TopBar } from '@/components/screen';
import { db } from '@/config/firebase';
import { useAudioPlayer } from '@/contexts/AudioPlayerContext';
import { cn } from '@/lib/cn';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

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
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [bookmarked, setBookmarked] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [speedMenu, setSpeedMenu] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      try {
        const snap = await getDoc(doc(db, 'stories', id));
        if (cancelled || !snap.exists()) return;
        const data = snap.data() as any;
        setStory({ id: snap.id, ...data });
        if (data.audioUrl || (data.audioChunkURLs && data.audioChunkURLs.length)) {
          await loadTrack(
            {
              id: snap.id,
              title: data.title ?? 'untitled',
              audioUrl: data.audioUrl,
              audioChunkURLs: data.audioChunkURLs,
              transcript: data.transcript,
              coverColor: data.coverColor,
              metadata: data,
            },
            true
          );
        }
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
  const dur = Math.max(1, duration || (story?.duration ?? 600) * 1000);
  const pos = Math.min(position, dur);
  const remaining = Math.max(0, Math.floor((dur - pos) / 1000));

  return (
    <Screen wide mode={mode as 'night' | 'day'} auraIntensity="subtle">
      <TopBar
        onBack={() => router.back()}
        right={
          <Pressable className="h-8 w-8 items-center justify-center rounded-full active:bg-accent">
            <MoreHorizontal size={16} color="hsl(var(--foreground))" />
          </Pressable>
        }
      />

      <View className="flex-1 items-center justify-center px-5 pb-10">
        <View className="w-full max-w-[420px] items-center">
          <View className="w-full max-w-[380px] aspect-square overflow-hidden rounded-[22px]">
            <LinearGradient
              colors={[cover.a, cover.b]}
              start={{ x: 0.28, y: 0.22 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1 }}
            />
          </View>

          <View className="mt-6 w-full">
            <Text className="text-center text-[1.5rem] font-serif-medium text-foreground">
              {story?.title ?? currentTrack?.title ?? 'loading…'}
            </Text>
            <Text className="mt-1.5 text-center text-sm font-serif text-foreground/70">
              {story?.narratorName ?? '—'}
              {story?.character ? <>  ·  {story.character}</> : null}
            </Text>
          </View>

          <View className="mt-7 w-full">
            <RNSlider
              value={pos}
              minimumValue={0}
              maximumValue={dur}
              onSlidingComplete={(v) => seek(v)}
              minimumTrackTintColor="hsl(var(--primary))"
              maximumTrackTintColor="hsl(var(--border))"
              thumbTintColor="hsl(var(--primary))"
            />
            <View className="mt-1 flex-row items-center justify-between">
              <Text className="text-[11px] font-sans text-foreground/60">{fmt(pos / 1000)}</Text>
              <Text className="text-[11px] font-sans text-foreground/60">-{fmt(remaining)}</Text>
            </View>
          </View>

          <View className="mt-4 flex-row items-center gap-6">
            <Pressable onPress={() => skipBackward(15)} className="h-12 w-12 items-center justify-center">
              <SkipBack size={22} color="hsl(var(--foreground))" />
            </Pressable>
            <Pressable
              onPress={togglePlayPause}
              className="h-16 w-16 items-center justify-center rounded-full bg-foreground"
            >
              {isPlaying ? (
                <Pause size={24} color="hsl(var(--background))" />
              ) : (
                <Play size={24} color="hsl(var(--background))" />
              )}
            </Pressable>
            <Pressable onPress={() => skipForward(15)} className="h-12 w-12 items-center justify-center">
              <SkipForward size={22} color="hsl(var(--foreground))" />
            </Pressable>
          </View>

          <View className="mt-8 flex-row items-center justify-between gap-2 w-full max-w-[360px]">
            <Pressable
              onPress={() => setSpeedMenu((v) => !v)}
              className={cn(
                'h-9 px-3 flex-row items-center gap-1.5 rounded-full',
                speedMenu && 'bg-accent'
              )}
            >
              <Gauge size={14} color="hsl(var(--foreground))" />
              <Text className="text-xs font-sans text-foreground">{speed}×</Text>
            </Pressable>

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

      {speedMenu && (
        <View
          style={{ position: 'absolute', left: 20, bottom: 160, zIndex: 50 }}
          className="min-w-[110px] rounded-xl border border-border bg-card py-1"
        >
          {SPEEDS.map((s) => (
            <Pressable
              key={s}
              onPress={() => {
                setSpeed(s);
                setSpeedMenu(false);
              }}
              className="px-3 py-1.5 flex-row items-center justify-between"
            >
              <Text className="text-sm font-sans text-foreground">{s}×</Text>
              {s === speed && <View className="h-1.5 w-1.5 rounded-full bg-foreground" />}
            </Pressable>
          ))}
        </View>
      )}

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

function coverFor(seed: string): { a: string; b: string } {
  const palettes: [string, string][] = [
    ['#d6c2a8', '#8a6c47'],
    ['#a6b3d5', '#3b4a7a'],
    ['#cddacb', '#5c7a63'],
    ['#e8d2c1', '#a37257'],
    ['#c4a8d8', '#593c77'],
  ];
  const idx = Math.abs(hashStr(seed)) % palettes.length;
  const [a, b] = palettes[idx];
  return { a, b };
}

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}
