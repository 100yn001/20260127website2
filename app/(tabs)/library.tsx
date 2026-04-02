import TopographicArtwork, { generateDepthLayers } from '@/components/TopographicArtwork';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { auth, db } from '@/config/firebase';
import { DEFAULT_COVER_COLOR } from '@/constants/cover-colors';
import { useAudioPlayer } from '@/contexts/AudioPlayerContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { shareStoryToSink } from '@/services/share-service';
import { DepthLayer, Story } from '@/types/story';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';

const CARD_GAP = 16;
const SHELF_PADDING = 24;
const STORY_GAP = 12;
const STORIES_PER_ROW = 3;
const TEXT_ON_CARD = '#F9F7FF';
const TEXT_MUTED = 'rgba(249,247,255,0.75)';
const TAG_PILL_BG = 'rgba(249,247,255,0.15)';
const TAG_PILL_TEXT = '#FDF8FF';
const DAY_BADGE_BG = 'rgba(255,231,169,0.35)';
const DAY_BADGE_TEXT = '#FFE7A9';
const NIGHT_BADGE_BG = 'rgba(129,140,248,0.35)';
const NIGHT_BADGE_TEXT = '#C7D2FE';
const PUBLIC_COLOR_PALETTE = [
  '#7f1d1d',
  '#134e4a',
  '#1d3557',
  '#4c1d95',
  '#7c2d12',
  '#0f172a',
  '#0f766e',
  '#1e1b4b',
  '#7f1d3d',
];

interface ListeningProgress {
  storyId: string;
  story: Story | PublicStory;
  position: number; // seconds
  duration: number; // seconds
  lastPlayed: Date;
  isPublic: boolean;
}

interface PublicStory {
  id: string;
  title: string;
  audioUrl: string;
  transcript: string;
  duration: string;
  genre?: string;
  isNighttime: boolean;
  createdAt: Date;
  tags?: string[];
  collection?: string | null;
  narratorName?: string;
  narratorColor?: string;
  coverColor?: string;
  topographyLayers?: DepthLayer[];
}

interface KeepListeningCard {
  key: string;
  storyId: string;
  title: string;
  tags: string[];
  durationLabel?: string;
  isPublic: boolean;
  isNighttime?: boolean;
  audioUrl: string;
  audioChunkURLs?: string[];
  transcript?: string;
  narratorId?: string;
  narratorName?: string;
  narratorColor?: string;
  character?: string;
  setting?: string;
  color: string;
  layers: DepthLayer[];
  remainingMinutes?: number;
  progressPercent?: number | null;
  unseen?: boolean;
  collection?: string | null;
}

const normalizeDate = (value: any): Date => {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate();
  }
  return new Date(value);
};

const hashStringToNumber = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const getColorForStory = (id: string | undefined, fallback = DEFAULT_COVER_COLOR) => {
  if (!id) return fallback;
  const index = hashStringToNumber(id) % PUBLIC_COLOR_PALETTE.length;
  return PUBLIC_COLOR_PALETTE[index];
};

export default function LibraryScreen() {
  const router = useRouter();
  const { colors, theme } = useTheme();
  const { stop } = useAudioPlayer();
  const { width: vw } = useWindowDimensions();
  const cardCols = Platform.OS === 'web' ? (vw >= 1024 ? 4 : vw >= 600 ? 3 : 2) : 2;
  const exploreCols = Platform.OS === 'web' ? (vw >= 1024 ? 5 : vw >= 600 ? 4 : STORIES_PER_ROW) : STORIES_PER_ROW;

  const CARD_WIDTH = useMemo(() => (vw - 32 - CARD_GAP * (cardCols - 1)) / cardCols, [vw, cardCols]);
  const CARD_HEIGHT = CARD_WIDTH;
  const ART_HEIGHT = CARD_HEIGHT;
  const EXPLORE_ART_SIZE = useMemo(() => (vw - SHELF_PADDING * 2 - STORY_GAP * (exploreCols - 1)) / exploreCols, [vw, exploreCols]);
  const EXPLORE_ROW_HEIGHT = EXPLORE_ART_SIZE + 16;
  const [listeningProgress, setListeningProgress] = useState<ListeningProgress[]>([]);
  const [publicStories, setPublicStories] = useState<PublicStory[]>([]);
  const [userStories, setUserStories] = useState<Story[]>([]);
  const [isLoadingProgress, setIsLoadingProgress] = useState(true);
  const [isLoadingPublic, setIsLoadingPublic] = useState(true);
  const [seenStoryIds, setSeenStoryIds] = useState<Set<string>>(new Set());
  const artworkCache = useRef<Map<string, DepthLayer[]>>(new Map());
  const { user } = useAuth();
  const [shareMenuCardKey, setShareMenuCardKey] = useState<string | null>(null);
  const [copiedCardKey, setCopiedCardKey] = useState<string | null>(null);

  useEffect(() => {
    loadListeningProgress();
    loadPublicStories();
    loadSeenStories();
  }, []);

  // Real-time listener for user stories to reflect name edits immediately
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setUserStories([]);
      return;
    }

    const storiesRef = collection(db, 'stories');
    const q = query(storiesRef, where('userId', '==', user.uid), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userStoryList: Story[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Story & { createdAt?: any; updatedAt?: any };
        const createdAt = normalizeDate(data.createdAt);
        const updatedAt = normalizeDate(data.updatedAt);
        return {
          ...data,
          id: docSnap.id,
          createdAt,
          updatedAt,
        };
      });
      setUserStories(userStoryList);
    });

    return () => unsubscribe();
  }, []);

  const loadSeenStories = async () => {
    const user = auth.currentUser;
    if (!user) {
      setSeenStoryIds(new Set());
      return;
    }
    try {
      const stored = await AsyncStorage.getItem(`seenStories_${user.uid}`);
      if (stored) {
        setSeenStoryIds(new Set(JSON.parse(stored)));
      } else {
        setSeenStoryIds(new Set());
      }
    } catch (error) {
      console.error('Error loading seen stories:', error);
    }
  };

  const loadListeningProgress = async () => {
    const user = auth.currentUser;
    if (!user) {
      setIsLoadingProgress(false);
      return;
    }

    try {
      // Get listening progress from localStorage/AsyncStorage
      const progressData = await AsyncStorage.getItem(`listeningProgress_${user.uid}`);
      const progress: Record<
        string,
        { position: number; duration: number; lastPlayed: string; isPublic?: boolean }
      > = progressData ? JSON.parse(progressData) : {};

      const storiesRef = collection(db, 'stories');
      const q = query(storiesRef, where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);

      const userStoryList: Story[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Story & { createdAt?: any; updatedAt?: any };
        const createdAt = normalizeDate(data.createdAt);
        const updatedAt = normalizeDate(data.updatedAt);
        return {
          ...data,
          id: docSnap.id,
          createdAt,
          updatedAt,
        };
      });
      setUserStories(userStoryList);

      const progressWithStories: ListeningProgress[] = [];

      userStoryList.forEach((story) => {
        const storyProgress = progress[story.id];
        if (
          storyProgress &&
          storyProgress.position > 0 &&
          storyProgress.position < storyProgress.duration
        ) {
          progressWithStories.push({
            storyId: story.id,
            story,
            position: storyProgress.position,
            duration: storyProgress.duration,
            lastPlayed: new Date(storyProgress.lastPlayed),
            isPublic: Boolean(storyProgress.isPublic),
          });
        }
      });

      const publicEntries = Object.entries(progress).filter(([, value]) => value?.isPublic);
      if (publicEntries.length > 0) {
        const publicDocs = await Promise.all(
          publicEntries.map(([storyId]) => getDoc(doc(db, 'publicStories', storyId)))
        );
        publicDocs.forEach((docSnap, index) => {
          if (!docSnap.exists()) return;
          const { position, duration, lastPlayed } = publicEntries[index][1];
          if (!(position > 0 && position < duration)) return;
          const data = docSnap.data() as PublicStory & { createdAt?: any };
          const story: PublicStory = {
            ...data,
            id: docSnap.id,
            createdAt: normalizeDate(data.createdAt),
          };
          progressWithStories.push({
            storyId: docSnap.id,
            story,
            position,
            duration,
            lastPlayed: new Date(lastPlayed),
            isPublic: true,
          });
        });
      }

      progressWithStories.sort((a, b) => b.lastPlayed.getTime() - a.lastPlayed.getTime());
      setListeningProgress(progressWithStories);
    } catch (error) {
      console.error('Error loading listening progress:', error);
    } finally {
      setIsLoadingProgress(false);
    }
  };

  const loadPublicStories = async () => {
    try {
      const publicStoriesRef = collection(db, 'publicStories');
      const snapshot = await getDocs(publicStoriesRef);
      
      const stories: PublicStory[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        const createdAtRaw = data.createdAt;

        let createdAt: Date;
        if (createdAtRaw?.toDate) {
          createdAt = createdAtRaw.toDate();
        } else if (typeof createdAtRaw === 'string') {
          createdAt = new Date(createdAtRaw);
        } else if (createdAtRaw instanceof Date) {
          createdAt = createdAtRaw;
        } else {
          createdAt = new Date();
        }

        return {
          id: doc.id,
          title: data.title || '',
          audioUrl: data.audioUrl || '',
          transcript: data.transcript || '',
          duration: data.duration || '',
          genre: data.genre,
          isNighttime: data.isNighttime || false,
          tags: Array.isArray(data.tags) ? data.tags : [],
          collection: typeof data.collection === 'string' && data.collection.trim() ? data.collection.trim() : null,
          narratorName: data.display_narrator || data.narratorName || null,
          narratorColor: data.narratorColor || null,
          coverColor: data.coverColor || null,
          topographyLayers: Array.isArray(data.topographyLayers) ? data.topographyLayers : undefined,
          createdAt,
        } as PublicStory;
      });
      
      setPublicStories(stories);
    } catch (error) {
      console.error('Error loading public stories:', error);
    } finally {
      setIsLoadingPublic(false);
    }
  };

  const getLayersForStory = (key: string, provided?: DepthLayer[]) => {
    if (provided && provided.length > 0) return provided;
    if (artworkCache.current.has(key)) {
      return artworkCache.current.get(key)!;
    }
    const generated = generateDepthLayers(5);
    artworkCache.current.set(key, generated);
    return generated;
  };

  const discoveryCards = useMemo(() => {
    return publicStories.map((story) => ({
      key: story.id,
      storyId: story.id,
      title: story.title,
      tags: story.tags || [],
      durationLabel: story.duration,
      isPublic: true,
      isNighttime: story.isNighttime,
      audioUrl: story.audioUrl,
      transcript: story.transcript,
      narratorId: (story as any).narratorId,
      narratorName: story.narratorName,
      narratorColor: story.narratorColor,
      character: (story as any).character,
      setting: (story as any).setting,
      color: story.coverColor || getColorForStory(story.id),
      layers: getLayersForStory(`public-${story.id}`, story.topographyLayers),
      collection: story.collection,
    }));
  }, [publicStories]);

  // Group stories by collection
  const { collectionGroups, uncollectedCards } = useMemo(() => {
    const groups: Record<string, KeepListeningCard[]> = {};
    const uncollected: KeepListeningCard[] = [];

    discoveryCards.forEach((card) => {
      if (card.collection) {
        if (!groups[card.collection]) {
          groups[card.collection] = [];
        }
        groups[card.collection].push(card);
      } else {
        uncollected.push(card);
      }
    });

    return { collectionGroups: groups, uncollectedCards: uncollected };
  }, [discoveryCards]);

  const sortedRecentStories = useMemo(() => {
    return [...userStories].sort(
      (a, b) => normalizeDate(b.createdAt).getTime() - normalizeDate(a.createdAt).getTime()
    );
  }, [userStories]);

  const keepListeningCards = useMemo<KeepListeningCard[]>(() => {
    const cards: KeepListeningCard[] = listeningProgress.slice(0, 6).map((progress) => {
      const baseColor =
        (progress.story as Story).coverColor ||
        (progress.isPublic ? getColorForStory(progress.storyId) : DEFAULT_COVER_COLOR);
      const baseLayers = (progress.story as Story).topographyLayers;
      const remainingMinutes = Math.max(
        1,
        Math.ceil((progress.duration - progress.position) / 60)
      );
      const progressPercent = Math.min(100, (progress.position / progress.duration) * 100);

      return {
        key: `progress-${progress.storyId}`,
        storyId: progress.storyId,
        title: progress.story.title || 'untitled story',
        tags: ((progress.story as any).tags || []) as string[],
        durationLabel: (progress.story as any).duration,
        isPublic: progress.isPublic,
        isNighttime: (progress.story as any).isNighttime,
        audioUrl: progress.story.audioUrl,
        audioChunkURLs: (progress.story as any).audioChunkURLs || [],
        transcript: progress.story.transcript,
        narratorId: (progress.story as any).narratorId,
        narratorName: (progress.story as any).narratorName || (progress.story as any).display_narrator,
        narratorColor: (progress.story as any).narratorColor,
        character: (progress.story as any).character,
        setting: (progress.story as any).setting,
        collection: (progress.story as any).collection || null,
        color: baseColor || DEFAULT_COVER_COLOR,
        layers: getLayersForStory(progress.isPublic ? `public-${progress.storyId}` : progress.storyId, baseLayers),
        remainingMinutes,
        progressPercent,
      };
    });

    if (cards.length < 6) {
      const needed = 6 - cards.length;
      const fallback = sortedRecentStories
        .filter((story) => !cards.some((card) => card.storyId === story.id))
        .slice(0, needed)
        .map((story) => ({
          key: `recent-${story.id}`,
          storyId: story.id,
          title: story.title || 'untitled story',
          tags: story.tags || [],
          durationLabel: story.duration,
          isPublic: false,
          isNighttime: story.isNighttime,
          audioUrl: story.audioUrl,
          audioChunkURLs: story.audioChunkURLs || [],
          transcript: story.transcript,
          narratorId: story.narratorId,
          character: story.character,
          setting: story.setting,
          color: story.coverColor || DEFAULT_COVER_COLOR,
          layers: getLayersForStory(story.id, story.topographyLayers),
          remainingMinutes: undefined,
          progressPercent: null,
          unseen: !seenStoryIds.has(story.id),
        }));
      cards.push(...fallback);
    }

    return cards;
  }, [listeningProgress, sortedRecentStories, seenStoryIds]);

  const handlePressStory = (card: KeepListeningCard) => {
    // Stop current audio and hide mini player
    stop();
    
    if (card.isPublic) {
      router.push({
        pathname: '/player',
        params: {
          publicStoryId: card.storyId,
          audioUrl: encodeURIComponent(card.audioUrl),
          audioChunkURLs: card.audioChunkURLs?.length ? JSON.stringify(card.audioChunkURLs) : '',
          transcript: card.transcript || '',
          title: card.title,
          duration: card.durationLabel || '',
          isNighttime: card.isNighttime ? 'true' : 'false',
          narratorId: card.narratorId || '',
          setting: card.setting || '',
          character: card.character || '',
          coverColor: card.color || '',
          topographyLayers: card.layers ? JSON.stringify(card.layers) : '',
        },
      });
      return;
    }

    router.push({
      pathname: '/story-details' as any,
      params: {
        storyId: card.storyId,
        audioUrl: encodeURIComponent(card.audioUrl),
        audioChunkURLs: card.audioChunkURLs?.length ? JSON.stringify(card.audioChunkURLs) : '',
        transcript: card.transcript || '',
        coverColor: card.color || '',
        topographyLayers: card.layers ? JSON.stringify(card.layers) : '',
      },
    });
  };

  const handlePressDiscovery = (card: KeepListeningCard) => {
    // Stop current audio and hide mini player
    stop();
    
    router.push({
      pathname: '/player',
      params: {
        publicStoryId: card.storyId,
        audioUrl: encodeURIComponent(card.audioUrl),
        audioChunkURLs: card.audioChunkURLs?.length ? JSON.stringify(card.audioChunkURLs) : '',
        transcript: card.transcript || '',
        title: card.title,
        duration: card.durationLabel || '',
        isNighttime: card.isNighttime ? 'true' : 'false',
        narratorId: card.narratorId || '',
        setting: card.setting || '',
        character: card.character || '',
        coverColor: card.color || '',
        topographyLayers: card.layers ? JSON.stringify(card.layers) : '',
      },
    });
  };

  const handleShareCardToSink = async (card: KeepListeningCard) => {
    if (!user) return;
    try {
      const deepLink = await shareStoryToSink({
        userId: user.uid,
        storyId: card.storyId,
        title: card.title || 'untitled',
        audioChunkURLs: card.audioChunkURLs || [],
        audioUrl: card.audioUrl,
        coverColor: card.color,
        topographyLayers: card.layers,
        duration: card.durationLabel as any,
        isNighttime: card.isNighttime || false,
      });
      await navigator.clipboard.writeText(deepLink);
      setCopiedCardKey(card.key);
      setShareMenuCardKey(null);
      setTimeout(() => setCopiedCardKey(null), 2000);
    } catch (error) {
      console.error('Error sharing story:', error);
    }
  };

  const renderStoryPill = (
    card: KeepListeningCard,
    variant: 'discover' | 'keep',
    extraStyle?: object
  ) => {
    return (
      <TouchableOpacity 
        key={card.key} 
        style={[styles.cardContainer, { width: CARD_WIDTH }, extraStyle]}
        activeOpacity={0.8}
        onPress={() => (variant === 'discover' ? handlePressDiscovery(card) : handlePressStory(card))}
      >
        {/* Square artwork card */}
        <View
          style={[
            styles.storyPill,
            { width: CARD_WIDTH, height: CARD_WIDTH },
            variant === 'discover' ? styles.discoveryPill : styles.keepPill,
          ]}
        >
          <LinearGradient
            colors={[card.color, '#05030D', '#010104']}
            locations={[0, 0.6, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardGradient}
          />
          <View style={[styles.artworkLayer, { height: ART_HEIGHT }]}>
            <TopographicArtwork baseColor={card.color} layers={card.layers} size={CARD_WIDTH * 1.35} />
          </View>
          
          {/* Day/Night + Globe icons - top left */}
          <View style={styles.topLeftBadges}>
            <IconSymbol 
              name={card.isNighttime ? 'moon.fill' : 'sun.max.fill'} 
              size={14} 
              color={card.isNighttime ? '#A5B4FC' : '#FCD34D'} 
            />
            {card.isPublic && (
              <IconSymbol name="globe.americas.fill" size={14} color="#F5F3FF" />
            )}
          </View>

          {/* Send to sink button (web only) */}
          {Platform.OS === 'web' && (
            <TouchableOpacity
              style={styles.sinkShareButton}
              onPress={(e) => {
                e.stopPropagation();
                setShareMenuCardKey(shareMenuCardKey === card.key ? null : card.key);
              }}
            >
              <IconSymbol name="ellipsis" size={16} color="#fff" />
            </TouchableOpacity>
          )}

          {/* Share menu dropdown */}
          {Platform.OS === 'web' && shareMenuCardKey === card.key && (
            <View style={[styles.sinkShareMenu, { backgroundColor: colors.card }]}>
              <TouchableOpacity
                style={styles.sinkShareMenuItem}
                onPress={(e) => {
                  e.stopPropagation();
                  handleShareCardToSink(card);
                }}
              >
                <IconSymbol name="arrow.down.to.line" size={14} color={colors.text} />
                <Text style={[styles.sinkShareMenuText, { color: colors.text }]}>send to sink</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Copied toast */}
          {Platform.OS === 'web' && copiedCardKey === card.key && (
            <View style={styles.sinkCopiedToast}>
              <Text style={styles.sinkCopiedToastText}>link copied!</Text>
            </View>
          )}
          
          
          </View>
        
        {/* For collection cards: Title then narrator pill + duration + tags */}
        {card.collection ? (
          <>
            {/* Line 1: Title */}
            <Text style={[styles.cardTitle, { color: colors.text, marginTop: 8 }]} numberOfLines={1}>
              {card.title}
            </Text>
            {/* Line 2: Narrator pill with gradient + duration */}
            <View style={styles.narratorRow}>
              {card.narratorName && (
                <View style={styles.narratorPill}>
                  <LinearGradient
                    colors={[card.narratorColor || card.color, '#05030D']}
                    locations={[0, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <Text style={styles.narratorPillText}>{card.narratorName}</Text>
                </View>
              )}
              <Text style={[styles.timeTextBelow, { color: colors.textSecondary }]}>
                {card.durationLabel || ''}
              </Text>
            </View>
            {/* Line 3: Tags */}
            {card.tags && card.tags.length > 0 && (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.tagsScrollBelow}
                contentContainerStyle={styles.tagsContentBelow}
              >
                {card.tags.slice(0, 3).map((tag) => (
                  <View key={`${card.key}-${tag}`} style={[styles.tagPillBelow, { backgroundColor: colors.card }]}>
                    <Text style={[styles.tagTextBelow, { color: colors.textSecondary }]}>
                      {tag}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </>
        ) : (
          <>
            {/* Line 1: Progress bar (full width) - only for keep listening */}
            {(card.progressPercent ?? 0) > 0 && (
              <View style={[styles.progressBarBelow, { backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }]}>
                <View
                  style={[
                    styles.progressFillBelow,
                    { width: `${card.progressPercent ?? 0}%`, backgroundColor: theme === 'dark' ? '#FFFFFF' : '#030213' },
                  ]}
                />
              </View>
            )}
            
            {/* Line 2: Time text */}
            <Text style={[styles.timeTextBelow, { color: colors.textSecondary }]}>
              {(card.progressPercent ?? 0) > 0 
                ? `${card.remainingMinutes ?? 0} min left`
                : card.durationLabel || ''}
            </Text>
            
            {/* Line 3: Title */}
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
              {card.title}
            </Text>
            
            {/* Line 4: Tags in pills (only for discover, not keep listening) */}
            {variant === 'discover' && card.tags.length > 0 && (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.tagsScrollBelow}
                contentContainerStyle={styles.tagsContentBelow}
              >
                {card.tags.slice(0, 3).map((tag) => (
                  <View key={`${card.key}-${tag}`} style={[styles.tagPillBelow, { backgroundColor: colors.card }]}>
                    <Text style={[styles.tagTextBelow, { color: colors.textSecondary }]}>
                      {tag}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
            
            {/* Line 5: Narrator pill (for public stories with a narrator) */}
            {variant === 'discover' && card.narratorName && (
              <View style={[styles.narratorPill, { marginTop: 4 }]}>  
                <LinearGradient
                  colors={[card.narratorColor || card.color, '#05030D']}
                  locations={[0, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Text style={styles.narratorPillText}>{card.narratorName}</Text>
              </View>
            )}
          </>
        )}
      </TouchableOpacity>
    );
  };

  // Render explore row - horizontal layout with artwork left, info right
  const renderExploreRow = (card: KeepListeningCard) => {
    return (
      <TouchableOpacity
        key={card.key}
        style={[styles.exploreRow, { height: EXPLORE_ROW_HEIGHT }]}
        activeOpacity={0.8}
        onPress={() => handlePressDiscovery(card)}
      >
        {/* Square artwork with play button overlay */}
        <View style={[styles.exploreArtworkContainer, { width: EXPLORE_ART_SIZE, height: EXPLORE_ART_SIZE }]}>
          <View style={[styles.exploreArtwork, { width: EXPLORE_ART_SIZE, height: EXPLORE_ART_SIZE }]}>
            <LinearGradient
              colors={[card.color, '#05030D', '#010104']}
              locations={[0, 0.6, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.exploreArtworkLayer}>
              <TopographicArtwork baseColor={card.color} layers={card.layers} size={EXPLORE_ART_SIZE * 1.2} />
            </View>
          </View>
          {/* Play button overlay */}
          <View style={styles.explorePlayButton}>
            <IconSymbol name="play.fill" size={20} color="#fff" />
          </View>
        </View>

        {/* Info to the right */}
        <View style={styles.exploreInfo}>
          {/* Title */}
          <Text style={[styles.exploreTitle, { color: colors.text }]} numberOfLines={1}>
            {card.title}
          </Text>
          
          {/* Tags */}
          {card.tags.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.exploreTagsScroll}
              contentContainerStyle={styles.exploreTagsContent}
            >
              {card.tags.slice(0, 3).map((tag) => (
                <View key={`${card.key}-${tag}`} style={[styles.exploreTagPill, { backgroundColor: colors.card }]}>
                  <Text style={[styles.exploreTagText, { color: colors.textSecondary }]}>
                    {tag}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
          
          {/* Narrator pill */}
          {card.narratorName && (
            <View style={[styles.narratorPill, { marginTop: 4, alignSelf: 'flex-start' }]}>
              <LinearGradient
                colors={[card.narratorColor || card.color, '#05030D']}
                locations={[0, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.narratorPillText}>{card.narratorName}</Text>
            </View>
          )}
          
          {/* Duration */}
          <Text style={[styles.exploreDuration, { color: colors.textSecondary }]}>
            {card.durationLabel || ''}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>library</Text>
        <TouchableOpacity style={styles.plusButton} onPress={() => router.push('/(tabs)/create')}>
          <IconSymbol name="plus" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>

        {/* Keep Listening - horizontal row at top */}
        {keepListeningCards.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>keep listening</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.discoveryRow}
            >
              {keepListeningCards.map((card) => renderStoryPill(card, 'keep'))}
            </ScrollView>
          </View>
        )}

        {/* Collection sections - horizontal scrollable rows */}
        {Object.entries(collectionGroups).map(([collectionName, cards]) => (
          <View key={collectionName} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{collectionName}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.discoveryRow}
            >
              {cards.map((card) => renderStoryPill(card, 'discover'))}
            </ScrollView>
          </View>
        ))}

        {/* Explore - uncollected stories in vertical list */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>explore</Text>
          {isLoadingPublic ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>loading...</Text>
            </View>
          ) : uncollectedCards.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>no stories yet</Text>
            </View>
          ) : (
            <View style={styles.exploreList}>
              {uncollectedCards.map((card) => renderExploreRow(card))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#030213',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  signOutButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  signOutText: {
    fontSize: 14,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 100,
  },
  plusButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 12,
    paddingHorizontal: 16,
    color: '#030213',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  discoveryRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: CARD_GAP,
  },
  storyPill: {
    borderRadius: 18,
    marginBottom: 0,
    backgroundColor: '#05030D',
    overflow: 'hidden',
  },
  discoveryPill: {
    marginRight: CARD_GAP,
  },
  keepPill: {
    marginBottom: 0,
  },
  cardGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    overflow: 'hidden',
  },
  artworkLayer: {
    width: '100%',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  artworkBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(3,2,19,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBody: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    justifyContent: 'flex-start',
    gap: 4,
  },
  contentArea: {
    gap: 4,
  },
  titleScroll: {
    flexGrow: 0,
    maxHeight: 24,
  },
  tagsScroll: {
    flexGrow: 0,
  },
  tagsContent: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  progressSection: {
    gap: 4,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBarShort: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  totalTimeRow: {
    alignItems: 'flex-end',
  },
  totalTimeText: {
    fontSize: 12,
    fontFamily: 'EBGaramond-Regular',
    color: TEXT_MUTED,
  },
  pillTitle: {
    fontSize: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
    color: TEXT_ON_CARD,
    flexShrink: 0,
  },
    tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: TAG_PILL_BG,
  },
  tagText: {
    fontSize: 11,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
    color: TAG_PILL_TEXT,
  },
  durationText: {
    fontSize: 12,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    color: TEXT_MUTED,
  },
  durationInline: {
    marginLeft: 'auto',
  },
  dayNightPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dayNightText: {
    fontSize: 11,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
    color: '#fff',
  },
  dayBadge: {
    backgroundColor: DAY_BADGE_BG,
  },
  dayBadgeText: {
    color: DAY_BADGE_TEXT,
  },
  nightBadge: {
    backgroundColor: NIGHT_BADGE_BG,
  },
  nightBadgeText: {
    color: NIGHT_BADGE_TEXT,
  },
  remainingText: {
    fontSize: 12,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    color: TEXT_MUTED,
  },
  progressBar: {
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#fff',
  },
  keepRows: {
    paddingHorizontal: 16,
    gap: CARD_GAP,
  },
  keepRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  storyPillPlaceholder: {
    opacity: 0,
    borderWidth: 0,
  },
  newBadge: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#F7C948',
    borderWidth: 2,
    borderColor: '#000',
    zIndex: 12,
  },
  emptyState: {
    paddingHorizontal: 16,
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  // New card layout styles
  cardContainer: {
    gap: 6,
  },
  topLeftBadges: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dayNightBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(3,2,19,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  progressOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
    width: '100%',
  },
  narratorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  narratorPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  narratorPillText: {
    fontSize: 11,
    fontFamily: 'EBGaramond-Medium',
    color: '#F9F7FF',
    textTransform: 'lowercase',
  },
  tagsScrollBelow: {
    flexGrow: 0,
    maxHeight: 26,
    marginTop: 4,
  },
  tagsContentBelow: {
    flexDirection: 'row',
    gap: 8,
  },
  tagTextBelow: {
    fontSize: 11,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    lineHeight: 13,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  progressBarBelow: {
    width: '100%',
    height: 3,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressFillBelow: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#030213',
  },
  timeTextBelow: {
    fontSize: 12,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  tagPillBelow: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Explore section styles
  exploreList: {
    gap: 12,
    paddingHorizontal: 16,
  },
  exploreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  exploreArtworkContainer: {
    position: 'relative',
  },
  exploreArtwork: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  exploreArtworkLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  explorePlayButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
  },
  exploreInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  exploreTitle: {
    fontSize: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  exploreTagsScroll: {
    flexGrow: 0,
    maxHeight: 22,
  },
  exploreTagsContent: {
    flexDirection: 'row',
    gap: 6,
  },
  exploreTagPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exploreTagText: {
    fontSize: 11,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    lineHeight: 13,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  exploreDuration: {
    fontSize: 12,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  sinkShareButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  sinkShareMenu: {
    position: 'absolute',
    top: 36,
    right: 4,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
    zIndex: 20,
    minWidth: 130,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  sinkShareMenuItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  sinkShareMenuText: {
    fontSize: 13,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase' as const,
  },
  sinkCopiedToast: {
    position: 'absolute' as const,
    top: '40%' as any,
    alignSelf: 'center' as const,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    zIndex: 30,
  },
  sinkCopiedToastText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'EBGaramond-Medium',
  },
});

