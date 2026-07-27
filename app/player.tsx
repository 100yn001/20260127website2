import RNSlider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme as useNWColorScheme } from 'nativewind';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import {
  Bookmark,
  BookOpenText,
  ChevronDown,
  Pause,
  Play,
  RefreshCw,
  Share2,
  SkipBack,
  SkipForward,
  Waves,
  X,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  DeviceEventEmitter,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { Screen, TopBar } from '@/components/screen';
import { db } from '@/config/firebase';
import { useAudioPlayer } from '@/contexts/AudioPlayerContext';
import { useAuth } from '@/contexts/AuthContext';
import { useArtworkTint } from '@/hooks/useArtworkTint';
import { cn } from '@/lib/cn';
import { coverFromColor, variedTint } from '@/lib/cover';
import { shareStory } from '@/lib/share-story';
import { addBookmark, getBookmarkedStoryIds, removeBookmark } from '@/services/user-service';

export default function PlayerScreen() {
  const router = useRouter();
  // Some callers (bookmarks, story-details) pass `storyId` instead of `id` —
  // accept both.
  const params = useLocalSearchParams<{ id?: string; storyId?: string }>();
  const id = params.id ?? params.storyId;
  const { user } = useAuth();
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

  // Story + origin live in the same state object so the cover memo can never
  // see story populated while isPublic is still its initial false value
  // (which was leaking the listener's profile tint onto public-story players).
  const [storyState, setStoryState] = useState<{ data: any | null; isPublic: boolean }>(
    { data: null, isPublic: false },
  );
  const story = storyState.data;
  const storyIsPublic = storyState.isPublic;
  const [bookmarked, setBookmarked] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);

  // Bookmark state lives in users/{uid}.bookmarkedStories — load it so the
  // chip reflects (and persists) reality instead of local-only state.
  useEffect(() => {
    let cancelled = false;
    if (!user || !id) return;
    getBookmarkedStoryIds(user.uid)
      .then((ids) => {
        if (!cancelled) setBookmarked(ids.includes(id));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.uid, id]);

  const toggleBookmark = async () => {
    if (!user || !id) return;
    const next = !bookmarked;
    setBookmarked(next);
    try {
      if (next) await addBookmark(user.uid, id);
      else await removeBookmark(user.uid, id);
      DeviceEventEmitter.emit('bookmarkChanged');
    } catch (e) {
      console.warn('[player] bookmark toggle failed', e);
      setBookmarked(!next); // revert on failure
    }
  };

  const flashShareToast = (msg: string) => {
    setShareToast(msg);
    setTimeout(() => setShareToast(null), 2200);
  };

  const handleShare = async () => {
    if (!user || !story || sharing) return;
    setSharing(true);
    try {
      const outcome = await shareStory({
        userId: user.uid,
        storyId: story.id,
        title: story.title || 'untitled',
        audioChunkURLs: story.audioChunkURLs || [],
        audioUrl: story.audioUrl,
        narratorId: story.narratorId,
        coverColor: story.coverColor,
        topographyLayers: story.topographyLayers,
        duration: story.duration,
        isNighttime: !!story.isNighttime,
      });
      if (outcome === 'copied') flashShareToast('link copied');
    } catch (e) {
      console.error('[player] share failed', e);
      flashShareToast('share failed — try again');
    } finally {
      setSharing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    (async () => {
      if (!id) {
        setLoadError('no story id provided');
        return;
      }
      try {
        // Look in user stories and the public library in parallel — public
        // stories were getting stuck because of the sequential fetch when
        // rules denied the first one.
        console.log('[player] fetching', id);
        const [userSnap, publicSnap] = await Promise.all([
          getDoc(doc(db, 'stories', id)).catch((e) => {
            console.warn('[player] stories/{id} read failed', e?.code, e?.message);
            return null;
          }),
          getDoc(doc(db, 'publicStories', id)).catch((e) => {
            console.warn('[player] publicStories/{id} read failed', e?.code, e?.message);
            return null;
          }),
        ]);
        const fromUser = userSnap?.exists();
        const snap = fromUser ? userSnap : publicSnap?.exists() ? publicSnap : null;
        if (cancelled) return;
        if (!snap) {
          console.warn('[player] story not found in stories or publicStories', id);
          setLoadError("we couldn't find that story");
          return;
        }
        const data = snap.data() as any;
        setStoryState({ data: { id: snap.id, ...data }, isPublic: !fromUser });
        const hasAudio =
          !!data.audioUrl || (Array.isArray(data.audioChunkURLs) && data.audioChunkURLs.length);
        if (!hasAudio) {
          console.warn('[player] story has no audio yet', id);
          setLoadError('this story has no audio yet');
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
      } catch (e: any) {
        console.error('[player] load failed', e);
        if (!cancelled) setLoadError(e?.message || 'failed to load this story');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const tint = useArtworkTint();
  // Public stories carry their own published coverColor — show that. The
  // listener's profile tint is only used for the user's own (private)
  // stories so the vault stays in their color family while public stories
  // keep the publisher's chosen color.
  //
  // While the story doc is still loading we deliberately use a deterministic
  // hash-derived palette (coverFromColor with no hex → coverFor) instead of
  // the profile tint, otherwise public-story players would flash the
  // listener's tint for the first frame before the fetch resolves.
  const cover = useMemo(() => {
    const seed = story?.id ?? id ?? 'x';
    if (!story) return coverFromColor(undefined, seed);
    if (storyIsPublic) return coverFromColor(story.coverColor, seed);
    return variedTint(tint, seed);
  }, [tint, story, storyIsPublic, id]);
  const mode = story?.isNighttime ? 'night' : 'day';

  // Defensive math — `duration` and `position` come from the audio context
  // and can be undefined / NaN during the first render while chunks load.
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  // story.duration may be a number (seconds) or a bucket string like '15min'.
  // Public stories are written as the bucket string; chunked stories report
  // their per-chunk duration before the full aggregate resolves. Falling back
  // to the recipe's target gives the scrubber the right total length on
  // first render, and once all chunks land safeDuration grows past it and
  // takes over.
  const fallbackMs = (() => {
    const d: any = story?.duration;
    if (typeof d === 'number' && Number.isFinite(d) && d > 0) return Math.round(d * 1000);
    if (typeof d === 'string') {
      const m = d.match(/(\d+)/);
      if (m) return parseInt(m[1], 10) * 60 * 1000;
    }
    return 0;
  })();
  // Use the maximum so partially-loaded chunks never display a duration
  // shorter than the story's recipe target.
  const dur = Math.max(safeDuration, fallbackMs);
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
          <Pressable
            onPress={() => {
              if (!story) return;
              router.push({
                pathname: '/regenerate',
                params: { storyId: story.id, isPublic: storyIsPublic ? 'true' : 'false' },
              });
            }}
            accessibilityLabel="regenerate this story"
            disabled={!story}
            className="h-8 w-8 items-center justify-center rounded-full active:bg-accent"
          >
            <RefreshCw size={16} color="hsl(var(--foreground))" />
          </Pressable>
        }
      />

      <View className="flex-1 items-center justify-center px-5 pb-10">
        {loadError ? (
          <View className="px-6">
            <Text className="text-center text-lg font-serif-medium text-foreground">
              {loadError}
            </Text>
            <Text className="mt-2 text-center text-xs font-serif text-muted-foreground">
              story id: {id}
            </Text>
          </View>
        ) : null}
        <View className={cn('w-full max-w-[420px] md:max-w-[480px] items-center', loadError && 'opacity-30')}>
          <View className="w-full max-w-[380px] md:max-w-[440px] aspect-square overflow-hidden rounded-[28px]">
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
              (() => {
                const byline = [story.narratorName, story.character]
                  .filter((s) => typeof s === 'string' && s.trim())
                  .join('  ·  ');
                if (!byline) return null;
                return (
                  <Text className="mt-1.5 text-center text-sm font-serif text-foreground/70">
                    {byline}
                  </Text>
                );
              })()
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
              className="h-16 w-16 items-center justify-center"
              style={Platform.OS === 'web' ? ({ outlineWidth: 0 } as any) : undefined}
            >
              {isPlaying ? (
                <Pause size={36} color="hsl(var(--foreground))" fill="hsl(var(--foreground))" />
              ) : (
                <Play size={36} color="hsl(var(--foreground))" fill="hsl(var(--foreground))" />
              )}
            </Pressable>
            <Pressable onPress={() => skipForward(15)} className="h-12 w-12 items-center justify-center">
              <SkipForward size={22} color="hsl(var(--foreground))" />
            </Pressable>
          </View>

          <View className="mt-8 flex-row items-center justify-center gap-3 w-full max-w-[360px] md:max-w-[420px]">
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
            <Chip active={bookmarked} onPress={toggleBookmark} label="bookmark">
              <Bookmark
                size={14}
                color={bookmarked ? 'hsl(var(--background))' : 'hsl(var(--foreground))'}
                fill={bookmarked ? 'hsl(var(--background))' : 'none'}
              />
            </Chip>
            <Chip onPress={() => setTranscriptOpen(true)} label="transcript">
              <BookOpenText size={14} color="hsl(var(--foreground))" />
            </Chip>
            <Chip onPress={handleShare} label="share">
              <Share2 size={14} color="hsl(var(--foreground))" />
            </Chip>
          </View>
        </View>
        {shareToast && (
          <View className="absolute bottom-6 self-center rounded-full bg-foreground px-4 py-2">
            <Text className="text-xs font-serif text-background">{shareToast}</Text>
          </View>
        )}
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
      className={cn('h-10 w-10 items-center justify-center rounded-full', active && 'bg-foreground')}
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

