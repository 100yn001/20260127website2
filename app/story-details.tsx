import TopographicArtwork, { generateDepthLayers } from '@/components/TopographicArtwork';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { auth, db } from '@/config/firebase';
import { DEFAULT_COVER_COLOR, THEME_COLOR_OPTIONS } from '@/constants/cover-colors';
import { useTheme } from '@/contexts/ThemeContext';
import { addPublicStory } from '@/services/public-story-service';
import { shareStoryToSink } from '@/services/share-service';
import { DepthLayer } from '@/types/story';
import { createShadow } from '@/utils/shadow';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActionSheetIOS,
    ActivityIndicator,
    Alert,
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

export default function StoryDetailsScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useTheme();
  const { width: vw } = useWindowDimensions();
  const SCREEN_WIDTH = Platform.OS === 'web' ? Math.min(vw, 600) : vw;
  
  const storyId = params.storyId as string;
  const [audioUrl, setAudioUrl] = useState(() => {
    const raw = params.audioUrl as string;
    if (!raw) return '';
    if (raw.startsWith('https://')) return raw;
    try { return decodeURIComponent(raw); } catch { return raw; }
  });
  const transcript = params.transcript as string;
  const [audioChunkURLs, setAudioChunkURLs] = useState<string[]>(() => {
    try {
      if (typeof params.audioChunkURLs === 'string' && params.audioChunkURLs) {
        return JSON.parse(params.audioChunkURLs);
      }
    } catch { /* ignore */ }
    return [];
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [storyTitle, setStoryTitle] = useState('');
  const [storyDescription, setStoryDescription] = useState('');
  const [coverColor, setCoverColor] = useState(DEFAULT_COVER_COLOR);
  const [topographyLayers, setTopographyLayers] = useState<DepthLayer[] | undefined>();
  const [createdAt, setCreatedAt] = useState<Date | null>(null);
  const [duration, setDuration] = useState('');
  const [character, setCharacter] = useState('');
  const [trope, setTrope] = useState('');
  const [setting, setSetting] = useState('');
  const [narratorId, setNarratorId] = useState<string | null>(null);
  const [isNighttime, setIsNighttime] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [isPublishingPublicStory, setIsPublishingPublicStory] = useState(false);
  
  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSynking, setIsSynking] = useState(false);
  const [synkLogs, setSynkLogs] = useState<string[]>([]);
  
  // Artwork edit
  const [showArtworkModal, setShowArtworkModal] = useState(false);
  const [artworkPreviewColor, setArtworkPreviewColor] = useState(DEFAULT_COVER_COLOR);
  const [artworkPreviewLayers, setArtworkPreviewLayers] = useState<DepthLayer[] | undefined>();
  const [isSavingArtwork, setIsSavingArtwork] = useState(false);

  // Load story data
  useEffect(() => {
    const loadStory = async () => {
      if (!storyId) {
        setIsLoading(false);
        return;
      }
      
      try {
        const storyDoc = await getDoc(doc(db, 'stories', storyId));
        if (storyDoc.exists()) {
          const data = storyDoc.data();
          setStoryTitle(data.title || '');
          setStoryDescription(data.prompt || data.description || '');
          setCoverColor(data.coverColor || DEFAULT_COVER_COLOR);
          setTopographyLayers(data.topographyLayers);
          setCreatedAt(data.createdAt?.toDate() || null);
          setDuration(data.duration || '');
          setCharacter(data.character || '');
          setTrope(data.trope || '');
          setSetting(data.setting || '');
          setNarratorId(data.narratorId || null);
          setIsNighttime(Boolean(data.isNighttime));
          setTags(Array.isArray(data.tags) ? data.tags : []);
          if (data.audioChunkURLs && Array.isArray(data.audioChunkURLs) && data.audioChunkURLs.length > 0) {
            setAudioChunkURLs(data.audioChunkURLs);
          }
          // Update audioUrl from Firestore if not provided via params
          if (data.audioUrl && !audioUrl) {
            setAudioUrl(data.audioUrl);
          }
          
          setEditTitle(data.title || '');
          setEditDescription(data.prompt || data.description || '');
          setArtworkPreviewColor(data.coverColor || DEFAULT_COVER_COLOR);
          setArtworkPreviewLayers(data.topographyLayers);
        }
      } catch (error) {
        console.error('Error loading story:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadStory();
  }, [storyId]);

  const handleSynkIt = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || isSynking) return;
    setIsSynking(true);
    setSynkLogs([]);
    const log = (msg: string) => setSynkLogs(prev => [...prev, msg]);

    // Open window immediately to preserve user gesture (browsers block async popups)
    let popup: Window | null = null;
    if (Platform.OS === 'web') {
      popup = window.open('about:blank', '_blank');
    }

    log(`coverColor: ${coverColor || 'NONE'}, layers: ${topographyLayers?.length || 0}`);

    try {
      // Test artwork generation inline
      if (Platform.OS === 'web' && coverColor) {
        try {
          const { renderArtworkToPng } = await import('@/utils/artwork-to-png');
          log('rendering PNG...');
          const blob = await renderArtworkToPng(coverColor, topographyLayers, 440);
          log(`blob ok, size: ${blob.size}`);

          const { storage } = await import('@/config/firebase');
          const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
          const path = `sharedArtwork/${currentUser.uid}/${storyId}_${Date.now()}.png`;
          log(`uploading to: ${path}`);
          const storageRef = ref(storage, path);
          await uploadBytes(storageRef, blob);
          const url = await getDownloadURL(storageRef);
          log(`upload ok: ${url.substring(0, 60)}...`);
        } catch (artErr: any) {
          log(`ART ERROR: ${artErr?.message || artErr}`);
        }
      } else {
        log(`art skipped: web=${Platform.OS === 'web'}, color=${coverColor || 'NONE'}`);
      }

      const deepLink = await shareStoryToSink({
        userId: currentUser.uid,
        storyId,
        title: storyTitle || 'untitled',
        audioChunkURLs: audioChunkURLs || [],
        audioUrl,
        coverColor,
        topographyLayers,
        duration: duration as any,
        isNighttime,
      });
      log(`share ok: ${deepLink.substring(0, 50)}...`);
      if (popup) {
        popup.location.href = deepLink;
      }
    } catch (error: any) {
      log(`SHARE ERROR: ${error?.message || error}`);
      console.error('Error synking story:', error);
      if (popup) popup.close();
    } finally {
      setIsSynking(false);
    }
  };

  const handlePlay = () => {
    // Use audioUrl, or fall back to first chunk URL
    const effectiveAudioUrl = audioUrl || (audioChunkURLs.length > 0 ? audioChunkURLs[0] : '');
    router.push({
      pathname: '/player',
      params: {
        audioUrl: encodeURIComponent(effectiveAudioUrl),
        audioChunkURLs: audioChunkURLs.length > 0 ? JSON.stringify(audioChunkURLs) : '',
        transcript: transcript,
        storyId: storyId,
      },
    });
  };

  const handleSave = async () => {
    if (!storyId) return;
    
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'stories', storyId), {
        title: editTitle.trim(),
        prompt: editDescription.trim(),
      });
      setStoryTitle(editTitle.trim());
      setStoryDescription(editDescription.trim());
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving:', error);
      Alert.alert('Error', 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditTitle(storyTitle);
    setEditDescription(storyDescription);
    setIsEditing(false);
  };

  const handleSaveArtwork = async () => {
    if (!storyId) return;
    
    setIsSavingArtwork(true);
    try {
      await updateDoc(doc(db, 'stories', storyId), {
        coverColor: artworkPreviewColor,
        topographyLayers: artworkPreviewLayers,
      });
      setCoverColor(artworkPreviewColor);
      setTopographyLayers(artworkPreviewLayers);
      setShowArtworkModal(false);
    } catch (error) {
      console.error('Error saving artwork:', error);
      Alert.alert('Error', 'Failed to save artwork');
    } finally {
      setIsSavingArtwork(false);
    }
  };

  const handleRandomizeArtwork = () => {
    setArtworkPreviewLayers(generateDepthLayers(5));
  };

  const formatDate = (date: Date | null) => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formattedDate = useMemo(() => {
    if (!createdAt) return '';
    return createdAt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }, [createdAt]);

  const handleCharacterPress = () => {
    if (!narratorId || !character) return;
    router.push({
      pathname: '/narrator-stories',
      params: {
        narratorId,
        highlightCharacter: character,
      },
    });
  };

  const shouldShowCharacterChip = Boolean(character);
  const characterChipIsLink = Boolean(narratorId && character);
  const isAdminUser = ['ellepotterhead2006@gmail.com', 'madxwoods@gmail.com'].includes(auth.currentUser?.email || '');

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

  const handlePublishPublicStory = async () => {
    if (isPublishingPublicStory) return;
    if (!isAdminUser) {
      Alert.alert('access denied', 'only admin users can publish to the library.');
      return;
    }
    if (!audioUrl) {
      Alert.alert('missing audio', 'cannot publish without an audio file.');
      return;
    }
    if (!transcript) {
      Alert.alert('missing transcript', 'cannot publish without a transcript.');
      return;
    }

    const suggestedCategory = isNighttime ? 'nighttime' : 'daytime';
    const libraryCategory = await promptForLibraryCategory(suggestedCategory);
    if (!libraryCategory) return;

    setIsPublishingPublicStory(true);
    try {
      await addPublicStory({
        title: storyTitle || 'untitled story',
        genre: setting || trope || 'story',
        isNighttime: libraryCategory === 'nighttime',
        duration: duration || '10 min',
        audioUrl,
        transcript,
        narratorId: narratorId || undefined,
        libraryCategory,
        coverColor,
        topographyLayers,
      });
      Alert.alert('published', 'story added to the public library.');
    } catch (error) {
      console.error('Error publishing public story:', error);
      Alert.alert('publish failed', 'unable to add this story to the public library.');
    } finally {
      setIsPublishingPublicStory(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>story details</Text>
        {isEditing ? (
          <TouchableOpacity onPress={handleSave} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <Text style={[styles.headerAction, { color: '#007AFF' }]}>save</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => setIsEditing(true)}>
            <Text style={[styles.headerAction, { color: '#007AFF' }]}>edit</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, Platform.OS === 'web' && { maxWidth: 520, alignSelf: 'center' as const, width: '100%' as any }]}>
        {/* Artwork */}
        <TouchableOpacity 
          style={styles.artworkContainer}
          onPress={() => setShowArtworkModal(true)}
          activeOpacity={0.9}
        >
          <TopographicArtwork
            baseColor={coverColor}
            layers={topographyLayers}
            size={SCREEN_WIDTH - 80}
          />
          <View style={styles.artworkEditHint}>
            <IconSymbol name="pencil" size={14} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* Title */}
        <View style={styles.section}>
          {isEditing ? (
            <TextInput
              style={[styles.titleInput, { color: colors.text, borderColor: colors.border }]}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="story title"
              placeholderTextColor={colors.textSecondary}
              multiline
            />
          ) : (
            <Text style={[styles.title, { color: colors.text }]}>
              {storyTitle || 'untitled story'}
            </Text>
          )}
        </View>

        {/* Play button */}
        <TouchableOpacity 
          style={styles.playButton}
          onPress={handlePlay}
          activeOpacity={0.8}
        >
          <IconSymbol name="play.fill" size={24} color="#fff" />
          <Text style={styles.playButtonText}>play story</Text>
        </TouchableOpacity>

        {/* Synk it button (web only) */}
        {Platform.OS === 'web' && (
          <TouchableOpacity
            style={[styles.synkButton, isSynking && { opacity: 0.6 }]}
            onPress={handleSynkIt}
            activeOpacity={0.8}
            disabled={isSynking}
          >
            {isSynking ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <IconSymbol name="arrow.down.to.line" size={18} color="#fff" />
                <Text style={styles.synkButtonText}>synk it</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        {synkLogs.length > 0 && (
          <View style={{ marginTop: 12, padding: 12, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, width: '100%' }}>
            {synkLogs.map((l, i) => (
              <Text key={i} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'monospace', marginBottom: 2 }}>{l}</Text>
            ))}
          </View>
        )}

        {isAdminUser && (
          <TouchableOpacity
            style={[
              styles.publishButton,
              { borderColor: colors.border, backgroundColor: colors.card },
              isPublishingPublicStory && styles.publishButtonDisabled,
            ]}
            onPress={handlePublishPublicStory}
            activeOpacity={0.85}
            disabled={isPublishingPublicStory}
          >
            {isPublishingPublicStory ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <>
                <IconSymbol name="checkmark.seal.fill" size={18} color="#0A84FF" />
                <Text style={[styles.publishButtonText, { color: colors.text }]}>publish to library</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Description */}
        <View style={styles.section}>
          {isEditing ? (
            <TextInput
              style={[styles.descriptionInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="add a description..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={4}
            />
          ) : (
            <Text style={[styles.description, { color: storyDescription ? colors.text : colors.textSecondary }]}>
              {storyDescription || 'no description'}
            </Text>
          )}
        </View>

        {/* Metadata chips */}
        <View style={styles.metadataRow}>
          {(formattedDate || duration) && (
            <View style={[styles.metadataPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {formattedDate && (
                <Text style={[styles.metadataText, { color: colors.text }]}>{formattedDate}</Text>
              )}
              {formattedDate && duration && <View style={styles.metadataDivider} />}
              {duration && (
                <Text style={[styles.metadataText, { color: colors.text }]}>{duration}</Text>
              )}
            </View>
          )}

          {shouldShowCharacterChip && (
            <TouchableOpacity
              style={[
                styles.characterChip,
                { backgroundColor: characterChipIsLink ? '#0A0A0A' : colors.card, borderColor: colors.border },
              ]}
              activeOpacity={characterChipIsLink ? 0.85 : 1}
              disabled={!characterChipIsLink}
              onPress={handleCharacterPress}
            >
              <IconSymbol name="person" size={14} color={characterChipIsLink ? '#F3E6D5' : colors.text} />
              <Text
                style={[
                  styles.characterText,
                  { color: characterChipIsLink ? '#F3E6D5' : colors.text },
                ]}
              >
                {character}
              </Text>
              {characterChipIsLink && (
                <IconSymbol name="chevron.right" size={14} color="#F3E6D5" />
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Cancel edit button */}
        {isEditing && (
          <TouchableOpacity 
            style={[styles.cancelButton, { borderColor: colors.border }]}
            onPress={handleCancelEdit}
          >
            <Text style={[styles.cancelButtonText, { color: colors.text }]}>cancel</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Artwork Edit Modal */}
      <Modal
        visible={showArtworkModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowArtworkModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowArtworkModal(false)}>
              <Text style={[styles.modalCancel, { color: colors.text }]}>cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>edit artwork</Text>
            <TouchableOpacity onPress={handleSaveArtwork} disabled={isSavingArtwork}>
              {isSavingArtwork ? (
                <ActivityIndicator size="small" color="#007AFF" />
              ) : (
                <Text style={[styles.modalSave, { color: '#007AFF' }]}>save</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            {/* Preview */}
            <View style={styles.artworkPreview}>
              <TopographicArtwork
                baseColor={artworkPreviewColor}
                layers={artworkPreviewLayers}
                size={SCREEN_WIDTH - 100}
              />
            </View>

            {/* Randomize button */}
            <TouchableOpacity 
              style={[styles.randomizeButton, { backgroundColor: colors.card }]}
              onPress={handleRandomizeArtwork}
            >
              <IconSymbol name="arrow.triangle.2.circlepath" size={18} color={colors.text} />
              <Text style={[styles.randomizeText, { color: colors.text }]}>randomize pattern</Text>
            </TouchableOpacity>

            {/* Color options */}
            <Text style={[styles.colorLabel, { color: colors.textSecondary }]}>color</Text>
            <View style={styles.colorGrid}>
              {THEME_COLOR_OPTIONS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: color },
                    artworkPreviewColor === color && styles.colorSwatchSelected,
                  ]}
                  onPress={() => setArtworkPreviewColor(color)}
                />
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  headerAction: {
    fontSize: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
  },
  artworkContainer: {
    alignSelf: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  artworkEditHint: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 16,
    padding: 8,
  },
  section: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
    textAlign: 'center',
  },
  titleInput: {
    fontSize: 28,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
    textAlign: 'center',
    borderBottomWidth: 1,
    paddingBottom: 8,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 28,
    marginBottom: 32,
    alignSelf: 'center',
    paddingHorizontal: 48,
  },
  playButtonText: {
    fontSize: 18,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
    color: '#fff',
  },
  publishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 24,
    alignSelf: 'center',
  },
  publishButtonDisabled: {
    opacity: 0.6,
  },
  publishButtonText: {
    fontSize: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  metadataPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    gap: 8,
  },
  metadataText: {
    fontSize: 13,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  metadataDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  characterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    gap: 8,
  },
  characterText: {
    fontSize: 13,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  description: {
    fontSize: 16,
    fontFamily: 'EBGaramond-Regular',
    lineHeight: 24,
  },
  descriptionInput: {
    fontSize: 16,
    fontFamily: 'EBGaramond-Regular',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  detailsCard: {
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  detailValue: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  cancelButton: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalCancel: {
    fontSize: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  modalSave: {
    fontSize: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  modalContent: {
    padding: 24,
    alignItems: 'center',
  },
  artworkPreview: {
    marginBottom: 24,
  },
  randomizeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 24,
    marginBottom: 32,
  },
  randomizeText: {
    fontSize: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  colorLabel: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  colorSwatch: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorSwatchSelected: {
    borderColor: '#fff',
    ...createShadow('#000', 0, 2, 4, 0.3, 4),
  },
  synkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#1a1a2e',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 28,
    marginBottom: 24,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  synkButtonText: {
    fontSize: 17,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
    color: '#fff',
  },
});
