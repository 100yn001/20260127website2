import TopographicArtwork from '@/components/TopographicArtwork';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { db } from '@/config/firebase';
import { DEFAULT_COVER_COLOR } from '@/constants/cover-colors';
import { useAuth } from '@/contexts/AuthContext';
import { useStoryQueue } from '@/contexts/StoryQueueContext';
import { useTheme } from '@/contexts/ThemeContext';
import { DepthLayer } from '@/types/story';
import { createShadow } from '@/utils/shadow';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Easing,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

const SHELF_PADDING = 24;
const STORY_GAP = 12;
const STORIES_PER_ROW = 3;

interface CompletedStory {
  id: string;
  audioUrl: string;
  audioChunkURLs?: string[];
  transcript: string;
  character: string;
  trope: string;
  setting: string;
  location: string;
  createdAt: Date;
  duration: string;
  title?: string;
  prompt?: string;
  tags?: string[];
  coverColor?: string;
  topographyLayers?: DepthLayer[];
  groupId?: string;
}

interface StoryGroup {
  id: string;
  name: string;
  storyIds: string[];
  createdAt: Date;
}

export default function MyStoriesScreen() {
  const { queue, clearQueue, resetStuckStories } = useStoryQueue();
  const { user } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const { width: vw } = useWindowDimensions();
  const storyCols = Platform.OS === 'web' ? (vw >= 1024 ? 5 : vw >= 600 ? 4 : STORIES_PER_ROW) : STORIES_PER_ROW;
  const STORY_WIDTH = (vw - SHELF_PADDING * 2 - STORY_GAP * (storyCols - 1)) / storyCols;
  const [storedUserName, setStoredUserName] = useState('');
  const [completedStories, setCompletedStories] = useState<CompletedStory[]>([]);
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [seenStoryIds, setSeenStoryIds] = useState<Set<string>>(new Set());
  
  // Selection mode state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedStoryIds, setSelectedStoryIds] = useState<Set<string>>(new Set());
  
  // Custom story order
  const [customOrder, setCustomOrder] = useState<string[]>([]);
  const userStorageKey = user?.uid ?? 'guest';
  const ORDER_STORAGE_KEY = `storyOrder_${userStorageKey}`;
  const GROUPS_STORAGE_KEY = `storyGroups_${userStorageKey}`;
  const SEEN_STORIES_STORAGE_KEY = `seenStories_${userStorageKey}`;
  
  useEffect(() => {
    const loadName = async () => {
      const name = await AsyncStorage.getItem('userName');
      if (name) setStoredUserName(name.toLowerCase());
    };
    loadName();
  }, []);

  // Group creation modal
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  
  // Shake animation
  const shakeAnim = useRef(new Animated.Value(0)).current;
  
  // Double tap detection
  const lastTapRef = useRef<{ [key: string]: number }>({});

  // Load groups and custom order from AsyncStorage
  useEffect(() => {
    const loadData = async () => {
      try {
        const [storedGroups, storedOrder] = await Promise.all([
          AsyncStorage.getItem(GROUPS_STORAGE_KEY),
          AsyncStorage.getItem(ORDER_STORAGE_KEY),
        ]);
        if (storedGroups) {
          setGroups(JSON.parse(storedGroups));
        } else {
          setGroups([]);
        }
        if (storedOrder) {
          setCustomOrder(JSON.parse(storedOrder));
        } else {
          setCustomOrder([]);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };
    loadData();
  }, [GROUPS_STORAGE_KEY, ORDER_STORAGE_KEY]);

  const saveSeenStories = useCallback(async (storiesSet: Set<string>) => {
    try {
      await AsyncStorage.setItem(
        SEEN_STORIES_STORAGE_KEY,
        JSON.stringify(Array.from(storiesSet))
      );
    } catch (error) {
      console.error('Error saving seen stories:', error);
    }
  }, [SEEN_STORIES_STORAGE_KEY]);

  useEffect(() => {
    const loadSeenStories = async () => {
      try {
        const stored = await AsyncStorage.getItem(SEEN_STORIES_STORAGE_KEY);
        if (stored) {
          const parsed: string[] = JSON.parse(stored);
          setSeenStoryIds(new Set(parsed));
        } else {
          setSeenStoryIds(new Set());
        }
      } catch (error) {
        console.error('Error loading seen stories:', error);
      }
    };
    loadSeenStories();
  }, [SEEN_STORIES_STORAGE_KEY]);

  // Save groups to AsyncStorage
  const saveGroups = async (newGroups: StoryGroup[]) => {
    setGroups(newGroups);
    try {
      await AsyncStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(newGroups));
    } catch (error) {
      console.error('Error saving groups:', error);
    }
  };

  // Save custom order to AsyncStorage
  const saveOrder = async (newOrder: string[]) => {
    setCustomOrder(newOrder);
    try {
      await AsyncStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(newOrder));
    } catch (error) {
      console.error('Error saving order:', error);
    }
  };

  // Move story in order (uses stories array passed in to avoid circular dependency)
  const moveStory = (storyId: string, direction: 'up' | 'down', storiesArray: CompletedStory[]) => {
    const currentOrderIds = customOrder.length > 0 
      ? customOrder.filter(id => storiesArray.some(s => s.id === id))
      : storiesArray.map(s => s.id);
    
    // Add any stories not in the order
    const missingIds = storiesArray.filter(s => !currentOrderIds.includes(s.id)).map(s => s.id);
    const fullOrder = [...currentOrderIds, ...missingIds];
    
    const currentIndex = fullOrder.indexOf(storyId);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= fullOrder.length) return;
    
    const newOrder = [...fullOrder];
    [newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]];
    saveOrder(newOrder);
  };

  // Shake animation for selection mode
  useEffect(() => {
    if (isSelectionMode) {
      const shake = Animated.loop(
        Animated.sequence([
          Animated.timing(shakeAnim, {
            toValue: 1,
            duration: 100,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnim, {
            toValue: -1,
            duration: 100,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnim, {
            toValue: 1,
            duration: 100,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnim, {
            toValue: 0,
            duration: 100,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ])
      );
      shake.start();
      return () => shake.stop();
    } else {
      shakeAnim.setValue(0);
    }
  }, [isSelectionMode]);

  const shakeStyle = {
    transform: [
      {
        rotate: shakeAnim.interpolate({
          inputRange: [-1, 1],
          outputRange: ['-2deg', '2deg'],
        }),
      },
    ],
  };

  // Fetch all completed stories from Firestore
  useEffect(() => {
    if (!user) {
      setCompletedStories([]);
      return;
    }

    const storiesRef = collection(db, 'stories');
    const q = query(
      storiesRef,
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const stories: CompletedStory[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          audioUrl: data.audioUrl,
          audioChunkURLs: data.audioChunkURLs || [],
          transcript: data.transcript,
          character: data.character || 'Unknown',
          trope: data.trope || 'Story',
          setting: data.setting || '',
          location: data.location || '',
          createdAt: data.createdAt?.toDate() || new Date(),
          duration: data.duration || '10min',
          title: data.title || '',
          prompt: data.prompt || '',
          tags: data.tags || [],
          coverColor: data.coverColor,
          topographyLayers: data.topographyLayers,
          groupId: data.groupId,
        };
      });
      setCompletedStories(stories);
    });

    return () => unsubscribe();
  }, [user]);

  // Filter to valid stories with audio
  const activeQueueItems = queue.filter(
    (q) => q.status === 'pending' || q.status === 'generating' || q.status === 'error'
  );
  const queueStoryIds = new Set(activeQueueItems.filter(q => q.storyId).map(q => q.storyId));

  const handleClearQueue = () => {
    const pendingCount = activeQueueItems.filter(q => q.status === 'pending' || q.status === 'error').length;
    if (pendingCount === 0) {
      Alert.alert('queue empty', 'there are no pending stories to clear');
      return;
    }
    if (Platform.OS === 'web') {
      if (window.confirm(`clear queue?\n\nthis will remove ${pendingCount} pending ${pendingCount === 1 ? 'story' : 'stories'} from the queue. stories currently generating will continue.`)) {
        clearQueue();
      }
      return;
    }
    Alert.alert(
      'clear queue?',
      `this will remove ${pendingCount} pending ${pendingCount === 1 ? 'story' : 'stories'} from the queue. stories currently generating will continue.`,
      [
        { text: 'cancel', style: 'cancel' },
        { text: 'clear', style: 'destructive', onPress: () => clearQueue() },
      ]
    );
  };

  const handleResetStuck = () => {
    const generatingCount = activeQueueItems.filter(q => q.status === 'generating').length;
    if (generatingCount === 0) {
      Alert.alert('no stuck stories', 'there are no generating stories to reset');
      return;
    }
    if (Platform.OS === 'web') {
      if (window.confirm(`reset stuck stories?\n\nthis will reset ${generatingCount} stuck ${generatingCount === 1 ? 'story' : 'stories'} so they can be retried.`)) {
        resetStuckStories();
      }
      return;
    }
    Alert.alert(
      'reset stuck stories?',
      `this will reset ${generatingCount} stuck ${generatingCount === 1 ? 'story' : 'stories'} so they can be retried.`,
      [
        { text: 'cancel', style: 'cancel' },
        { text: 'reset', onPress: () => resetStuckStories() },
      ]
    );
  };

  const validStories = completedStories.filter(s => {
    if (!s.audioUrl || !s.audioUrl.startsWith('https://')) return false;
    if (queueStoryIds.has(s.id)) return false;
    return true;
  });

  // Get ungrouped stories and sort by custom order
  const ungroupedStoriesUnsorted = validStories.filter(s => !groups.some(g => g.storyIds.includes(s.id)));
  
  const ungroupedStories = customOrder.length > 0
    ? [...ungroupedStoriesUnsorted].sort((a, b) => {
        const indexA = customOrder.indexOf(a.id);
        const indexB = customOrder.indexOf(b.id);
        // New stories (not in customOrder) should appear at the TOP, sorted by createdAt desc
        if (indexA === -1 && indexB === -1) {
          return b.createdAt.getTime() - a.createdAt.getTime();
        }
        if (indexA === -1) return -1; // a is new, put it first
        if (indexB === -1) return 1;  // b is new, put it first
        return indexA - indexB;
      })
    : ungroupedStoriesUnsorted;

  const formatTimestamp = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString([], { month: 'short', day: 'numeric' });
  };

  const getStoryTitle = (story: CompletedStory) => {
    const title = story.title || formatTimestamp(story.createdAt);
    // Limit to 24 characters to ensure titles fit without truncation
    if (title.length > 24) {
      return title.substring(0, 22) + '...';
    }
    return title;
  };

  // Handle double tap to play directly
  const handleDoubleTap = useCallback((story: CompletedStory) => {
    const effectiveAudioUrl = story.audioUrl || (story.audioChunkURLs?.[0] ?? '');
    router.push({
      pathname: '/player',
      params: {
        audioUrl: encodeURIComponent(effectiveAudioUrl),
        audioChunkURLs: story.audioChunkURLs ? JSON.stringify(story.audioChunkURLs) : '',
        transcript: String(story.transcript || ''),
        storyId: String(story.id || ''),
        coverColor: story.coverColor || '',
        topographyLayers: story.topographyLayers ? JSON.stringify(story.topographyLayers) : '',
      },
    });
  }, [router]);

  // Handle single tap to go to details
  const markStoryAsSeen = useCallback((storyId: string) => {
    setSeenStoryIds((prev) => {
      if (prev.has(storyId)) {
        return prev;
      }
      const updated = new Set(prev);
      updated.add(storyId);
      saveSeenStories(updated);
      return updated;
    });
  }, [saveSeenStories]);

  const handleSingleTap = useCallback((story: CompletedStory) => {
    const effectiveAudioUrl = story.audioUrl || (story.audioChunkURLs?.[0] ?? '');
    router.push({
      pathname: '/story-details' as any,
      params: {
        storyId: String(story.id || ''),
        audioUrl: encodeURIComponent(effectiveAudioUrl),
        audioChunkURLs: story.audioChunkURLs ? JSON.stringify(story.audioChunkURLs) : '',
        transcript: String(story.transcript || ''),
      },
    });
  }, [router]);

  const enterSelectionMode = () => {
    setIsSelectionMode(true);
  };

  const handleStoryPress = (story: CompletedStory) => {
    if (isSelectionMode) {
      setSelectedStoryIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(story.id)) {
          newSet.delete(story.id);
        } else {
          newSet.add(story.id);
        }
        return newSet;
      });
    } else {
      markStoryAsSeen(story.id);
      // Double tap detection
      const now = Date.now();
      const lastTap = lastTapRef.current[story.id] || 0;
      const DOUBLE_TAP_DELAY = 300;
      
      if (now - lastTap < DOUBLE_TAP_DELAY) {
        // Double tap - play directly
        lastTapRef.current[story.id] = 0;
        handleDoubleTap(story);
      } else {
        // Single tap - go to details after delay
        lastTapRef.current[story.id] = now;
        setTimeout(() => {
          if (lastTapRef.current[story.id] === now) {
            handleSingleTap(story);
          }
        }, DOUBLE_TAP_DELAY);
      }
    }
  };

  const cancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedStoryIds(new Set());
  };

  const createGroup = () => {
    if (selectedStoryIds.size === 0) {
      Alert.alert('No stories selected', 'Please select at least one story to create a group.');
      return;
    }
    setShowGroupModal(true);
  };

  const confirmCreateGroup = async () => {
    if (!newGroupName.trim()) {
      Alert.alert('Enter a name', 'Please enter a name for the group.');
      return;
    }

    const newGroup: StoryGroup = {
      id: `group_${Date.now()}`,
      name: newGroupName.trim(),
      storyIds: Array.from(selectedStoryIds),
      createdAt: new Date(),
    };

    await saveGroups([...groups, newGroup]);
    setShowGroupModal(false);
    setNewGroupName('');
    cancelSelection();
  };

  const deleteGroup = async (groupId: string) => {
    Alert.alert(
      'Delete Group',
      'Are you sure? Stories will not be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const newGroups = groups.filter(g => g.id !== groupId);
            await saveGroups(newGroups);
          },
        },
      ]
    );
  };

  const deleteStory = async (storyId: string) => {
    if (!user) return;
    Alert.alert(
      'Delete Story',
      'Are you sure you want to delete this story?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'stories', storyId));
              // Also remove from any groups
              const newGroups = groups.map(g => ({
                ...g,
                storyIds: g.storyIds.filter(id => id !== storyId),
              }));
              await saveGroups(newGroups);
            } catch (error) {
              console.error('Error deleting story:', error);
            }
          },
        },
      ]
    );
  };

  // Render a single story item on the shelf
  const renderStoryItem = (story: CompletedStory, index: number, totalInSection: number) => {
    const isSelected = selectedStoryIds.has(story.id);
    const isNewStory = !seenStoryIds.has(story.id);

    return (
      <TouchableOpacity
        key={story.id}
        style={[styles.storyItem, { width: STORY_WIDTH, height: STORY_WIDTH + 48 }]}
        onPress={() => handleStoryPress(story)}
        activeOpacity={0.8}
      >
        <Animated.View style={[styles.storyItemInner, isSelectionMode && shakeStyle]}>
          {/* Selection checkbox */}
          {isSelectionMode && (
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected, { borderColor: colors.text }]}>
              {isSelected && <IconSymbol name="checkmark" size={14} color="#fff" />}
            </View>
          )}
          
          {/* Reorder buttons in selection mode */}
          {isSelectionMode && (
            <View style={styles.reorderButtons}>
              {index > 0 && (
                <TouchableOpacity 
                  style={[styles.reorderButton, { backgroundColor: colors.card }]}
                  onPress={() => moveStory(story.id, 'up', ungroupedStories)}
                >
                  <IconSymbol name="chevron.left" size={12} color={colors.text} />
                </TouchableOpacity>
              )}
              {index < totalInSection - 1 && (
                <TouchableOpacity 
                  style={[styles.reorderButton, { backgroundColor: colors.card }]}
                  onPress={() => moveStory(story.id, 'down', ungroupedStories)}
                >
                  <IconSymbol name="chevron.right" size={12} color={colors.text} />
                </TouchableOpacity>
              )}
            </View>
          )}
          
          {/* Story artwork */}
          <View style={styles.artworkContainer}>
            <TopographicArtwork
              baseColor={story.coverColor || DEFAULT_COVER_COLOR}
              layers={story.topographyLayers}
              size={STORY_WIDTH}
            />
          </View>
          
          {/* New story badge - rendered after artwork for correct layering */}
          {isNewStory && !isSelectionMode && (
            <View style={[styles.newBadge, { borderColor: colors.background }]} />
          )}
          
          {/* Story title - fixed height container */}
          <View style={styles.titleContainer}>
            <Text 
              style={[styles.storyTitle, { color: colors.text }]} 
              numberOfLines={2}
            >
              {getStoryTitle(story)}
            </Text>
          </View>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  // Render a row of stories
  const renderRow = (stories: CompletedStory[], rowIndex: number, allStories: CompletedStory[]) => {
    return (
      <View key={rowIndex} style={styles.storiesRow}>
        {stories.map((story, localIdx) => {
          const globalIndex = rowIndex * storyCols + localIdx;
          return renderStoryItem(story, globalIndex, allStories.length);
        })}
        {/* Fill empty spots */}
        {Array.from({ length: storyCols - stories.length }).map((_, i) => (
          <View key={`empty-${i}`} style={[styles.storyItem, { width: STORY_WIDTH, height: STORY_WIDTH + 48 }]} />
        ))}
      </View>
    );
  };

  // Group stories into rows of 3
  const groupStoriesIntoRows = (stories: CompletedStory[]) => {
    const rows: CompletedStory[][] = [];
    for (let i = 0; i < stories.length; i += storyCols) {
      rows.push(stories.slice(i, i + storyCols));
    }
    return rows;
  };

  // Render a group section
  const renderGroup = (group: StoryGroup) => {
    const groupStories = validStories.filter(s => group.storyIds.includes(s.id));
    if (groupStories.length === 0) return null;

    const rows = groupStoriesIntoRows(groupStories);

    return (
      <View key={group.id} style={styles.groupSection}>
        <View style={styles.groupHeader}>
          <Text style={[styles.groupTitle, { color: colors.text }]}>{group.name}</Text>
          <TouchableOpacity onPress={() => deleteGroup(group.id)}>
            <IconSymbol name="ellipsis" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={styles.storiesGrid}>
          {rows.map((row, idx) => renderRow(row, idx, groupStories))}
        </View>
      </View>
    );
  };

  const ungroupedRows = groupStoriesIntoRows(ungroupedStories);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        {isSelectionMode ? (
          <>
            <TouchableOpacity onPress={cancelSelection}>
              <Text style={[styles.headerAction, { color: colors.text }]}>cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {selectedStoryIds.size} selected
            </Text>
            <TouchableOpacity onPress={createGroup}>
              <Text style={[styles.headerAction, { color: '#007AFF' }]}>group</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity onPress={() => setIsSelectionMode(true)}>
              <IconSymbol name="pencil" size={22} color="#007AFF" />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>{storedUserName ? `${storedUserName}'s stories` : 'my stories'}</Text>
            <TouchableOpacity style={styles.plusButton} onPress={() => router.push('/(tabs)/create')}>
              <IconSymbol name="plus" size={24} color="#007AFF" />
            </TouchableOpacity>
          </>
        )}
      </View>

      {validStories.length === 0 ? (
        <View style={styles.emptyState}>
          <IconSymbol name="books.vertical" size={64} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>no stories yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            create your first story to see it here
          </Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Queue items (generating) */}
          {activeQueueItems.length > 0 && (
            <View style={styles.queueSection}>
              <View style={styles.queueHeader}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>generating...</Text>
                <View style={styles.queueActions}>
                  {activeQueueItems.some(q => q.status === 'generating') && (
                    <TouchableOpacity onPress={handleResetStuck} style={styles.clearQueueButton}>
                      <Text style={[styles.clearQueueText, { color: colors.textSecondary }]}>reset</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={handleClearQueue} style={styles.clearQueueButton}>
                    <Text style={[styles.clearQueueText, { color: colors.textSecondary }]}>clear</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {activeQueueItems.map(item => (
                <View key={item.id} style={[styles.queueItem, { backgroundColor: colors.card }, item.status === 'error' && styles.queueItemError]}>
                  <View style={[styles.queueSpinner, item.status === 'error' && { backgroundColor: 'rgba(255,59,48,0.15)' }]}>
                    {item.status === 'error' ? (
                      <IconSymbol name="exclamationmark.triangle" size={18} color="#FF3B30" />
                    ) : (
                      <Svg width={28} height={28} style={{ transform: [{ rotate: '-90deg' }] }}>
                        <Circle
                          cx={14}
                          cy={14}
                          r={11}
                          stroke="transparent"
                          strokeWidth={2.5}
                          fill="none"
                        />
                        <Circle
                          cx={14}
                          cy={14}
                          r={11}
                          stroke="#FFFFFF"
                          strokeWidth={2.5}
                          fill="none"
                          strokeDasharray={2 * Math.PI * 11}
                          strokeDashoffset={2 * Math.PI * 11 * (1 - (item.progress || 0) / 100)}
                          strokeLinecap="round"
                        />
                      </Svg>
                    )}
                  </View>
                  <View style={styles.queueItemContent}>
                    <Text style={[styles.queueText, { color: colors.text }]}>
                      {item.recipeData?.character || formatTimestamp(item.createdAt)}
                    </Text>
                    {item.status === 'error' && item.error && (
                      <Text style={[styles.queueStepText, { color: '#FF3B30' }]} numberOfLines={2}>
                        {item.error}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Groups */}
          {groups.map(group => renderGroup(group))}

          {/* Ungrouped stories */}
          {ungroupedStories.length > 0 && (
            <View style={styles.groupSection}>
              {groups.length > 0 && (
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ungrouped</Text>
              )}
              <View style={styles.storiesGrid}>
                {ungroupedRows.map((row, idx) => renderRow(row, idx, ungroupedStories))}
              </View>
            </View>
          )}

        </ScrollView>
      )}

      {/* Group creation modal */}
      <Modal
        visible={showGroupModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGroupModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>create group</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="group name"
              placeholderTextColor={colors.textSecondary}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: colors.background }]} 
                onPress={() => setShowGroupModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: '#007AFF' }]} 
                onPress={confirmCreateGroup}
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  headerAction: {
    fontSize: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  plusButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 24,
    paddingBottom: 100,
  },
  queueSection: {
    paddingHorizontal: SHELF_PADDING,
    marginBottom: 24,
  },
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  queueActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearQueueButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  clearQueueText: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    gap: 12,
  },
  queueSpinner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueProgress: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  queueText: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  queueItemError: {
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.3)',
  },
  queueItemContent: {
    flex: 1,
  },
  queueStepText: {
    fontSize: 12,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    marginTop: 2,
  },
  groupSection: {
    marginBottom: 24,
  },
  storiesGrid: {
    paddingHorizontal: SHELF_PADDING,
    gap: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SHELF_PADDING,
    marginBottom: 16,
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    paddingHorizontal: SHELF_PADDING,
    marginBottom: 12,
  },
  storiesRow: {
    flexDirection: 'row',
    gap: STORY_GAP,
  },
  storyItem: {
  },
  storyItemInner: {
    position: 'relative',
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
    zIndex: 12,
  },
  checkbox: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.9)',
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  reorderButtons: {
    position: 'absolute',
    bottom: 28,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    zIndex: 10,
  },
  reorderButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...createShadow('#000', 0, 1, 2, 0.2, 2),
  },
  artworkContainer: {
    aspectRatio: 1,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    height: 40, // Fixed height for title area (2 lines)
    marginTop: 8,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  storyTitle: {
    fontSize: 12,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
    textAlign: 'center',
    lineHeight: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 8,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  emptySubtitle: {
    fontSize: 16,
    textAlign: 'center',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  hint: {
    fontSize: 12,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: SHELF_PADDING,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
});
