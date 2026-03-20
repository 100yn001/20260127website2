import TopographicArtwork from '@/components/TopographicArtwork';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { db } from '@/config/firebase';
import { DEFAULT_COVER_COLOR } from '@/constants/cover-colors';
import { useAuth } from '@/contexts/AuthContext';
import { useStoryQueue } from '@/contexts/StoryQueueContext';
import { useTheme } from '@/contexts/ThemeContext';
import { addBookmark, getBookmarkedStoryIds, removeBookmark } from '@/services/user-service';
import { DepthLayer } from '@/types/story';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    Animated,
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

interface CompletedStory {
  id: string;
  audioUrl: string;
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
}

export default function MyStoriesScreen() {
  const { queue, removeFromQueue, retryStory } = useStoryQueue();
  const { user } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const [completedStories, setCompletedStories] = useState<CompletedStory[]>([]);
  const [tagPrefs, setTagPrefs] = useState<Record<string, { addedTags: string[]; removedTags: string[] }>>({});
  const [addingTagFor, setAddingTagFor] = useState<string | null>(null);
  const [newTagText, setNewTagText] = useState('');
  const [editingTitleStoryId, setEditingTitleStoryId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [editingPromptStoryId, setEditingPromptStoryId] = useState<string | null>(null);
  const [editingPromptValue, setEditingPromptValue] = useState('');
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [editingTagsStoryId, setEditingTagsStoryId] = useState<string | null>(null);
  const [editingTagsValue, setEditingTagsValue] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null);
  const [favoriteStoryIds, setFavoriteStoryIds] = useState<Set<string>>(new Set());

  const tagPrefsKey = 'storyTagPreferences';

  const deleteCompletedStory = async (storyId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'stories', storyId));
      console.log('🗑️ Deleted story:', storyId);
    } catch (error) {
      console.error('Error deleting story:', error);
    }
  };

  // Load favorites from AsyncStorage
  useEffect(() => {
    const loadFavorites = async () => {
      if (!user) return;
      try {
        const bookmarkedIds = await getBookmarkedStoryIds(user.uid);
        setFavoriteStoryIds(new Set(bookmarkedIds));
      } catch (error) {
        console.error('Error loading favorites:', error);
      }
    };
    loadFavorites();
  }, [user]);

  // Load tag preferences from AsyncStorage
  useEffect(() => {
    const loadTagPrefs = async () => {
      try {
        const stored = await AsyncStorage.getItem(tagPrefsKey);
        if (stored) {
          setTagPrefs(JSON.parse(stored));
        }
      } catch (error) {
        console.error('Error loading tag preferences:', error);
      }
    };
    loadTagPrefs();
  }, []);

  const persistTagPrefs = async (prefs: typeof tagPrefs) => {
    setTagPrefs(prefs);
    try {
      await AsyncStorage.setItem(tagPrefsKey, JSON.stringify(prefs));
    } catch (error) {
      console.error('Error saving tag preferences:', error);
    }
  };

  const getStoryKey = (item: any) => item.storyId || item.id;

  const getBaseTags = (item: any) => {
    const base = [
      item.recipeData?.character,
      item.recipeData?.trope,
      item.recipeData?.setting,
      item.recipeData?.location,
    ].filter((tag): tag is string => Boolean(tag));
    // Remove duplicates while preserving order
    return Array.from(new Set(base));
  };

  const getDisplayTags = (item: any) => {
    const baseTags = getBaseTags(item);
    const key = getStoryKey(item);
    const prefs = tagPrefs[key] || { addedTags: [], removedTags: [] };
    const filteredBase = baseTags.filter(tag => !prefs.removedTags.includes(tag));
    return [...filteredBase, ...prefs.addedTags];
  };

  const handleRemoveTag = (item: any, tag: string) => {
    const key = getStoryKey(item);
    const prefs = tagPrefs[key] || { addedTags: [], removedTags: [] };
    let updatedPrefs = { ...prefs };

    if (prefs.addedTags.includes(tag)) {
      updatedPrefs.addedTags = prefs.addedTags.filter(t => t !== tag);
    } else {
      updatedPrefs.removedTags = Array.from(new Set([...prefs.removedTags, tag]));
    }

    const next = { ...tagPrefs, [key]: updatedPrefs };
    persistTagPrefs(next);
  };

  const handleAddTag = (item: any) => {
    const trimmed = newTagText.trim();
    if (!trimmed) return;
    const key = getStoryKey(item);
    const prefs = tagPrefs[key] || { addedTags: [], removedTags: [] };
    const updatedPrefs = {
      addedTags: Array.from(new Set([...prefs.addedTags, trimmed])),
      removedTags: prefs.removedTags.filter(tag => tag !== trimmed),
    };
    const next = { ...tagPrefs, [key]: updatedPrefs };
    persistTagPrefs(next);
    setNewTagText('');
    setAddingTagFor(null);
  };

  const formatTimestamp = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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
      console.log(`📚 Loaded ${snapshot.docs.length} stories from Firestore`);
      const stories: CompletedStory[] = snapshot.docs.map(doc => {
        const data = doc.data();
        console.log(`Story ${doc.id}:`, {
          hasAudioUrl: !!data.audioUrl,
          audioUrl: data.audioUrl,
          hasTranscript: !!data.transcript,
          character: data.character,
        });
        return {
          id: doc.id,
          audioUrl: data.audioUrl,
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
        };
      });
      setCompletedStories(stories);
    });

    return () => unsubscribe();
  }, [user]);

  // Show queue items only while they are pending/generating/error
  const activeQueueItems = queue.filter(
    (q) => q.status === 'pending' || q.status === 'generating' || q.status === 'error'
  );
  const queueStoryIds = new Set(activeQueueItems.filter(q => q.storyId).map(q => q.storyId));

  const validQueueItems = activeQueueItems.map(q => ({ ...q, type: 'queue' as const }));
  
  // Filter completed stories
  const filteredCompletedStories = completedStories.filter(s => {
    if (!s.audioUrl || !s.audioUrl.startsWith('https://')) return false;
    if (queueStoryIds.has(s.id)) return false; // Skip if an active queue item still references it
    return true;
  });
  
  console.log(`📊 Story counts: ${validQueueItems.length} in queue (active), ${filteredCompletedStories.length} completed`);
  
  const allStories = [
    ...validQueueItems,
    ...filteredCompletedStories.map(s => ({
      id: s.id,
      storyId: s.id,
      audioUrl: s.audioUrl,
      transcript: s.transcript,
      recipeData: {
        character: s.character,
        trope: s.trope,
        setting: s.setting,
        location: s.location,
      },
      status: 'complete' as const,
      progress: 100,
      createdAt: s.createdAt,
      type: 'completed' as const,
      title: s.title,
      prompt: s.prompt,
      tags: s.tags,
      coverColor: s.coverColor,
      topographyLayers: s.topographyLayers,
    }))
  ];

  const getStoryTitle = (item: any) => {
    if (item.title) return item.title;
    if (item.recipeData?.title) return item.recipeData.title;
    return formatTimestamp(new Date(item.createdAt));
  };

  const beginEditTitle = (item: any) => {
    // For completed stories from the stories collection, use the actual story ID
    const storyId = item.storyId || item.id;
    console.log('Begin edit title for:', storyId, 'current title:', getStoryTitle(item));
    setEditingTitleStoryId(storyId);
    setEditingTitleValue(getStoryTitle(item));
  };

  const cancelEditTitle = () => {
    setEditingTitleStoryId(null);
    setEditingTitleValue('');
  };

  const saveTitle = async () => {
    if (!editingTitleStoryId || !user || isSavingTitle) return;
    const trimmed = editingTitleValue.trim();
    setIsSavingTitle(true);
    try {
      console.log('Updating story title:', editingTitleStoryId, 'to:', trimmed || '(cleared - will show timestamp)');
      
      if (trimmed) {
        // Save the custom title
        await updateDoc(doc(db, 'stories', editingTitleStoryId), { title: trimmed });
        setCompletedStories(prev => prev.map(story => story.id === editingTitleStoryId ? { ...story, title: trimmed } : story));
      } else {
        // Clear the title to revert to timestamp
        await updateDoc(doc(db, 'stories', editingTitleStoryId), { title: null });
        setCompletedStories(prev => prev.map(story => {
          if (story.id === editingTitleStoryId) {
            const { title, ...rest } = story;
            return rest;
          }
          return story;
        }));
      }
      
      console.log('Title updated successfully in Firestore');
      cancelEditTitle();
    } catch (error) {
      console.error('Error renaming story:', error);
      alert(`Failed to save title: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSavingTitle(false);
    }
  };

  const beginEditPrompt = (item: any) => {
    const storyId = getStoryKey(item);
    setEditingPromptStoryId(storyId);
    setEditingPromptValue(item.prompt || '');
  };

  const cancelEditPrompt = () => {
    setEditingPromptStoryId(null);
    setEditingPromptValue('');
  };

  const savePrompt = async () => {
    if (!editingPromptStoryId || !user || isSavingPrompt) return;
    const trimmed = editingPromptValue.trim();
    setIsSavingPrompt(true);
    try {
      await updateDoc(doc(db, 'stories', editingPromptStoryId), { prompt: trimmed });
      setCompletedStories(prev => prev.map(story => story.id === editingPromptStoryId ? { ...story, prompt: trimmed } : story));
      cancelEditPrompt();
    } catch (error) {
      console.error('Error updating prompt:', error);
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const beginEditTags = (item: any) => {
    const storyId = getStoryKey(item);
    setEditingTagsStoryId(storyId);
    setEditingTagsValue([...(item.tags || [])]);
  };

  const cancelEditTags = () => {
    setEditingTagsStoryId(null);
    setEditingTagsValue([]);
    setNewTagInput('');
  };

  const addTagToEdit = () => {
    const trimmed = newTagInput.trim();
    if (!trimmed) return;
    setEditingTagsValue(prev => Array.from(new Set([...prev, trimmed])));
    setNewTagInput('');
  };

  const removeTagFromEdit = (tag: string) => {
    setEditingTagsValue(prev => prev.filter(t => t !== tag));
  };

  const saveTags = async () => {
    if (!editingTagsStoryId || !user || isSavingTags) return;
    setIsSavingTags(true);
    try {
      await updateDoc(doc(db, 'stories', editingTagsStoryId), { tags: editingTagsValue });
      setCompletedStories(prev => prev.map(story => story.id === editingTagsStoryId ? { ...story, tags: editingTagsValue } : story));
      cancelEditTags();
    } catch (error) {
      console.error('Error updating tags:', error);
    } finally {
      setIsSavingTags(false);
    }
  };

  const renderProgressCircle = (progress: number) => {
    const size = 80;
    const strokeWidth = 6;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
      <View style={styles.progressContainer}>
        <Svg width={size} height={size}>
          {/* Background circle */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.border}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress circle */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.text}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={styles.progressTextContainer}>
          <Text style={[styles.progressText, { color: colors.text }]}>{Math.round(progress)}%</Text>
        </View>
      </View>
    );
  };

  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>, item: any) => {
    const trans = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [0, 100],
      extrapolate: 'clamp',
    });

    const handleDelete = async () => {
      if (item.type === 'queue') {
        await removeFromQueue(item.id);
      } else {
        await deleteCompletedStory(item.id);
      }
    };

    return (
      <Animated.View style={[styles.swipeAction, { transform: [{ translateX: trans }] }]}>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
          <IconSymbol name="trash" size={24} color="#fff" />
          <Text style={styles.deleteText}>delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderQueueItem = ({ item }: { item: any }) => {
    const isComplete = item.status === 'complete';
    const isError = item.status === 'error';
    const isGenerating = item.status === 'generating';
    const key = getStoryKey(item);
    const isEditingTitle = editingTitleStoryId === key;
    const canRename = isComplete && item.type === 'completed';
    const isExpanded = expandedStoryId === key;
    const isEditingPrompt = editingPromptStoryId === key;
    const isEditingTags = editingTagsStoryId === key;
    
    // Get prompt and tags from completed story
    const storyPrompt = item.prompt || '';
    const storyTags = item.tags || [];
    
    // Debug logging
    if (isExpanded && isComplete) {
      console.log('Expanded story details:', {
        id: item.id,
        hasPrompt: !!storyPrompt,
        prompt: storyPrompt,
        hasTags: storyTags.length > 0,
        tags: storyTags,
      });
    }

    return (
      <Swipeable
        renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
        overshootRight={false}
      >
        <TouchableOpacity
        style={[styles.storyCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => {
          if (isComplete) {
            setExpandedStoryId(isExpanded ? null : key);
          }
        }}
        activeOpacity={1}
        disabled={!isComplete}
      >
        <View style={styles.cardContent}>
          {/* Progress indicator for generating/error stories */}
          {!isComplete && (
            <>
              {isError ? (
                <View style={styles.iconContainer}>
                  <IconSymbol name="exclamationmark.circle.fill" size={40} color="#ef4444" />
                </View>
              ) : (
                renderProgressCircle(item.progress)
              )}
            </>
          )}

          {/* Story info */}
          <View style={[styles.storyInfo, !isComplete && styles.storyInfoWithIcon]}>
            <View style={styles.titleRow}>
              <Text style={[styles.storyTitle, { color: colors.text }]}>{getStoryTitle(item)}</Text>
            </View>
            <Text style={[styles.storySubtitle, { color: colors.textSecondary }]}>{item.recipeData?.character || 'story'}</Text>
            <Text style={[styles.storyStatus, { color: colors.textSecondary }]}>
              {isComplete && '✓ ready to listen'}
              {isGenerating && 'generating your story...'}
              {item.status === 'pending' && 'waiting in queue...'}
              {isError && `error: ${item.error || 'generation failed'}`}
            </Text>

            
            {isComplete && isExpanded && (
              <View style={styles.expandedDetails}>
                {isEditingTitle && (
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>title</Text>
                    <Text style={[styles.detailHint, { color: colors.textSecondary }]}>leave blank to show timestamp</Text>
                    <View style={styles.renameRow}>
                      <View style={styles.renameInputContainer}>
                        <TextInput
                          style={[styles.renameInput, { borderColor: colors.border, color: colors.text }]}
                          value={editingTitleValue}
                          onChangeText={setEditingTitleValue}
                          placeholder="enter title"
                          placeholderTextColor={colors.textSecondary}
                          autoFocus
                          editable={!isSavingTitle}
                        />
                        {editingTitleValue.length > 0 && (
                          <TouchableOpacity 
                            style={styles.clearButton}
                            onPress={() => setEditingTitleValue('')}
                          >
                            <IconSymbol name="xmark.circle.fill" size={18} color="#999" />
                          </TouchableOpacity>
                        )}
                      </View>
                      <TouchableOpacity onPress={saveTitle} disabled={isSavingTitle}>
                        <Text style={[styles.renameAction, { color: colors.text }, isSavingTitle && styles.renameActionDisabled]}>save</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={cancelEditTitle} disabled={isSavingTitle}>
                        <Text style={[styles.renameAction, styles.renameCancel, { color: colors.textSecondary }]}>cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                {/* Prompt Section */}
                <View style={styles.detailSection}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>description</Text>
                  {isEditingPrompt ? (
                    <View style={styles.editContainer}>
                      <TextInput
                        style={[styles.promptInput, { backgroundColor: colors.card, color: colors.text }]}
                        value={editingPromptValue}
                        onChangeText={setEditingPromptValue}
                        placeholder="add a description for this story..."
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        numberOfLines={3}
                        editable={!isSavingPrompt}
                      />
                      <View style={styles.editActions}>
                        <TouchableOpacity onPress={savePrompt} disabled={isSavingPrompt}>
                          <Text style={[styles.editActionText, { color: colors.text }, isSavingPrompt && styles.editActionDisabled]}>save</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={cancelEditPrompt} disabled={isSavingPrompt}>
                          <Text style={[styles.editActionText, styles.editActionCancel, { color: colors.textSecondary }]}>cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <Text style={[styles.detailText, { color: colors.text }]}>{storyPrompt || 'no description'}</Text>
                  )}
                </View>
                
                {/* Tags Section */}
                <View style={styles.detailSection}>
                  <View style={styles.detailHeader}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>tags</Text>
                  </View>
                  {isEditingTags ? (
                    <View style={styles.editContainer}>
                      <View style={styles.tagsWrap}>
                        {editingTagsValue.map((tag, idx) => (
                          <TouchableOpacity key={idx} style={[styles.tagChipEditable, { backgroundColor: colors.card }]} onPress={() => removeTagFromEdit(tag)}>
                            <Text style={[styles.tagChipText, { color: colors.text }]}>{tag}</Text>
                            <Text style={[styles.tagRemoveIcon, { color: colors.textSecondary }]}>×</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={styles.addTagRow}>
                        <TextInput
                          style={[styles.tagInput, { backgroundColor: colors.card, color: colors.text }]}
                          value={newTagInput}
                          onChangeText={setNewTagInput}
                          placeholder="add tag..."
                          placeholderTextColor={colors.textSecondary}
                          onSubmitEditing={addTagToEdit}
                        />
                        <TouchableOpacity onPress={addTagToEdit} disabled={!newTagInput.trim()}>
                          <Text style={[styles.editActionText, { color: colors.text }, !newTagInput.trim() && styles.editActionDisabled]}>add</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.editActions}>
                        <TouchableOpacity onPress={saveTags} disabled={isSavingTags}>
                          <Text style={[styles.editActionText, { color: colors.text }, isSavingTags && styles.editActionDisabled]}>save</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={cancelEditTags} disabled={isSavingTags}>
                          <Text style={[styles.editActionText, styles.editActionCancel, { color: colors.textSecondary }]}>cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.tagsWrap}>
                      {storyTags.length > 0 ? (
                        storyTags.map((tag: string, idx: number) => (
                          <View key={idx} style={[styles.tagChip, { backgroundColor: colors.card }]}>
                            <Text style={[styles.tagChipText, { color: colors.text }]}>{tag}</Text>
                          </View>
                        ))
                      ) : (
                        <Text style={[styles.detailText, { color: colors.textSecondary }]}>no tags</Text>
                      )}
                    </View>
                  )}
                </View>
                
                <View style={styles.storyActions}>
                  <TouchableOpacity
                    style={[styles.playButton, { backgroundColor: colors.buttonBackground }]}
                    onPress={() => {
                      if (item.storyId && item.audioUrl) {
                        router.push({
                          pathname: '/player',
                          params: {
                            audioUrl: encodeURIComponent(String(item.audioUrl || '')),
                            audioChunkURLs: item.audioChunkURLs?.length ? JSON.stringify(item.audioChunkURLs) : '',
                            transcript: String(item.transcript || ''),
                            storyId: String(item.storyId || ''),
                          },
                        });
                      }
                    }}
                  >
                    <IconSymbol name="play.circle.fill" size={20} color={colors.buttonText} />
                    <Text style={[styles.playButtonText, { color: colors.buttonText }]}>play story</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      if (isEditingTitle || isEditingPrompt || isEditingTags) {
                        // Exit editing mode
                        cancelEditTitle();
                        cancelEditPrompt();
                        cancelEditTags();
                      } else {
                        // Enter editing mode
                        beginEditPrompt(item);
                        beginEditTitle(item);
                        beginEditTags(item);
                      }
                    }}
                    style={styles.iconButton}
                  >
                    <IconSymbol name={isEditingTitle || isEditingPrompt || isEditingTags ? "xmark" : "pencil"} size={20} color="#007AFF" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      router.push({
                        pathname: '/regenerate',
                        params: {
                          storyId: item.storyId || item.id,
                          transcript: item.transcript || '',
                          audioUrl: item.audioUrl || '',
                        },
                      });
                    }}
                    style={styles.iconButton}
                  >
                    <IconSymbol name="arrow.triangle.2.circlepath" size={20} color="#007AFF" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={async () => {
                      if (!user) return;
                      const storyId = item.storyId || item.id;
                      const isCurrentlyBookmarked = favoriteStoryIds.has(storyId);
                      
                      // Update UI immediately
                      setFavoriteStoryIds(prev => {
                        const newSet = new Set(prev);
                        if (isCurrentlyBookmarked) {
                          newSet.delete(storyId);
                        } else {
                          newSet.add(storyId);
                        }
                        return newSet;
                      });
                      
                      // Save to Firestore
                      try {
                        if (isCurrentlyBookmarked) {
                          await removeBookmark(user.uid, storyId);
                        } else {
                          await addBookmark(user.uid, storyId);
                        }
                      } catch (error) {
                        console.error('Error updating bookmark:', error);
                      }
                    }}
                    style={styles.iconButton}
                  >
                    <IconSymbol 
                      name={favoriteStoryIds.has(item.storyId || item.id) ? "bookmark.fill" : "bookmark"} 
                      size={20} 
                      color="#007AFF" 
                    />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {isComplete && item.type === 'completed' && (
            <View style={styles.storyArtwork}>
              <TopographicArtwork
                baseColor={item.coverColor || DEFAULT_COVER_COLOR}
                layers={item.topographyLayers}
                size={132}
              />
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            {isComplete && item.type === 'queue' && (
              <TouchableOpacity onPress={() => removeFromQueue(item.id)}>
                <IconSymbol name="trash" size={20} color="#717182" />
              </TouchableOpacity>
            )}
            {isError && (
              <TouchableOpacity onPress={() => retryStory(item.id)} style={[styles.retryButton, { backgroundColor: colors.card }]}>
                <Text style={[styles.retryText, { color: colors.text }]}>retry</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
      </Swipeable>
    );
  };


  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>my stories</Text>
        <TouchableOpacity style={styles.plusButton} onPress={() => router.push('/(tabs)/create')}>
          <IconSymbol name="plus" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {allStories.length === 0 ? (
        <View style={styles.emptyState}>
          <IconSymbol name="music.note" size={64} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>no stories yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>create your first story to see it here</Text>
        </View>
      ) : (
        <FlatList
          data={allStories}
          renderItem={renderQueueItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
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
  plusButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 24,
    gap: 16,
  },
  storyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E5E7',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  storyArtwork: {
    marginLeft: 'auto',
  },
  progressContainer: {
    position: 'relative',
    width: 80,
    height: 80,
  },
  progressTextContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#030213',
    fontFamily: 'EBGaramond-Medium',
  },
  iconContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyInfo: {
    flex: 1,
    gap: 6,
  },
  storyInfoWithIcon: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  storyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#030213',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  renameButtonText: {
    fontSize: 13,
    color: '#717182',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  renameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  renameInputContainer: {
    flex: 1,
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  renameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(3,2,19,0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingRight: 35,
    paddingVertical: 6,
    fontSize: 14,
    color: '#030213',
    fontFamily: 'EBGaramond-Regular',
  },
  clearButton: {
    position: 'absolute',
    right: 8,
    padding: 4,
  },
  renameAction: {
    fontSize: 13,
    color: '#030213',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  renameActionDisabled: {
    color: '#B8B8C4',
  },
  renameCancel: {
    color: '#717182',
  },
  storySubtitle: {
    fontSize: 14,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
  },
  storyStatus: {
    fontSize: 13,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
  },
  viewDetailsText: {
    fontSize: 13,
    color: '#030213',
    marginTop: 8,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  expandedDetails: {
    marginTop: 16,
    gap: 16,
  },
  detailSection: {
    gap: 8,
  },
  detailLabel: {
    fontSize: 12,
    color: '#717182',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  detailHint: {
    fontSize: 11,
    color: '#999',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
    marginBottom: 4,
  },
  detailText: {
    fontSize: 14,
    color: '#030213',
    fontFamily: 'EBGaramond-Regular',
    lineHeight: 20,
  },
  noDetailsText: {
    fontSize: 13,
    color: '#717182',
    fontStyle: 'italic',
    textAlign: 'center',
    fontFamily: 'EBGaramond-Regular',
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    backgroundColor: '#ececf0',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagChipText: {
    fontSize: 12,
    color: '#030213',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  tagChipEditable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ececf0',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagRemoveIcon: {
    fontSize: 18,
    color: '#717182',
    fontWeight: 'bold',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  editButtonText: {
    fontSize: 12,
    color: '#030213',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  editContainer: {
    gap: 12,
  },
  promptInput: {
    backgroundColor: '#f7f7f8',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#030213',
    fontFamily: 'EBGaramond-Regular',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  tagInput: {
    flex: 1,
    backgroundColor: '#f7f7f8',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#030213',
    fontFamily: 'EBGaramond-Regular',
  },
  addTagRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  editActions: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'flex-end',
  },
  editActionText: {
    fontSize: 14,
    color: '#030213',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  editActionDisabled: {
    color: '#B8B8C4',
  },
  editActionCancel: {
    color: '#717182',
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#030213',
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  playButtonText: {
    fontSize: 14,
    color: '#fff',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  storyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 8,
  },
  iconButton: {
    padding: 8,
  },
  editLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editLinkText: {
    fontSize: 14,
    color: '#007AFF',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  menuItemText: {
    fontSize: 14,
    color: '#030213',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ececf0',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  tagPillText: {
    fontSize: 12,
    color: '#030213',
    fontFamily: 'EBGaramond-Regular',
  },
  tagRemove: {
    fontSize: 14,
    color: '#717182',
  },
  addTagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f7f7f8',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 8,
  },
  addTagInput: {
    minWidth: 80,
    fontSize: 12,
    color: '#030213',
    fontFamily: 'EBGaramond-Regular',
  },
  addTagConfirm: {
    fontSize: 12,
    color: '#030213',
    fontFamily: 'EBGaramond-Medium',
  },
  addTagButton: {
    borderWidth: 1,
    borderColor: '#ececf0',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addTagText: {
    fontSize: 12,
    color: '#030213',
    fontFamily: 'EBGaramond-Regular',
  },
  actions: {
    gap: 8,
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ececf0',
    borderRadius: 6,
  },
  retryText: {
    fontSize: 12,
    color: '#030213',
    fontFamily: 'EBGaramond-Regular',
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
    color: '#030213',
    marginTop: 24,
    marginBottom: 8,
    fontFamily: 'EBGaramond-Medium',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#717182',
    textAlign: 'center',
    fontFamily: 'EBGaramond-Regular',
  },
  swipeAction: {
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'flex-end',
    borderRadius: 16,
    marginLeft: 8,
  },
  deleteButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: '100%',
    paddingHorizontal: 20,
  },
  deleteText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
    fontFamily: 'EBGaramond-Medium',
  },
});
