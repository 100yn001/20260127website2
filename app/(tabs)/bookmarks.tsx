import { Badge } from '@/components/ui/badge';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getBookmarkedStoryIds } from '@/services/user-service';
import { useFocusEffect, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    DeviceEventEmitter,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions
} from 'react-native';

type BookmarkedStory = {
  id: string;
  title?: string;
  audioUrl?: string;
  audioChunkURLs?: string[];
  transcript?: string;
  duration?: string;
  genre?: string;
  tags?: string[];
  recipeData?: { character?: string };
};

export default function BookmarksScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const { width: vw } = useWindowDimensions();
  const [bookmarkedStories, setBookmarkedStories] = useState<BookmarkedStory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadBookmarkedStories = useCallback(async () => {
    if (!user) {
      setBookmarkedStories([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const ids = await getBookmarkedStoryIds(user.uid);
      if (ids.length === 0) {
        setBookmarkedStories([]);
        return;
      }

      const snapshots = await Promise.all(ids.map(id => getDoc(doc(db, 'stories', id))));
      const stories = snapshots
        .filter(snap => snap.exists())
        .map(snap => ({ id: snap.id, ...(snap.data() as Record<string, any>) })) as BookmarkedStory[];
      setBookmarkedStories(stories);
    } catch (error) {
      console.error('Error loading bookmarked stories:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadBookmarkedStories();
  }, [loadBookmarkedStories]);

  useFocusEffect(
    useCallback(() => {
      loadBookmarkedStories();
    }, [loadBookmarkedStories])
  );

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('bookmarkChanged', () => {
      loadBookmarkedStories();
    });
    return () => {
      subscription.remove();
    };
  }, [loadBookmarkedStories]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadBookmarkedStories();
    setIsRefreshing(false);
  }, [loadBookmarkedStories]);

  const handleOpenStory = (story: BookmarkedStory) => {
    if (!story.audioUrl) return;
    router.push({
      pathname: '/player',
      params: {
        storyId: story.id,
        audioUrl: encodeURIComponent(String(story.audioUrl)),
        audioChunkURLs: story.audioChunkURLs?.length ? JSON.stringify(story.audioChunkURLs) : '',
        transcript: story.transcript || '',
        title: story.title || '',
      },
    });
  };

  const getBadgeLabel = (story: BookmarkedStory) =>
    story.genre || story.tags?.[0] || story.recipeData?.character || 'story';

  const getDurationLabel = (story: BookmarkedStory) => story.duration || '—';

  const renderContent = () => {
    if (!user) {
      return (
        <View style={styles.emptyState}>
          <IconSymbol name="bookmark" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>sign in to see bookmarks</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>your saved stories will appear here</Text>
        </View>
      );
    }

    if (isLoading) {
      return (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.text} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>loading your bookmarks...</Text>
        </View>
      );
    }

    if (bookmarkedStories.length === 0) {
      return (
        <View style={styles.emptyState}>
          <IconSymbol name="bookmark" size={64} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>no bookmarks yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>save stories to revisit them later</Text>
        </View>
      );
    }

    return (
      <View style={styles.grid}>
        {bookmarkedStories.map((story) => (
          <TouchableOpacity
            key={story.id}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => handleOpenStory(story)}
            disabled={!story.audioUrl}
          >
            <View style={styles.bookmarkIcon}>
              <IconSymbol name="bookmark.fill" size={16} color={colors.text} />
            </View>
            <View style={styles.cardContent}>
              <Text style={[styles.storyTitle, { color: colors.text }]} numberOfLines={2}>
                {story.title || 'untitled story'}
              </Text>
              <Badge variant="secondary">{getBadgeLabel(story)}</Badge>
            </View>
            <View style={styles.durationRow}>
              <IconSymbol name="clock" size={12} color="#717182" />
              <Text style={[styles.duration, { color: colors.textSecondary }]}>{getDurationLabel(story)}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        alwaysBounceVertical
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.text} />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>bookmarks</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>stories saved for later</Text>
        </View>

        {renderContent()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 20,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: '#030213',
    marginBottom: 4,
    fontFamily: 'EBGaramond-SemiBold',
  },
  subtitle: {
    fontSize: 14,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: '47%',
    aspectRatio: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    padding: 12,
    justifyContent: 'space-between',
    position: 'relative',
  },
  bookmarkIcon: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  bookmarkText: {
    fontSize: 16,
    color: '#030213',
    fontFamily: 'EBGaramond-Regular',
  },
  cardContent: {
    gap: 8,
    paddingRight: 24,
  },
  storyTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#030213',
    fontFamily: 'EBGaramond-Medium',
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  duration: {
    fontSize: 11,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
    gap: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#030213',
    fontFamily: 'EBGaramond-SemiBold',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
  },
});
