import TopographicArtwork from '@/components/TopographicArtwork';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { db } from '@/config/firebase';
import { DEFAULT_COVER_COLOR, THEME_COLOR_OPTIONS } from '@/constants/cover-colors';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
    getNotificationsEnabled,
    requestNotificationPermissions,
    setNotificationsEnabled as saveNotificationsEnabled,
} from '@/services/notification-service';
import { deleteUserData, getBookmarkedStoryIds } from '@/services/user-service';
import { DepthLayer } from '@/types/story';
import { createShadow } from '@/utils/shadow';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    DeviceEventEmitter,
    Modal,
    Platform,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';

const SHELF_PADDING = 24;
const STORY_GAP = 12;
const STORIES_PER_ROW = 3;

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
  coverColor?: string;
  topographyLayers?: DepthLayer[];
};

export default function ProfileScreen() {
  const [userName, setUserName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [tags, setTags] = useState(['mystery lover', 'fantasy fan', 'night listener']);
  const [newTag, setNewTag] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'bookmarks'>('overview');
  const [bookmarkedStories, setBookmarkedStories] = useState<BookmarkedStory[]>([]);
  const [isLoadingBookmarks, setIsLoadingBookmarks] = useState(true);
  const [isRefreshingBookmarks, setIsRefreshingBookmarks] = useState(false);
  const [storyCount, setStoryCount] = useState(0);
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [memberSince, setMemberSince] = useState('');

  const router = useRouter();
  const { width: vw } = useWindowDimensions();
  const bookmarkCols = Platform.OS === 'web' ? (vw >= 1024 ? 5 : vw >= 600 ? 4 : STORIES_PER_ROW) : STORIES_PER_ROW;
  const TILE_WIDTH = (vw - SHELF_PADDING * 2 - STORY_GAP * (bookmarkCols - 1)) / bookmarkCols;
  const { user, signOut, deleteAccount } = useAuth();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const { theme, toggleTheme, colors } = useTheme();
    const chipBackground = theme === 'light' ? '#ececf0' : '#2b2b34';
  const chipBorder = theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)';
  const dividerColor = theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)';
  const mutedText = theme === 'light' ? '#717182' : '#9da0ad';
  const [defaultThemeColor, setDefaultThemeColor] = useState<string>(DEFAULT_COVER_COLOR);

  useEffect(() => {
    loadUserName();
    // Get member since date from Firebase user metadata
    if (user?.metadata?.creationTime) {
      const creationDate = new Date(user.metadata.creationTime);
      const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const month = monthNames[creationDate.getMonth()];
      const year = creationDate.getFullYear();
      setMemberSince(`storyteller since ${month} ${year}`);
    }
  }, [user]);

  useEffect(() => {
    const loadNotificationSetting = async () => {
      const enabled = await getNotificationsEnabled();
      setNotificationsEnabled(enabled);
    };
    loadNotificationSetting();
  }, []);

  const handleNotificationsToggle = async (value: boolean) => {
    if (value) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert('permissions required', 'please enable notifications in your device settings to receive story alerts.');
        return;
      }
    }
    setNotificationsEnabled(value);
    await saveNotificationsEnabled(value);
  };

  useEffect(() => {
    const loadStats = async () => {
      if (!user) {
        setStoryCount(0);
        setBookmarkCount(0);
        return;
      }
      try {
        // Load story count
        const storiesQuery = query(collection(db, 'stories'), where('userId', '==', user.uid));
        const storiesSnapshot = await getDocs(storiesQuery);
        setStoryCount(storiesSnapshot.size);

        // Load bookmark count
        const bookmarkIds = await getBookmarkedStoryIds(user.uid);
        setBookmarkCount(bookmarkIds.length);
      } catch (error) {
        console.error('Error loading stats:', error);
      }
    };
    loadStats();
  }, [user]);

  useEffect(() => {
    const loadDefaultThemeColor = async () => {
      try {
        const stored = await AsyncStorage.getItem('defaultThemeColor');
        if (stored) {
          setDefaultThemeColor(stored);
        }
      } catch (error) {
        console.warn('Failed to load default theme color', error);
      }
    };
    loadDefaultThemeColor();
  }, []);

  const loadBookmarks = useCallback(async () => {
    if (!user) {
      setBookmarkedStories([]);
      setIsLoadingBookmarks(false);
      return;
    }

    setIsLoadingBookmarks(true);
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
      setIsLoadingBookmarks(false);
    }
  }, [user]);

  const handleRefreshBookmarks = useCallback(async () => {
    setIsRefreshingBookmarks(true);
    await loadBookmarks();
    setIsRefreshingBookmarks(false);
  }, [loadBookmarks]);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('bookmarkChanged', () => {
      loadBookmarks();
    });
    return () => {
      subscription.remove();
    };
  }, [loadBookmarks]);

  const loadUserName = async () => {
    const name = await AsyncStorage.getItem('userName');
    setUserName(name || 'User');
    setEditedName(name || 'User');
  };

  const handleOpenBookmark = (story: BookmarkedStory) => {
    if (!story.audioUrl) return;
    router.push({
      pathname: '/player',
      params: {
        storyId: story.id,
        audioUrl: encodeURIComponent(String(story.audioUrl)),
        audioChunkURLs: (story as any).audioChunkURLs?.length ? JSON.stringify((story as any).audioChunkURLs) : '',
        transcript: story.transcript || '',
        title: story.title || '',
      },
    });
  };

  const handleSaveName = async () => {
    if (editedName.trim()) {
      await AsyncStorage.setItem('userName', editedName);
      setUserName(editedName);
      setIsEditingName(false);
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleSelectThemeColor = async (color: string) => {
    setDefaultThemeColor(color);
    try {
      await AsyncStorage.setItem('defaultThemeColor', color);
    } catch (error) {
      console.error('Failed to save theme color', error);
    }
  };

  
  const handleLogOut = () => {
    const doLogOut = async () => {
      await signOut();
      await AsyncStorage.multiRemove(['hasCompletedOnboarding', 'userName', 'onboardingAnswers']);
      router.replace('/onboarding');
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to log out?')) {
        doLogOut();
      }
    } else {
      Alert.alert('Log out', 'Are you sure you want to log out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log out', style: 'destructive', onPress: doLogOut },
      ]);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.toLowerCase() !== 'yourname') return;
    if (!user) return;

    setIsDeleting(true);
    try {
      await deleteUserData(user.uid);
      await deleteAccount();
      await AsyncStorage.multiRemove(['hasCompletedOnboarding', 'userName', 'onboardingAnswers']);
      setShowDeleteModal(false);
      router.replace('/onboarding');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to delete account. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>profile</Text>
      </View>
      
      {/* Tabs */}
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.tab,
            { borderBottomColor: 'transparent' },
            activeTab === 'overview' && { borderBottomColor: colors.cardActive },
          ]}
          onPress={() => setActiveTab('overview')}
        >
          <Text
            style={[
              styles.tabText,
              { color: colors.textSecondary, textTransform: 'lowercase' },
              activeTab === 'overview' && { color: colors.cardActive },
            ]}
          >
            overview
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            { borderBottomColor: 'transparent' },
            activeTab === 'bookmarks' && { borderBottomColor: colors.cardActive },
          ]}
          onPress={() => setActiveTab('bookmarks')}
        >
          <Text
            style={[
              styles.tabText,
              { color: colors.textSecondary, textTransform: 'lowercase' },
              activeTab === 'bookmarks' && { color: colors.cardActive },
            ]}
          >
            bookmarks
          </Text>
        </TouchableOpacity>
      </View>
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshingBookmarks}
            onRefresh={handleRefreshBookmarks}
            tintColor={colors.text}
          />
        }
      >

        {activeTab === 'overview' && (
          <>
        {/* User Info Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.userInfo}>
            <View style={styles.nameSection}>
              {isEditingName ? (
                <View style={styles.editNameContainer}>
                  <TextInput
                    style={[styles.nameInput, { color: colors.text, borderColor: colors.border }]}
                    value={editedName}
                    onChangeText={setEditedName}
                    autoFocus
                    placeholderTextColor={colors.textSecondary}
                  />
                  <TouchableOpacity style={styles.saveButton} onPress={handleSaveName}>
                    <Text style={styles.saveButtonText}>save</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.nameDisplay}>
                  <Text style={[styles.userName, { color: colors.text }]}>{userName}</Text>
                  <TouchableOpacity onPress={() => setIsEditingName(true)}>
                    <Text style={[styles.editIcon, { color: colors.textSecondary }]}>✎</Text>
                  </TouchableOpacity>
                </View>
              )}
              <Text style={[styles.memberSince, { color: colors.textSecondary }]}>{memberSince}</Text>
            </View>
          </View>

          {/* Stats */}
          <View style={[styles.stats, { borderTopColor: dividerColor }]}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.text }]}>{storyCount}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>stories</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.text }]}>{bookmarkCount}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>bookmarks</Text>
            </View>
          </View>
        </View>

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>preferences</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.preference}>
              <View style={styles.preferenceLeft}>
                <Text style={[styles.preferenceLabel, { color: colors.text }]} >dark mode</Text>
              </View>
              <Switch
                value={theme === 'dark'}
                onValueChange={toggleTheme}
                trackColor={{ false: colors.border, true: colors.text }}
                thumbColor={colors.background}
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.preference}>
              <View style={styles.preferenceLeft}>
                <Text style={[styles.preferenceLabel, { color: colors.text }]} >notifications</Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationsToggle}
                trackColor={{ false: colors.border, true: colors.text }}
                thumbColor={colors.background}
              />
            </View>
          </View>
        </View>

        {/* Default theme color */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>artwork color</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              pick the default color for your story artwork
            </Text>
            <View style={styles.themeColorSwatches}>
              {THEME_COLOR_OPTIONS.map((color) => (
                <TouchableOpacity
                  key={color}
                  onPress={() => handleSelectThemeColor(color)}
                  style={[
                    styles.themeColorSwatch,
                    { backgroundColor: color },
                    defaultThemeColor === color && styles.themeColorSwatchSelected,
                  ]}
                />
              ))}
            </View>
          </View>
        </View>

        {/* Log Out */}
        <TouchableOpacity style={[styles.logoutButton, { borderColor: '#d4183d' }]} onPress={handleLogOut}>
          <Text style={styles.logoutText}>log out</Text>
        </TouchableOpacity>

        {/* Delete Account */}
        <TouchableOpacity 
          style={[styles.deleteAccountButton, { borderColor: colors.border }]} 
          onPress={() => setShowDeleteModal(true)}
        >
          <Text style={[styles.deleteAccountText, { color: colors.textSecondary }]}>delete account</Text>
        </TouchableOpacity>

        {/* Version */}
        <Text style={[styles.version, { color: colors.textSecondary }]}>yn v1.0.0</Text>
          </>
        )}
        
        {activeTab === 'bookmarks' && (
          <View style={styles.section}>
            {!user ? (
              <View style={styles.emptyState}>
                <IconSymbol name="bookmark" size={48} color={colors.textSecondary} />
                <Text style={[styles.emptyStateText, { color: colors.text }]}>sign in to see bookmarks</Text>
                <Text style={[styles.emptyStateSubtext, { color: colors.textSecondary }]}>your saved stories will appear here</Text>
              </View>
            ) : isLoadingBookmarks ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="large" color={colors.text} />
                <Text style={[styles.loadingText, { color: colors.textSecondary }]}>loading your bookmarks...</Text>
              </View>
            ) : bookmarkedStories.length === 0 ? (
              <View style={styles.emptyState}>
                <IconSymbol name="bookmark" size={48} color={colors.textSecondary} />
                <Text style={[styles.emptyStateText, { color: colors.text }]}>no bookmarks yet</Text>
                <Text style={[styles.emptyStateSubtext, { color: colors.textSecondary }]}>tap the bookmark icon on stories to add them here</Text>
              </View>
            ) : (
              <View style={styles.bookmarkGrid}>
                {Array.from({ length: Math.ceil(bookmarkedStories.length / bookmarkCols) }).map((_, rowIdx) => {
                  const rowStories = bookmarkedStories.slice(rowIdx * bookmarkCols, (rowIdx + 1) * bookmarkCols);
                  return (
                    <View key={rowIdx} style={styles.bookmarkRow}>
                      {rowStories.map((story) => (
                        <TouchableOpacity
                          key={story.id}
                          style={[styles.bookmarkTile, { width: TILE_WIDTH, height: TILE_WIDTH + 48 }]}
                          onPress={() => handleOpenBookmark(story)}
                          disabled={!story.audioUrl}
                          activeOpacity={0.8}
                        >
                          <View style={styles.bookmarkArtwork}>
                            <TopographicArtwork
                              baseColor={story.coverColor || DEFAULT_COVER_COLOR}
                              layers={story.topographyLayers}
                              size={TILE_WIDTH}
                            />
                          </View>
                          <View style={styles.bookmarkTitleWrap}>
                            <Text style={[styles.bookmarkTitle, { color: colors.text }]} numberOfLines={2}>
                              {story.title || 'untitled story'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                      {Array.from({ length: bookmarkCols - rowStories.length }).map((_, i) => (
                        <View key={`empty-${i}`} style={{ width: TILE_WIDTH, height: TILE_WIDTH + 48 }} />
                      ))}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Delete Account Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>delete account</Text>
            
            <View style={[styles.warningBox, { backgroundColor: 'rgba(212, 24, 61, 0.1)', borderColor: '#d4183d' }]}>
              <Text style={[styles.warningText, { color: '#d4183d' }]}>
                ⚠️ this action is permanent and cannot be undone
              </Text>
            </View>
            
            <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
              deleting your account will permanently remove all your data, including your stories and bookmarks. this cannot be recovered.
            </Text>
            
            <Text style={[styles.confirmLabel, { color: colors.text }]}>
              type "yourname" to confirm:
            </Text>
            
            <TextInput
              style={[styles.deleteInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="yourname"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.cancelButton, { borderColor: colors.border }]} 
                onPress={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                }}
              >
                <Text style={[styles.cancelButtonText, { color: colors.text }]}>cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[
                  styles.confirmDeleteButton, 
                  { backgroundColor: deleteConfirmText.toLowerCase() === 'yourname' ? '#d4183d' : colors.border }
                ]} 
                onPress={handleDeleteAccount}
                disabled={deleteConfirmText.toLowerCase() !== 'yourname' || isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmDeleteButtonText}>delete forever</Text>
                )}
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
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    padding: 16,
  },
  userInfo: {
    marginBottom: 16,
  },
    nameSection: {
    flex: 1,
    justifyContent: 'center',
  },
  nameDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#030213',
    fontFamily: 'EBGaramond-Medium',
  },
  editIcon: {
    fontSize: 16,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
  },
  editNameContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
  },
  saveButton: {
    backgroundColor: '#030213',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'EBGaramond-Medium',
  },
  memberSince: {
    fontSize: 12,
    color: '#717182',
    marginTop: 4,
    fontFamily: 'EBGaramond-Regular',
  },
  stats: {
    flexDirection: 'row',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '500',
    color: '#030213',
    fontFamily: 'EBGaramond-Medium',
  },
  statLabel: {
    fontSize: 12,
    color: '#717182',
    marginTop: 4,
    fontFamily: 'EBGaramond-Regular',
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#030213',
    marginBottom: 12,
    fontFamily: 'EBGaramond-Medium',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  tag: {
    backgroundColor: '#ececf0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 12,
    color: '#030213',
    fontFamily: 'EBGaramond-Regular',
  },
  addTagContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  tagInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
  },
  addButton: {
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addButtonText: {
    fontSize: 14,
    color: '#030213',
    fontFamily: 'EBGaramond-Regular',
  },
  helperText: {
    fontSize: 12,
    marginBottom: 12,
    fontFamily: 'EBGaramond-Regular',
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  colorPreview: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  colorInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
  },
  saveColorsButton: {
    marginTop: 4,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveColorsButtonText: {
    fontSize: 14,
    fontWeight: '500',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  preference: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  preferenceLeft: {
    flex: 1,
  },
  preferenceLabel: {
    fontSize: 14,
    color: '#030213',
    fontFamily: 'EBGaramond-Regular',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  logoutButton: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#d4183d',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  logoutText: {
    fontSize: 14,
    color: '#d4183d',
    fontWeight: '500',
    fontFamily: 'EBGaramond-Medium',
  },
  version: {
    marginTop: 20,
    fontSize: 12,
    color: '#717182',
    textAlign: 'center',
    fontFamily: 'EBGaramond-Regular',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E7',
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#030213',
  },
  tabText: {
    fontSize: 14,
    color: '#717182',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  tabTextActive: {
    color: '#030213',
    fontWeight: '500',
    fontFamily: 'EBGaramond-Medium',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#717182',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#030213',
    fontWeight: '500',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#717182',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  bookmarkGrid: {
    paddingHorizontal: SHELF_PADDING,
    gap: 16,
  },
  bookmarkRow: {
    flexDirection: 'row',
    gap: STORY_GAP,
  },
  bookmarkTile: {
    alignItems: 'center',
  },
  bookmarkArtwork: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  bookmarkTitleWrap: {
    height: 40,
    justifyContent: 'flex-start',
    paddingTop: 6,
    width: '100%',
  },
  bookmarkTitle: {
    fontSize: 13,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    textAlign: 'center',
  },
  themeColorSwatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  themeColorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  themeColorSwatchSelected: {
    borderColor: '#fff',
    ...createShadow('#000', 0, 2, 4, 0.3, 4),
  },
  deleteAccountButton: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  deleteAccountText: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'EBGaramond-Medium',
    marginBottom: 16,
    textAlign: 'center',
  },
  warningBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  warningText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'EBGaramond-Medium',
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    lineHeight: 20,
    marginBottom: 20,
  },
  confirmLabel: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Medium',
    marginBottom: 8,
  },
  deleteInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'EBGaramond-Regular',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'EBGaramond-Medium',
  },
  confirmDeleteButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmDeleteButtonText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'EBGaramond-Medium',
    color: '#fff',
  },
});
