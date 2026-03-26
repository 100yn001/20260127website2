import TopographicArtwork, { generateDepthLayers } from '@/components/TopographicArtwork';
import { Button } from '@/components/ui/button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { auth, db } from '@/config/firebase';
import { DEFAULT_COVER_COLOR, THEME_COLOR_OPTIONS } from '@/constants/cover-colors';
import { useAudioPlayer } from '@/contexts/AudioPlayerContext';
import { useStoryQueue } from '@/contexts/StoryQueueContext';
import { useTheme } from '@/contexts/ThemeContext';
import { addPublicStory } from '@/services/public-story-service';
import { buildShareUrl, shareStoryAudio } from '@/services/shared-audio-service';
import { addBookmark, getBookmarkedStoryIds, removeBookmark } from '@/services/user-service';
import { DepthLayer } from '@/types/story';
import { createShadow } from '@/utils/shadow';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActionSheetIOS,
    ActivityIndicator,
    Alert,
    Clipboard,
    DeviceEventEmitter,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';

export default function PlayerScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { addToQueue } = useStoryQueue();
  const { colors } = useTheme();
  const { width: vw } = useWindowDimensions();
  const SCREEN_WIDTH = Platform.OS === 'web' ? Math.min(vw, 600) : vw;
  const {
    currentTrack,
    isPlaying,
    isLoading: isAudioLoading,
    position,
    duration,
    loadTrack,
    togglePlayPause,
    pause,
    seek,
    skipForward,
    skipBackward,
    stop,
    isAudioReady,
    debugInfo,
  } = useAudioPlayer();
  const [showTranscript, setShowTranscript] = useState(false);
  const initialTitle = typeof params.title === 'string' && params.title !== 'undefined' ? params.title : '';
  const initialDescription =
    typeof params.description === 'string' && params.description !== 'undefined'
      ? params.description
      : typeof params.prompt === 'string' && params.prompt !== 'undefined'
        ? params.prompt
        : '';
  const [storyTitle, setStoryTitle] = useState<string>(initialTitle);
  const [isLoadingTitle, setIsLoadingTitle] = useState<boolean>(!!params.storyId);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [isStoryBookmarked, setIsStoryBookmarked] = useState(false);
  const [isBookmarking, setIsBookmarking] = useState(false);
  const [isPublishingPublicStory, setIsPublishingPublicStory] = useState(false);
  const [defaultThemeColor, setDefaultThemeColor] = useState<string>(DEFAULT_COVER_COLOR);
  // Initialize from params if provided (from library navigation)
  const paramCoverColor = typeof params.coverColor === 'string' && params.coverColor ? params.coverColor : null;
  const paramTopographyLayers = (() => {
    try {
      if (typeof params.topographyLayers === 'string' && params.topographyLayers) {
        return JSON.parse(params.topographyLayers) as DepthLayer[];
      }
    } catch { /* ignore parse errors */ }
    return null;
  })();
  const [coverColor, setCoverColor] = useState<string>(paramCoverColor || DEFAULT_COVER_COLOR);
  const [topographyLayers, setTopographyLayers] = useState<DepthLayer[] | undefined>(paramTopographyLayers || undefined);
  const [storyDescription, setStoryDescription] = useState<string>(initialDescription);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editingDescriptionValue, setEditingDescriptionValue] = useState('');
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const showDetailsParam = params.showDetails === 'true';
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(showDetailsParam);
  const [isEditingArtwork, setIsEditingArtwork] = useState(false);
  const [artworkPreviewColor, setArtworkPreviewColor] = useState<string>(coverColor || DEFAULT_COVER_COLOR);
  const [artworkPreviewLayers, setArtworkPreviewLayers] = useState<DepthLayer[] | undefined>(undefined);
  const [colorInputValue, setColorInputValue] = useState<string>(coverColor || DEFAULT_COVER_COLOR);
  const [isSavingArtwork, setIsSavingArtwork] = useState(false);
  const [isArtworkExpanded, setIsArtworkExpanded] = useState(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [regenerationNotes, setRegenerationNotes] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isSinking, setIsSinking] = useState(false);
  const [sinkCopied, setSinkCopied] = useState(false);
  const [narrators, setNarrators] = useState<Array<{ id: string; name: string; voiceId: string }>>([]);
  const [selectedNarratorId, setSelectedNarratorId] = useState<string | undefined>(undefined);
  const [isLoadingNarrators, setIsLoadingNarrators] = useState(false);
  const progressSaveInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTitleTapRef = useRef<number | null>(null);
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  const isSlidingRef = useRef(false);
  const slidingValueRef = useRef(0);
  const [slidingPosition, setSlidingPosition] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      return () => setIsScreenFocused(false);
    }, [])
  );

  // Safe exit handler — goes back to previous screen and keeps audio playing (mini player mode)
  const handleMinimize = useCallback(() => {
    try {
      // Clear progress interval before navigating
      if (progressSaveInterval.current) {
        clearInterval(progressSaveInterval.current);
        progressSaveInterval.current = null;
      }
    } catch { /* ignore */ }
    try {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/mystories');
      }
    } catch (e) {
      console.warn('Navigation error:', e);
      try { router.replace('/'); } catch { /* last resort */ }
    }
  }, [router]);

  const storyId = params.storyId as string | undefined;
  const publicStoryId = params.publicStoryId as string | undefined;
  const effectiveStoryId = storyId || publicStoryId;
  const audioUrlParam = params.audioUrl as string;
  const [audioChunkURLs, setAudioChunkURLs] = useState<string[]>(() => {
    try {
      if (typeof params.audioChunkURLs === 'string' && params.audioChunkURLs) {
        return JSON.parse(params.audioChunkURLs);
      }
    } catch { /* ignore */ }
    return [];
  });
  const hasDescription = storyDescription.trim().length > 0;
  const descriptionDisplayText = hasDescription ? storyDescription : 'no description yet';
  const coverStorageKey = storyId || publicStoryId || audioUrlParam;
  const resolveAudioUrl = (url?: string) => {
    if (!url) return '';
    // If URL already starts with https://, it's already decoded - use as-is
    if (url.startsWith('https://')) {
      return url;
    }
    // If URL is encoded (starts with https%3A), decode it
    if (url.startsWith('https%3A') || url.includes('%2F')) {
      try {
        return decodeURIComponent(url);
      } catch (error) {
        console.warn('Failed to decode audio URL, using original', error);
        return url;
      }
    }
    return url;
  };

  const durationLabel = () => {
    if (typeof params.duration === 'string' && params.duration.trim().length > 0) {
      return params.duration;
    }
    if (duration) {
      const minutes = Math.max(1, Math.round(duration / 60000));
      return `${minutes} min`;
    }
    return '10 min';
  };

  const resolveIsNighttime = () => {
    if (typeof params.isNighttime === 'string') {
      return params.isNighttime.toLowerCase() === 'true';
    }
    if (typeof params.isNighttime === 'boolean') {
      return params.isNighttime;
    }
    return false;
  };

  const promptForLibraryCategory = (
    suggested: 'daytime' | 'nighttime'
  ): Promise<'daytime' | 'nighttime' | null> => {
    return new Promise((resolve) => {
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: 'add to static library',
            message: `choose where this story should appear (suggested: ${suggested})`,
            options: ['daytime', 'nighttime', 'cancel'],
            cancelButtonIndex: 2,
          },
          (buttonIndex) => {
            if (buttonIndex === 0) resolve('daytime');
            else if (buttonIndex === 1) resolve('nighttime');
            else resolve(null);
          }
        );
      } else {
        Alert.alert(
          'add to static library',
          `choose where this story should appear (suggested: ${suggested})`,
          [
            { text: 'daytime', onPress: () => resolve('daytime') },
            { text: 'nighttime', onPress: () => resolve('nighttime') },
            { text: 'cancel', style: 'cancel', onPress: () => resolve(null) },
          ],
          { cancelable: true, onDismiss: () => resolve(null) }
        );
      }
    });
  };

  const isAdminUser = ['ellepotterhead2006@gmail.com', 'madxwoods@gmail.com'].includes(auth.currentUser?.email || '');

  const handlePublishPublicStory = async () => {
    if (isPublishingPublicStory) return;
    if (!audioUrl) {
      Alert.alert('Missing audio', 'Cannot publish without an audio file.');
      return;
    }
    if (!transcript) {
      Alert.alert('Missing transcript', 'Cannot publish without a transcript.');
      return;
    }
    const suggestedCategory = resolveIsNighttime() ? 'nighttime' : 'daytime';
    const libraryCategory = await promptForLibraryCategory(suggestedCategory);
    if (!libraryCategory) {
      return;
    }

    setIsPublishingPublicStory(true);
    try {
      await addPublicStory({
        title: displayedTitle,
        genre:
          (typeof params.genre === 'string' && params.genre.length > 0
            ? params.genre
            : typeof params.setting === 'string' && params.setting.length > 0
              ? params.setting
              : 'story'),
        isNighttime: libraryCategory === 'nighttime',
        duration: durationLabel(),
        audioUrl,
        transcript,
        narratorId: typeof params.narratorId === 'string' ? params.narratorId : undefined,
        libraryCategory,
        coverColor,
        topographyLayers,
      });
      Alert.alert('Published', 'Story added to the public library.');
    } catch (error) {
      console.error('Error publishing public story:', error);
      Alert.alert('Publish failed', 'Unable to add this story to the public library.');
    } finally {
      setIsPublishingPublicStory(false);
    }
  };
  const rawAudioUrl = resolveAudioUrl(audioUrlParam);
  // Fall back to first chunk URL if audioUrl is empty but chunks exist
  const audioUrl = rawAudioUrl || (audioChunkURLs.length > 0 ? audioChunkURLs[0] : '');
  const transcript = params.transcript as string;
  const narratorId = typeof params.narratorId === 'string' ? params.narratorId : undefined;

  const baseRecipeData = {
    userName: typeof params.userName === 'string' ? params.userName : 'you',
    setting: typeof params.setting === 'string' ? params.setting : '',
    location: typeof params.location === 'string' ? params.location : '',
    character: typeof params.character === 'string' ? params.character : '',
    genderSelf: typeof params.genderSelf === 'string' ? params.genderSelf : '',
    genderOther: typeof params.genderOther === 'string' ? params.genderOther : '',
    trope: typeof params.trope === 'string' ? params.trope : '',
    features: params.features ? JSON.parse(params.features as string) : [],
    featurePreferences: params.featurePreferences ? JSON.parse(params.featurePreferences as string) : {},
    isNighttime: resolveIsNighttime(),
    duration: typeof params.duration === 'string' ? params.duration : '10min',
    narrativeRatio: params.narrativeRatio ? parseInt(params.narrativeRatio as string, 10) : 5,
    narratorId,
    prompt: storyDescription,
    coverColor,
    tags: Array.isArray(params.tags) ? params.tags : undefined,
  };
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadBookmarkState = async () => {
      const user = auth.currentUser;
      if (!user || !effectiveStoryId) {
        setIsStoryBookmarked(false);
        return;
      }
      try {
        const bookmarkedIds = await getBookmarkedStoryIds(user.uid);
        if (isMounted) {
          setIsStoryBookmarked(bookmarkedIds.includes(effectiveStoryId));
        }
      } catch (error) {
        console.error('Error loading bookmark state:', error);
      }
    };
    loadBookmarkState();
    return () => {
      isMounted = false;
    };
  }, [effectiveStoryId]);

  useEffect(() => {
    setStoryTitle(initialTitle);
    setStoryDescription(initialDescription);
  }, [initialTitle, initialDescription]);

  useEffect(() => {
    if (coverColor) {
      setColorInputValue(coverColor);
      setArtworkPreviewColor(coverColor);
    }
    if (topographyLayers && topographyLayers.length > 0) {
      setArtworkPreviewLayers(topographyLayers);
    } else {
      setArtworkPreviewLayers(generateDepthLayers(12));
    }
  }, [coverColor, topographyLayers]);

  useEffect(() => {
    if (colorInputValue) {
      setArtworkPreviewColor(colorInputValue);
    }
  }, [colorInputValue]);

  const handleArtworkLongPress = () => {
    if (!storyId) {
      return;
    }
    const currentColor = coverColor || defaultThemeColor;
    setArtworkPreviewColor(currentColor);
    setArtworkPreviewLayers(topographyLayers && topographyLayers.length > 0 ? topographyLayers : generateDepthLayers(5));
    setColorInputValue(currentColor);
    setIsEditingArtwork(true);
  };

  const handleArtworkTap = () => {
    if (!storyId) return;
    if (isEditingArtwork) {
      // When already in edit mode, tap to expand
      setIsArtworkExpanded(true);
    }
  };

  const handleCloseExpandedArtwork = () => {
    setIsArtworkExpanded(false);
  };

  const handleRegenerateArtwork = () => {
    // Keep the currently selected color, only regenerate the topography layers
    setArtworkPreviewLayers(generateDepthLayers(5));
  };

  const handleSaveArtwork = async () => {
    if (!storyId) return;
    const trimmedColor = colorInputValue?.trim();
    if (!trimmedColor) {
      Alert.alert('Invalid color', 'Please enter a valid color.');
      return;
    }
    const finalLayers = artworkPreviewLayers || generateDepthLayers(5);
    setIsSavingArtwork(true);
    try {
      await updateDoc(doc(db, 'stories', storyId), {
        coverColor: trimmedColor,
        topographyLayers: finalLayers,
      });
      setCoverColor(trimmedColor);
      setTopographyLayers(finalLayers);
      if (coverStorageKey) {
        const stored = await AsyncStorage.getItem('storyCoverColors');
        const mapping: Record<string, string> = stored ? JSON.parse(stored) : {};
        mapping[coverStorageKey] = trimmedColor;
        await AsyncStorage.setItem('storyCoverColors', JSON.stringify(mapping));
      }
      setIsEditingArtwork(false);
    } catch (error) {
      console.error('Error saving artwork:', error);
      Alert.alert('Save failed', 'Unable to update artwork. Please try again.');
    } finally {
      setIsSavingArtwork(false);
    }
  };

  useEffect(() => {
    if (!storyId) {
      setIsLoadingTitle(false);
      return;
    }

    let isMounted = true;

    const fetchStoryData = async () => {
      setIsLoadingTitle(true);
      try {
        const storySnap = await getDoc(doc(db, 'stories', storyId));
        if (storySnap.exists() && isMounted) {
          const data = storySnap.data();
          setStoryTitle(typeof data.title === 'string' ? data.title : '');
          const descriptionField =
            typeof data.description === 'string' && data.description.trim().length > 0
              ? data.description
              : typeof data.prompt === 'string'
                ? data.prompt
                : '';
          if (descriptionField) {
            setStoryDescription(descriptionField);
          }
          // Load cover color and topography from Firestore ONLY if not provided via params
          if (data.coverColor && !paramCoverColor) {
            setCoverColor(data.coverColor);
          }
          if (data.topographyLayers && Array.isArray(data.topographyLayers) && !paramTopographyLayers) {
            setTopographyLayers(data.topographyLayers);
          }
          if (data.audioChunkURLs && Array.isArray(data.audioChunkURLs) && data.audioChunkURLs.length > 0) {
            setAudioChunkURLs(prev => prev.length > 0 ? prev : data.audioChunkURLs);
          }
        }
      } catch (error) {
        console.error('Error loading story data:', error);
      } finally {
        if (isMounted) {
          setIsLoadingTitle(false);
        }
      }
    };

    fetchStoryData();

    return () => {
      isMounted = false;
    };
  }, [storyId]);

  // Load artwork data for public stories
  useEffect(() => {
    if (!publicStoryId || storyId) return; // Skip if no public story or if it's a user story
    
    let isMounted = true;

    const fetchPublicStoryData = async () => {
      try {
        const storySnap = await getDoc(doc(db, 'publicStories', publicStoryId));
        if (storySnap.exists() && isMounted) {
          const data = storySnap.data();
          const descriptionField =
            typeof data.description === 'string' && data.description.trim().length > 0
              ? data.description
              : typeof data.prompt === 'string'
                ? data.prompt
                : '';
          if (descriptionField) {
            setStoryDescription(descriptionField);
          }
          // Only load from Firestore if NOT provided via params
          if (data.coverColor && !paramCoverColor) {
            setCoverColor(data.coverColor);
          }
          if (data.topographyLayers && Array.isArray(data.topographyLayers) && !paramTopographyLayers) {
            setTopographyLayers(data.topographyLayers);
          }
        }
      } catch (error) {
        console.error('Error loading public story artwork data:', error);
      }
    };

    fetchPublicStoryData();

    return () => {
      isMounted = false;
    };
  }, [publicStoryId, storyId]);

  // Composite key: "url|chunkCount" — prevents double-load while allowing chunk upgrades
  const audioLoadedKeyRef = useRef<string | null>(null);
  
  // Get artwork values directly from params for use in loadTrack
  const artworkColorForLoad = paramCoverColor || coverColor || DEFAULT_COVER_COLOR;
  const artworkLayersForLoad = paramTopographyLayers || topographyLayers;
  
  useEffect(() => {
    // Skip if we already started loading for this audioUrl (don't re-load for chunk count changes)
    if (audioLoadedKeyRef.current !== null && audioLoadedKeyRef.current.startsWith(`${audioUrl}|`)) {
      return;
    }

    if (!audioUrl || audioUrl === 'undefined' || !audioUrl.startsWith('https://')) {
      if (audioUrl && audioUrl !== 'undefined') {
        setLoadError('Invalid audio URL format');
      }
      return;
    }

    let stale = false;
    const loadKey = `${audioUrl}|loading`;
    audioLoadedKeyRef.current = loadKey;

    const loadAudio = async () => {
      try {
        if (stale) return;

        // Use chunks from params; if empty and we have a storyId, fetch from Firestore
        let chunks = audioChunkURLs;
        if (chunks.length === 0 && storyId) {
          try {
            const snap = await getDoc(doc(db, 'stories', storyId));
            if (snap.exists()) {
              const data = snap.data();
              if (data.audioChunkURLs && Array.isArray(data.audioChunkURLs) && data.audioChunkURLs.length > 0) {
                chunks = data.audioChunkURLs;
              }
            }
          } catch { /* proceed with single URL */ }
        }
        if (stale) return;

        const hasChunks = chunks.length > 0;
        await loadTrack({
          id: effectiveStoryId || undefined,
          title: storyTitle || 'your story',
          subtitle: narratorId ? `narrator: ${narratorId}` : undefined,
          audioUrl: audioUrl,
          audioChunkURLs: hasChunks ? chunks : undefined,
          transcript: transcript,
          coverColor: artworkColorForLoad,
          topographyLayers: artworkLayersForLoad,
        }, true);

        audioLoadedKeyRef.current = `${audioUrl}|${chunks.length}`;
      } catch (error) {
        if (stale) return;
        audioLoadedKeyRef.current = null;
        setLoadError(error instanceof Error ? error.message : 'Failed to load audio');
      }
    };

    loadAudio();

    // Set up periodic progress saving
    progressSaveInterval.current = setInterval(() => {
      saveProgress();
    }, 5000);

    return () => {
      stale = true;
      if (progressSaveInterval.current) {
        clearInterval(progressSaveInterval.current);
      }
      saveProgress();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  
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

  useEffect(() => {
    // Skip if color was provided via params - don't override it
    if (paramCoverColor) {
      return;
    }
    
    const assignCoverColor = async () => {
      const coverKey = storyId || publicStoryId || audioUrlParam;
      if (!coverKey) {
        setCoverColor(defaultThemeColor);
        return;
      }
      try {
        const stored = await AsyncStorage.getItem('storyCoverColors');
        const mapping: Record<string, string> = stored ? JSON.parse(stored) : {};
        if (mapping[coverKey]) {
          setCoverColor(mapping[coverKey]);
          return;
        }
        // Use default theme color for new stories
        mapping[coverKey] = defaultThemeColor;
        await AsyncStorage.setItem('storyCoverColors', JSON.stringify(mapping));
        setCoverColor(defaultThemeColor);
      } catch (error) {
        console.warn('Failed to assign cover color, falling back to default', error);
        setCoverColor(defaultThemeColor);
      }
    };
    assignCoverColor();
  }, [defaultThemeColor, storyId, publicStoryId, audioUrlParam, paramCoverColor]);


  const saveProgress = async () => {
    if (!effectiveStoryId || !duration || position === 0) return;
    
    const user = auth.currentUser;
    if (!user) return;
    
    try {
      const progressKey = `listeningProgress_${user.uid}`;
      const existingData = await AsyncStorage.getItem(progressKey);
      const progress = existingData ? JSON.parse(existingData) : {};
      
      progress[effectiveStoryId] = {
        position: Math.floor(position / 1000), // Convert to seconds
        duration: Math.floor(duration / 1000),
        lastPlayed: new Date().toISOString(),
        isPublic: Boolean(publicStoryId && !storyId),
      };
      
      await AsyncStorage.setItem(progressKey, JSON.stringify(progress));
    } catch (error) {
      console.error('Error saving progress:', error);
    }
  };

  const onSliderSlidingStart = () => {
    isSlidingRef.current = true;
  };

  const onSliderValueChange = (value: number) => {
    slidingValueRef.current = value;
    setSlidingPosition(value);
  };

  const onSliderSlidingComplete = async (value: number) => {
    await seek(value);
    // Small delay before releasing so the context position catches up
    setTimeout(() => {
      isSlidingRef.current = false;
      setSlidingPosition(null);
    }, 200);
  };

  const handleSkipBackward = async () => {
    await skipBackward(15);
  };

  const handleSkipForward = async () => {
    await skipForward(15);
  };

  const handleSinkIt = async () => {
    if (isSinking) return;
    const user = auth.currentUser;
    if (!user) {
      Alert.alert('sign in required', 'please sign in to synk stories.');
      return;
    }
    if (!audioUrl) {
      Alert.alert('no audio', 'cannot synk a story without audio.');
      return;
    }

    setIsSinking(true);
    try {
      const storyData = {
        id: effectiveStoryId || '',
        userId: user.uid,
        title: displayedTitle,
        audioUrl,
        audioChunkURLs,
        transcript: transcript || '',
        setting: typeof params.setting === 'string' ? params.setting : '',
        location: typeof params.location === 'string' ? params.location : '',
        character: typeof params.character === 'string' ? params.character : '',
        genderSelf: typeof params.genderSelf === 'string' ? params.genderSelf : '',
        genderOther: typeof params.genderOther === 'string' ? params.genderOther : '',
        trope: typeof params.trope === 'string' ? params.trope : '',
        isNighttime: resolveIsNighttime(),
        duration: (typeof params.duration === 'string' ? params.duration : '10min') as '5min' | '10min' | '15min',
        narrativeRatio: params.narrativeRatio ? parseInt(params.narrativeRatio as string, 10) : 5,
        narratorId,
        createdAt: new Date(),
        coverColor,
      };

      const sharedId = await shareStoryAudio(user.uid, storyData);
      const url = buildShareUrl(sharedId);

      // Open the link automatically on web, copy on native
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        Clipboard.setString(url);
      }
      setSinkCopied(true);
      setTimeout(() => setSinkCopied(false), 3000);
    } catch (error) {
      console.error('Error sinking story:', error);
      Alert.alert('synk failed', 'unable to create a synk link. please try again.');
    } finally {
      setIsSinking(false);
    }
  };

  const handleOpenRegenerate = async () => {
    setRegenerationNotes('');
    setSelectedNarratorId(narratorId);
    setShowRegenerateModal(true);
    
    // Load narrators
    const user = auth.currentUser;
    if (!user) return;
    
    setIsLoadingNarrators(true);
    try {
      const narratorsRef = collection(db, 'users', user.uid, 'narrators');
      const unsubscribe = onSnapshot(narratorsRef, (snapshot) => {
        const narratorsList = snapshot.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name || 'Unnamed',
          voiceId: doc.data().voiceId || '',
        }));
        setNarrators(narratorsList);
        setIsLoadingNarrators(false);
      });
      // Store unsubscribe for cleanup - will be called when modal closes
      return unsubscribe;
    } catch (error) {
      console.error('Error loading narrators:', error);
      setIsLoadingNarrators(false);
    }
  };

  const handleSubmitRegeneration = async () => {
    if (!transcript?.trim()) {
      Alert.alert('missing transcript', 'cannot regenerate without a transcript.');
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      Alert.alert('sign in required', 'please sign in to regenerate stories.');
      return;
    }

    setIsRegenerating(true);
    try {
      const recipeData = {
        ...baseRecipeData,
        prompt: `${storyDescription}\n\nchanges requested:\n${regenerationNotes.trim()}`,
        transcript,
        narratorId: selectedNarratorId || narratorId,
      };
      await addToQueue(recipeData, [], [regenerationNotes.trim()]);
      setShowRegenerateModal(false);
      Alert.alert('queued', 'your updated story will appear in my stories once ready.');
    } catch (error) {
      console.error('Error queuing regeneration:', error);
      Alert.alert('regeneration failed', 'unable to regenerate this story. please try again later.');
    } finally {
      setIsRegenerating(false);
    }
  };

  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const canEditTitle = Boolean(storyId);

  const beginEditingTitle = () => {
    if (!canEditTitle || isEditingTitle) return;
    setEditingTitleValue(storyTitle);
    setIsEditingTitle(true);
  };

  const handleTitleTap = () => {
    if (!canEditTitle || isEditingTitle) return;
    const now = Date.now();
    if (lastTitleTapRef.current && now - lastTitleTapRef.current < 300) {
      beginEditingTitle();
      lastTitleTapRef.current = null;
    } else {
      lastTitleTapRef.current = now;
    }
  };

  const handleTitleLongPress = () => {
    if (!canEditTitle) return;
    lastTitleTapRef.current = null;
    beginEditingTitle();
  };

  const handleCancelEditTitle = () => {
    setIsEditingTitle(false);
    setEditingTitleValue('');
    lastTitleTapRef.current = null;
  };

  const handleSaveTitleChange = async () => {
    if (!storyId || isSavingTitle) return;
    const trimmed = editingTitleValue.trim();
    setIsSavingTitle(true);
    try {
      await updateDoc(doc(db, 'stories', storyId), { title: trimmed || null });
      setStoryTitle(trimmed);
      setIsEditingTitle(false);
      setEditingTitleValue('');
    } catch (error) {
      console.error('Error updating story title:', error);
      alert('Failed to update title. Please try again.');
    } finally {
      setIsSavingTitle(false);
    }
  };

  const displayedTitle =
    storyTitle && storyTitle.length > 0
      ? storyTitle
      : typeof params.title === 'string' && params.title !== 'undefined'
        ? params.title
        : 'your story';

  const handleBookmarkPress = async () => {
    if (isBookmarking || !effectiveStoryId) return;
    const user = auth.currentUser;
    if (!user) {
      alert('Please sign in to save bookmarks.');
      return;
    }
    setIsBookmarking(true);
    try {
      if (isStoryBookmarked) {
        await removeBookmark(user.uid, effectiveStoryId);
        setIsStoryBookmarked(false);
        DeviceEventEmitter.emit('bookmarkChanged', { storyId: effectiveStoryId, isBookmarked: false });
      } else {
        await addBookmark(user.uid, effectiveStoryId);
        setIsStoryBookmarked(true);
        DeviceEventEmitter.emit('bookmarkChanged', { storyId: effectiveStoryId, isBookmarked: true });
      }
    } catch (error) {
      console.error('Error bookmarking story:', error);
      alert('Failed to update bookmark. Please try again.');
    } finally {
      setIsBookmarking(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleMinimize} style={styles.minimizeButton}>
          <IconSymbol name="chevron.down" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">now playing</Text>
        <View style={styles.headerActions}>
          {isAdminUser && (
            <TouchableOpacity
              onPress={handlePublishPublicStory}
              disabled={isPublishingPublicStory}
              style={styles.headerActionButton}
            >
              {isPublishingPublicStory ? (
                <ActivityIndicator size="small" color="#0A84FF" />
              ) : (
                <IconSymbol name="checkmark.circle.fill" size={24} color="#0A84FF" />
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setShowTranscript(!showTranscript)}>
            <IconSymbol name={showTranscript ? 'text.bubble.fill' : 'text.bubble'} size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {loadError ? (
        <View style={styles.errorContainer}>
          <IconSymbol name="exclamationmark.triangle" size={48} color="#ef4444" />
          <Text style={[styles.errorTitle, { color: colors.text }]}>Unable to load audio</Text>
          <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>{loadError}</Text>
          <TouchableOpacity style={[styles.errorButton, { backgroundColor: colors.buttonBackground }]} onPress={handleMinimize}>
            <Text style={[styles.errorButtonText, { color: colors.buttonText }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : showTranscript ? (
        <ScrollView style={styles.transcriptContainer} contentContainerStyle={styles.transcriptContent}>
          <Text style={[styles.transcriptTitle, { color: colors.text }]}>Transcript</Text>
          <Text style={[styles.transcriptText, { color: colors.text }]}>{transcript}</Text>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.playerScroll}
          contentContainerStyle={styles.playerContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Artwork/Visual - Topographic Design */}
          <TouchableOpacity
            style={styles.artworkContainer}
            onLongPress={handleArtworkLongPress}
            onPress={handleArtworkTap}
            activeOpacity={1}
            disabled={!storyId}
            delayLongPress={300}
            delayPressIn={0}
          >
            <TopographicArtwork
              baseColor={isEditingArtwork ? artworkPreviewColor : (coverColor || '#7f1d1d')}
              layers={isEditingArtwork ? artworkPreviewLayers : topographyLayers}
              size={SCREEN_WIDTH - 48}
            />
            {/* Inline editing controls */}
            {isEditingArtwork && storyId && (
              <>
                {/* Regenerate button - top left */}
                <TouchableOpacity
                  style={styles.artworkEditRegenerate}
                  onPress={handleRegenerateArtwork}
                >
                  <IconSymbol name="arrow.triangle.2.circlepath" size={22} color="#fff" />
                </TouchableOpacity>

                {/* Color circle - center */}
                <View style={styles.artworkColorCircleContainer}>
                  <View style={[styles.artworkColorCircle, { backgroundColor: artworkPreviewColor }]} />
                  <View style={styles.artworkColorSwatches}>
                    {THEME_COLOR_OPTIONS.map((swatchColor) => (
                      <TouchableOpacity
                        key={swatchColor}
                        onPress={() => {
                          setColorInputValue(swatchColor);
                          setArtworkPreviewColor(swatchColor);
                        }}
                        style={[
                          styles.artworkMiniSwatch,
                          { backgroundColor: swatchColor },
                          colorInputValue === swatchColor && styles.artworkMiniSwatchSelected,
                        ]}
                      />
                    ))}
                  </View>
                </View>

                {/* Cancel button - bottom left */}
                <TouchableOpacity
                  style={styles.artworkEditCancel}
                  onPress={() => setIsEditingArtwork(false)}
                >
                  <IconSymbol name="xmark" size={16} color="#fff" />
                  <Text style={styles.artworkEditButtonText}>cancel</Text>
                </TouchableOpacity>

                {/* Save button - bottom right */}
                <TouchableOpacity
                  style={styles.artworkEditSave}
                  onPress={handleSaveArtwork}
                  disabled={isSavingArtwork}
                >
                  {isSavingArtwork ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <IconSymbol name="checkmark" size={16} color="#fff" />
                      <Text style={styles.artworkEditButtonText}>save</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>

          {/* Recipe Info */}
          <View style={styles.infoContainer}>
            <View style={styles.titleWrapper}>
              {isEditingTitle ? (
                <View style={styles.titleEditContainer}>
                  <TextInput
                    style={[styles.titleInput, { borderBottomColor: colors.text, color: colors.text }]}
                    value={editingTitleValue}
                    onChangeText={setEditingTitleValue}
                    placeholder="enter title"
                    placeholderTextColor={colors.textSecondary}
                    autoFocus
                    editable={!isSavingTitle}
                    returnKeyType="done"
                    onSubmitEditing={handleSaveTitleChange}
                  />
                  <View style={styles.titleActions}>
                    <TouchableOpacity onPress={handleSaveTitleChange} disabled={isSavingTitle}>
                      <Text style={[styles.titleActionText, { color: colors.text }, isSavingTitle && styles.titleActionDisabled]}>
                        {isSavingTitle ? 'saving...' : 'save'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleCancelEditTitle} disabled={isSavingTitle}>
                      <Text style={[styles.titleActionText, styles.titleActionCancel]}>cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  activeOpacity={canEditTitle ? 0.7 : 1}
                  onPress={handleTitleTap}
                  onLongPress={handleTitleLongPress}
                  disabled={!canEditTitle}
                >
                  <View style={styles.titleDisplayRow}>
                    <Text style={[styles.storyTitle, { color: colors.text }]} numberOfLines={2} ellipsizeMode="tail">
                      {displayedTitle}
                    </Text>
                    {canEditTitle && isLoadingTitle && (
                      <ActivityIndicator size="small" color={colors.textSecondary} />
                    )}
                  </View>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.tags}>
              {params.setting && <View style={[styles.tag, { backgroundColor: colors.card }]}><Text style={[styles.tagText, { color: colors.text }]}>{params.setting}</Text></View>}
              {params.location && <View style={[styles.tag, { backgroundColor: colors.card }]}><Text style={[styles.tagText, { color: colors.text }]}>{params.location}</Text></View>}
              {params.character && <View style={[styles.tag, { backgroundColor: colors.card }]}><Text style={[styles.tagText, { color: colors.text }]}>{params.character}</Text></View>}
            </View>
          </View>

          {/* Progress Slider */}
          <View style={styles.progressContainer}>
            {isScreenFocused ? (
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={Math.max(duration, 1)}
                value={slidingPosition != null ? slidingPosition : Math.min(position, Math.max(duration, 1))}
                onSlidingStart={onSliderSlidingStart}
                onValueChange={onSliderValueChange}
                onSlidingComplete={onSliderSlidingComplete}
                minimumTrackTintColor={colors.text}
                maximumTrackTintColor={colors.border}
                thumbTintColor={colors.text}
              />
            ) : (
              <View style={styles.slider} />
            )}
            <View style={styles.timeContainer}>
              <Text style={[styles.timeText, { color: colors.textSecondary }]}>
                {duration > 0 ? formatTime(slidingPosition != null ? slidingPosition : position) : '-:--'}
              </Text>
              <Text style={[styles.timeText, { color: colors.textSecondary }]}>
                {duration > 0 ? formatTime(duration) : '-:--'}
              </Text>
            </View>
          </View>

          {/* Controls */}
          <View style={styles.controls}>
            <TouchableOpacity onPress={handleSkipBackward} style={styles.controlButton}>
              <IconSymbol name="gobackward.15" size={32} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity onPress={togglePlayPause} style={styles.playButton}>
              <IconSymbol
                name={isPlaying ? 'pause.fill' : 'play.fill'}
                size={56}
                color={colors.text}
              />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSkipForward} style={styles.controlButton}>
              <IconSymbol name="goforward.15" size={32} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Details button */}
          <TouchableOpacity
            onPress={() => setIsDescriptionExpanded(prev => !prev)}
            style={[styles.detailsButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <IconSymbol name={isDescriptionExpanded ? 'chevron.up' : 'info.circle'} size={18} color={colors.text} />
            <Text style={[styles.detailsButtonText, { color: colors.text }]}>
              {isDescriptionExpanded ? 'hide details' : 'view details'}
            </Text>
          </TouchableOpacity>

          {isDescriptionExpanded && (
            <>
              <View style={styles.descriptionSection}>
                <View style={styles.descriptionHeader}>
                  <Text style={[styles.descriptionLabel, { color: colors.textSecondary }]}>description</Text>
                  {storyId && !isEditingDescription && (
                    <TouchableOpacity onPress={() => {
                      setEditingDescriptionValue(storyDescription);
                      setIsEditingDescription(true);
                    }}>
                      <Text style={[styles.editLink, { color: '#007AFF' }]}>edit</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {isEditingDescription ? (
                  <View style={styles.editDescriptionContainer}>
                    <TextInput
                      style={[styles.descriptionInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
                      value={editingDescriptionValue}
                      onChangeText={setEditingDescriptionValue}
                      placeholder="add a description..."
                      placeholderTextColor={colors.textSecondary}
                      multiline
                      numberOfLines={4}
                      editable={!isSavingDescription}
                    />
                    <View style={styles.editDescriptionActions}>
                      <TouchableOpacity 
                        onPress={() => setIsEditingDescription(false)} 
                        disabled={isSavingDescription}
                      >
                        <Text style={[styles.editActionText, { color: colors.textSecondary }]}>cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={async () => {
                          if (!storyId || isSavingDescription) return;
                          setIsSavingDescription(true);
                          try {
                            await updateDoc(doc(db, 'stories', storyId), { prompt: editingDescriptionValue.trim() });
                            setStoryDescription(editingDescriptionValue.trim());
                            setIsEditingDescription(false);
                          } catch (error) {
                            console.error('Error saving description:', error);
                            Alert.alert('Error', 'Failed to save description');
                          } finally {
                            setIsSavingDescription(false);
                          }
                        }}
                        disabled={isSavingDescription}
                      >
                        <Text style={[styles.editActionText, { color: '#007AFF' }]}>
                          {isSavingDescription ? 'saving...' : 'save'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <Text style={[styles.descriptionText, { color: colors.text }]}>{descriptionDisplayText}</Text>
                )}
              </View>

              {/* Action Buttons */}
              <View style={styles.actionButtons}>
                <Button
                  onPress={handleBookmarkPress}
                  variant="outline"
                  style={StyleSheet.flatten([
                    styles.actionButton,
                    styles.actionButtonOutline,
                    { borderColor: colors.border, backgroundColor: colors.card },
                  ])}
                  disabled={isBookmarking}
                  loading={isBookmarking}
                >
                  <View style={styles.buttonContent}>
                    <IconSymbol name={isStoryBookmarked ? 'bookmark.fill' : 'bookmark'} size={16} color={colors.text} />
                    <Text style={[styles.actionButtonText, { color: colors.text }]}>
                      {isStoryBookmarked ? 'saved to bookmarks' : 'save to bookmarks'}
                    </Text>
                  </View>
                </Button>
                
                <Button
                  onPress={handleOpenRegenerate}
                  style={StyleSheet.flatten([
                    styles.actionButton,
                    styles.actionButtonOutline,
                    { borderColor: colors.border, backgroundColor: colors.card },
                  ])}
                >
                  <View style={styles.buttonContent}>
                    <IconSymbol name="arrow.clockwise.circle" size={16} color={colors.text} />
                    <Text style={[styles.actionButtonText, { color: colors.text }]}>regenerate</Text>
                  </View>
                </Button>

                <Button
                  onPress={handleSinkIt}
                  style={StyleSheet.flatten([
                    styles.actionButton,
                    styles.actionButtonPrimary,
                    { backgroundColor: sinkCopied ? '#22c55e' : colors.buttonBackground },
                  ])}
                  disabled={isSinking}
                  loading={isSinking}
                >
                  <View style={styles.buttonContent}>
                    <IconSymbol name={sinkCopied ? 'checkmark.circle.fill' : 'square.and.arrow.up'} size={16} color={colors.buttonText} />
                    <Text style={[styles.actionButtonTextPrimary, { color: colors.buttonText }]}>
                      {sinkCopied ? 'link copied!' : 'synk it'}
                    </Text>
                  </View>
                </Button>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* Expanded Artwork Modal */}
      <Modal
        visible={isArtworkExpanded}
        animationType="fade"
        transparent
        onRequestClose={handleCloseExpandedArtwork}
      >
        <View style={styles.expandedArtworkBackdrop}>
          <TouchableOpacity
            style={styles.expandedArtworkDismiss}
            activeOpacity={1}
            onPress={handleCloseExpandedArtwork}
          />
          <View style={styles.expandedArtworkContainer}>
            <TopographicArtwork
              baseColor={artworkPreviewColor}
              layers={artworkPreviewLayers}
              size={SCREEN_WIDTH - 32}
            />

            {/* Regenerate button - top left */}
            <TouchableOpacity
              style={styles.expandedArtworkRegenerate}
              onPress={handleRegenerateArtwork}
            >
              <IconSymbol name="arrow.triangle.2.circlepath" size={24} color="#fff" />
            </TouchableOpacity>

            {/* Color swatches - center */}
            <View style={styles.expandedColorCircleContainer}>
              <View style={[styles.expandedColorCircle, { backgroundColor: artworkPreviewColor }]} />
              <View style={styles.expandedColorSwatches}>
                {THEME_COLOR_OPTIONS.map((swatchColor) => (
                  <TouchableOpacity
                    key={swatchColor}
                    onPress={() => {
                      setColorInputValue(swatchColor);
                      setArtworkPreviewColor(swatchColor);
                    }}
                    style={[
                      styles.expandedMiniSwatch,
                      { backgroundColor: swatchColor },
                      colorInputValue === swatchColor && styles.expandedMiniSwatchSelected,
                    ]}
                  />
                ))}
              </View>
            </View>

            {/* Save button - bottom right */}
            <TouchableOpacity
              style={styles.expandedArtworkSave}
              onPress={() => {
                handleSaveArtwork();
                setIsArtworkExpanded(false);
              }}
              disabled={isSavingArtwork}
            >
              {isSavingArtwork ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <IconSymbol name="checkmark" size={18} color="#fff" />
                  <Text style={styles.expandedArtworkButtonText}>save</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Close button - top right */}
            <TouchableOpacity
              style={styles.expandedArtworkClose}
              onPress={handleCloseExpandedArtwork}
            >
              <IconSymbol name="xmark" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Regenerate Modal */}
      <Modal
        visible={showRegenerateModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowRegenerateModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>regenerate story</Text>
            
            <View style={styles.modalField}>
              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>what changes would you like?</Text>
              <TextInput
                style={[styles.modalInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={regenerationNotes}
                onChangeText={setRegenerationNotes}
                placeholder="describe any edits to the story..."
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.modalField}>
              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>narrator voice</Text>
              {isLoadingNarrators ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : narrators.length === 0 ? (
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>
                  {selectedNarratorId ? 'using current narrator' : 'no narrators found'}
                </Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.narratorScroll}>
                  {narrators.map((narrator) => (
                    <TouchableOpacity
                      key={narrator.id}
                      style={[
                        styles.narratorChip,
                        { borderColor: colors.border },
                        selectedNarratorId === narrator.id && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground },
                      ]}
                      onPress={() => setSelectedNarratorId(narrator.id)}
                    >
                      <Text
                        style={[
                          styles.narratorChipText,
                          { color: selectedNarratorId === narrator.id ? colors.buttonText : colors.text },
                        ]}
                      >
                        {narrator.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.border }]}
                onPress={() => setShowRegenerateModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.buttonBackground }]}
                onPress={handleSubmitRegeneration}
                disabled={isRegenerating}
              >
                {isRegenerating ? (
                  <ActivityIndicator size="small" color={colors.buttonText} />
                ) : (
                  <Text style={[styles.modalButtonText, { color: colors.buttonText }]}>regenerate</Text>
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
  descriptionSection: {
    paddingHorizontal: 4,
    marginTop: 24,
    marginBottom: 8,
  },
  descriptionLabel: {
    fontSize: 13,
    textTransform: 'lowercase',
    marginBottom: 6,
    fontFamily: 'EBGaramond-Regular',
  },
  descriptionText: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'EBGaramond-Regular',
  },
  descriptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  editLink: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  editDescriptionContainer: {
    gap: 12,
  },
  descriptionInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    fontFamily: 'EBGaramond-Regular',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  editDescriptionActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
  },
  editActionText: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  minimizeButton: {
    padding: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerActionButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#030213',
    fontFamily: 'EBGaramond-Medium',
  },
  playerScroll: {
    flex: 1,
  },
  playerContainer: {
    paddingHorizontal: 18,
    paddingVertical: 22,
    gap: 14,
  },
  artworkContainer: {
    alignSelf: 'center',
    marginBottom: 0,
  },
  artwork: {
    alignSelf: 'center',
    backgroundColor: '#ececf0',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  artworkBadge: {
    position: 'absolute',
    bottom: 16,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  artworkBadgeText: {
    color: '#fff',
    fontSize: 12,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  artworkEmoji: {
    fontSize: 80,
  },
  artworkEditRegenerate: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artworkEditCancel: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  artworkEditSave: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  artworkEditButtonText: {
    color: '#fff',
    fontSize: 13,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  artworkColorCircleContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -40 }, { translateY: -40 }],
    alignItems: 'center',
    gap: 12,
  },
  artworkColorCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.8)',
    ...createShadow('#000', 0, 2, 6, 0.3, 4),
  },
  artworkColorSwatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    maxWidth: 140,
  },
  artworkMiniSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  artworkMiniSwatchSelected: {
    borderColor: '#fff',
    borderWidth: 3,
  },
  infoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
    paddingVertical: 4,
    minHeight: 82,
    gap: 4,
  },
  titleWrapper: {
    alignItems: 'center',
    marginBottom: 6,
  },
  titleDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  storyTitle: {
    fontSize: 24,
    fontWeight: '500',
    color: '#030213',
    marginBottom: 12,
    fontFamily: 'EBGaramond-Medium',
    textAlign: 'center',
  },
  titleEditContainer: {
    alignItems: 'center',
    gap: 12,
  },
  titleInput: {
    minWidth: '65%',
    borderBottomWidth: 1,
    borderBottomColor: '#030213',
    fontSize: 24,
    fontWeight: '500',
    color: '#030213',
    fontFamily: 'EBGaramond-Medium',
    textAlign: 'center',
    paddingVertical: 4,
  },
  titleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  titleActionText: {
    fontSize: 14,
    color: '#030213',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  titleActionCancel: {
    color: '#717182',
  },
  titleActionDisabled: {
    color: '#bbb',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'center',
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ececf0',
    borderRadius: 16,
  },
  tagText: {
    fontSize: 13,
    color: '#030213',
    fontFamily: 'EBGaramond-Regular',
  },
  progressContainer: {
    marginBottom: 4,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 12,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 12,
  },
  controlButton: {
    padding: 8,
  },
  playButton: {
    padding: 8,
  },
  actionButtons: {
    gap: 12,
  },
  moreButton: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  moreButtonText: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  detailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1,
  },
  detailsButtonText: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  actionButton: {
    width: '100%',
  },
  actionButtonOutline: {
    borderWidth: 1,
    borderColor: '#E5E5E7',
    backgroundColor: '#f7f7f8',
  },
  actionButtonPrimary: {
    backgroundColor: '#030213',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionButtonText: {
    fontSize: 16,
    color: '#030213',
    fontFamily: 'EBGaramond-Medium',
  },
  actionButtonTextPrimary: {
    fontSize: 16,
    color: '#fff',
    fontFamily: 'EBGaramond-Medium',
  },
  transcriptContainer: {
    flex: 1,
  },
  transcriptContent: {
    padding: 24,
    gap: 16,
  },
  transcriptTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: '#030213',
    marginBottom: 16,
    fontFamily: 'EBGaramond-Medium',
  },
  transcriptText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#030213',
    fontFamily: 'EBGaramond-Regular',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#030213',
    textAlign: 'center',
    fontFamily: 'EBGaramond-Medium',
    marginTop: 16,
  },
  errorMessage: {
    fontSize: 16,
    color: '#717182',
    textAlign: 'center',
    fontFamily: 'EBGaramond-Regular',
  },
  errorButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#030213',
    borderRadius: 8,
  },
  errorButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'EBGaramond-Medium',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxWidth: 500,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    gap: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'EBGaramond-Medium',
    textAlign: 'center',
  },
  modalField: {
    gap: 8,
  },
  modalLabel: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  colorInput: {
    borderWidth: 1,
    borderColor: '#E5E5E7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: 'EBGaramond-Regular',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalClose: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
  modalCloseText: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  artworkPreviewContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  colorSwatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  colorSwatchSelected: {
    borderWidth: 3,
    borderColor: '#fff',
    ...createShadow('#000', 0, 2, 4, 0.3, 4),
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'EBGaramond-Medium',
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: 'EBGaramond-Regular',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  narratorScroll: {
    maxHeight: 44,
  },
  narratorChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  narratorChipText: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  expandedArtworkBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandedArtworkDismiss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  expandedArtworkContainer: {
    position: 'relative',
    borderRadius: 24,
    overflow: 'hidden',
  },
  expandedArtworkRegenerate: {
    position: 'absolute',
    top: 20,
    left: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedArtworkClose: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedColorCircleContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -50 }, { translateY: -50 }],
    alignItems: 'center',
    gap: 16,
  },
  expandedColorCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    ...createShadow('#000', 0, 4, 8, 0.4, 6),
  },
  expandedColorSwatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    maxWidth: 180,
  },
  expandedMiniSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  expandedMiniSwatchSelected: {
    borderColor: '#fff',
    borderWidth: 3,
  },
  expandedArtworkSave: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  expandedArtworkButtonText: {
    color: '#fff',
    fontSize: 15,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
});
