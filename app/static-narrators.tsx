import NarratorArtwork, { getRandomNarratorColor } from '@/components/NarratorArtwork';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { auth, db } from '@/config/firebase';
import { FontSizes } from '@/constants/typography';
import { useTheme } from '@/contexts/ThemeContext';
import { clonePublicNarratorToUser } from '@/services/public-narrator-service';
import { PublicNarrator } from '@/types/narrator';
import { createShadow } from '@/utils/shadow';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { useRouter } from 'expo-router';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

interface StaticNarrator extends PublicNarrator {
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date;
}

export default function StaticNarratorsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [narrators, setNarrators] = useState<StaticNarrator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [pendingNarrator, setPendingNarrator] = useState<StaticNarrator | null>(null);
  const [isNameModalVisible, setIsNameModalVisible] = useState(false);
  const [customName, setCustomName] = useState('');
  const [storedUserName, setStoredUserName] = useState('you');
  const [searchQuery, setSearchQuery] = useState('');
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playingNarratorId, setPlayingNarratorId] = useState<string | null>(null);

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const playVoicePreview = async (narrator: StaticNarrator) => {
    if (!narrator.voicePreviewAudio) return;

    try {
      // If already playing this narrator, stop
      if (playingNarratorId === narrator.id && sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
        setPlayingNarratorId(null);
        return;
      }

      // Stop any existing sound
      if (sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const audioUri = `data:audio/mpeg;base64,${narrator.voicePreviewAudio}`;
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true }
      );

      setSound(newSound);
      setPlayingNarratorId(narrator.id);

      newSound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingNarratorId(null);
          newSound.unloadAsync();
          setSound(null);
        }
      });
    } catch (error) {
      console.error('Error playing voice preview:', error);
      setPlayingNarratorId(null);
    }
  };

  useEffect(() => {
    AsyncStorage.getItem('userName').then((value) => {
      if (value && value.trim().length > 0) {
        setStoredUserName(value);
      }
    });
  }, []);

  useEffect(() => {
    const publicNarratorsRef = collection(db, 'publicNarrators');
    const q = query(publicNarratorsRef, orderBy('publishedAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: StaticNarrator[] = snapshot.docs.map((doc) => {
        const data = doc.data() as PublicNarrator & Record<string, any>;
        const normalizeDate = (value: any): Date => {
          if (value?.toDate) return value.toDate();
          if (value instanceof Date) return value;
          if (typeof value === 'string') return new Date(value);
          return new Date();
        };

        return {
          ...data,
          id: doc.id,
          createdAt: normalizeDate(data.createdAt),
          updatedAt: normalizeDate(data.updatedAt),
          publishedAt: normalizeDate(data.publishedAt),
        };
      });

      setNarrators(list);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const isLoggedIn = useMemo(() => Boolean(auth.currentUser), [auth.currentUser]);

  const filteredNarrators = useMemo(() => {
    if (!searchQuery.trim()) return narrators;
    const query = searchQuery.trim().toLowerCase();
    return narrators.filter(
      (n) =>
        n.name.toLowerCase().includes(query) ||
        (n.username && n.username.toLowerCase().includes(query))
    );
  }, [narrators, searchQuery]);

  const handleClone = async (publicNarrator: StaticNarrator, nameOverride?: string) => {
    const user = auth.currentUser;
    if (!user) {
      Alert.alert('sign in required', 'please log in to add narrators to your library.');
      return;
    }

    setLoadingMap((prev) => ({ ...prev, [publicNarrator.id]: true }));
    setIsNameModalVisible(false);
    setPendingNarrator(null);
    try {
      await clonePublicNarratorToUser(publicNarrator, user.uid, {
        userNameOverride: nameOverride,
      });
      Alert.alert('added', `${publicNarrator.name} is now in your narrators tab.`);
    } catch (error) {
      console.error('Error cloning public narrator:', error);
      Alert.alert('failed', 'could not add this narrator. try again.');
    } finally {
      setLoadingMap((prev) => ({ ...prev, [publicNarrator.id]: false }));
    }
  };

  const startAddFlow = (narrator: StaticNarrator) => {
    const user = auth.currentUser;
    if (!user) {
      Alert.alert('sign in required', 'please log in to add narrators to your library.');
      return;
    }
    setPendingNarrator(narrator);
    setCustomName('');
    setIsNameModalVisible(true);
  };

  const confirmCustomName = () => {
    if (!pendingNarrator) return;
    const trimmed = customName.trim();
    if (!trimmed) {
      Alert.alert('name required', 'enter a name or choose use my name.');
      return;
    }
    handleClone(pendingNarrator, trimmed);
  };

  const confirmStoredName = () => {
    if (!pendingNarrator) return;
    handleClone(pendingNarrator, storedUserName);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={[styles.heroSection, { backgroundColor: colors.card }]}>
          <TouchableOpacity style={styles.headerRow} onPress={() => router.back()}>
            <IconSymbol name="chevron.left" size={24} color={colors.text} />
            <Text style={[styles.heroTitle, { color: colors.text }]}>public narrators</Text>
          </TouchableOpacity>
          <View style={styles.heroCopy}>
            <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>pre-crafted voices with distinct personalities. drop them straight into your library and customize from there.</Text>
            <View style={styles.heroBadgesRow}>
              <View style={styles.heroBadge}>
                <IconSymbol name="checkmark.seal.fill" size={16} color="#0A84FF" />
                <Text style={styles.heroBadgeText}>verified voices</Text>
              </View>
              <View style={styles.heroBadge}>
                <IconSymbol name="sparkles" size={16} color="#0A84FF" />
                <Text style={styles.heroBadgeText}>ready-made presets</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <IconSymbol name="magnifyingglass" size={18} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="search by name or @username"
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <IconSymbol name="xmark.circle.fill" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.text} />
          </View>
        )}

        {!isLoading && narrators.length === 0 && (
          <View style={styles.emptyState}>
            <IconSymbol name="waveform" size={56} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.text }]}>no public narrators yet</Text>
            <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>once the admin publishes narrators, they will appear here.</Text>
          </View>
        )}

        {!isLoading && narrators.length > 0 && filteredNarrators.length === 0 && (
          <View style={styles.emptyState}>
            <IconSymbol name="magnifyingglass" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.text }]}>no results found</Text>
            <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>try a different search term</Text>
          </View>
        )}

        {!isLoading && filteredNarrators.length > 0 && (
          <View style={styles.narratorsGrid}>
            {filteredNarrators.map((narrator) => (
              <View key={narrator.id} style={[styles.narratorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleRow}>
                    <NarratorArtwork 
                      color={narrator.color || getRandomNarratorColor(narrator.id)} 
                      size={96} 
                    />
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{narrator.name}</Text>
                    {narrator.voicePreviewAudio && (
                      <TouchableOpacity
                        style={styles.voicePlayButton}
                        onPress={() => playVoicePreview(narrator)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <IconSymbol
                          name={playingNarratorId === narrator.id ? 'pause.fill' : 'play.fill'}
                          size={14}
                          color={colors.text}
                        />
                      </TouchableOpacity>
                    )}
                    <View style={styles.verifiedChip}>
                      <IconSymbol name="checkmark.seal.fill" size={16} color="#0A84FF" />
                      <Text style={styles.verifiedChipText}>public</Text>
                    </View>
                  </View>
                  {narrator.username && (
                    <Text style={[styles.cardUsername, { color: colors.textSecondary }]}>@{narrator.username}</Text>
                  )}
                </View>

                {!!narrator.additionalDetails && (
                  <View style={[styles.detailPill, { backgroundColor: colors.card }]}>
                    <Text style={{ color: colors.text, fontSize: 15, textTransform: 'lowercase', fontFamily: 'EBGaramond-Medium' }}>{narrator.additionalDetails}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.addButton, loadingMap[narrator.id] && styles.addButtonDisabled]}
                  onPress={() => startAddFlow(narrator)}
                  disabled={!isLoggedIn || loadingMap[narrator.id]}
                >
                  {loadingMap[narrator.id] ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <IconSymbol name="plus" size={18} color="#fff" />
                      <Text style={styles.addButtonText}>add to my narrators</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={isNameModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setIsNameModalVisible(false);
          setPendingNarrator(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>choose how they say your name</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              pick the name the narrator will use once added to your library
            </Text>
            <TouchableOpacity style={styles.modalOption} onPress={confirmStoredName}>
              <IconSymbol name="person.fill" size={18} color="#0A84FF" />
              <View style={styles.modalOptionText}>
                <Text style={[styles.modalOptionTitle, { color: colors.text }]}>use my name</Text>
                <Text style={[styles.modalOptionSubtitle, { color: colors.textSecondary }]}>
                  {storedUserName}
                </Text>
              </View>
            </TouchableOpacity>
            <View style={styles.modalDivider} />
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>use different name</Text>
            <TextInput
              style={[styles.modalInput, { color: colors.text, borderColor: colors.border }]}
              placeholder="enter custom name"
              placeholderTextColor={colors.textSecondary}
              value={customName}
              onChangeText={setCustomName}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancel]}
                onPress={() => {
                  setIsNameModalVisible(false);
                  setPendingNarrator(null);
                }}
              >
                <Text style={styles.modalCancelText}>cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirm]}
                onPress={confirmCustomName}
              >
                <Text style={styles.modalConfirmText}>confirm</Text>
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 24,
  },
  heroSection: {
    borderRadius: 28,
    padding: 20,
    paddingTop: 28,
    gap: 16,
    ...createShadow('#000', 0, 12, 24, 0.1, 8),
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(3, 2, 19, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 28,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
    lineHeight: 28,
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  heroBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(10, 132, 255, 0.12)',
  },
  heroBadgeText: {
    fontSize: 13,
    color: '#0A84FF',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'EBGaramond-Regular',
    paddingVertical: 0,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: FontSizes.subtitle,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  emptyHint: {
    fontSize: FontSizes.body,
    fontFamily: 'EBGaramond-Regular',
    textAlign: 'center',
    textTransform: 'lowercase',
    maxWidth: 260,
  },
  narratorsGrid: {
    gap: 20,
  },
  narratorCard: {
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    gap: 8,
  },
  cardHeader: {
    gap: 4,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  cardTitle: {
    fontSize: 24,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  voicePlayButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardUsername: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    marginTop: 2,
  },
  cardFieldText: {
    fontSize: FontSizes.body,
    lineHeight: 22,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    flex: 1,
  },
  cardFieldLabel: {
    fontFamily: 'EBGaramond-Medium',
    fontSize: FontSizes.body,
  },
  fieldRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  fieldColumn: {
    marginTop: 4,
  },
  detailPill: {
    backgroundColor: 'rgba(3, 2, 19, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  detailPillText: {
    fontSize: 12,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  metaItem: {
    flex: 1,
    backgroundColor: 'rgba(3, 2, 19, 0.04)',
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  metaLabel: {
    fontSize: 12,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  metaValue: {
    fontSize: FontSizes.subtitle,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  addButton: {
    marginTop: 8,
    backgroundColor: '#0A84FF',
    borderRadius: 18,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  verifiedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(10, 132, 255, 0.12)',
  },
  verifiedChipText: {
    fontSize: 12,
    color: '#0A84FF',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  modalOptionText: {
    flex: 1,
  },
  modalOptionTitle: {
    fontSize: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  modalOptionSubtitle: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  modalDivider: {
    height: 1,
    backgroundColor: 'rgba(3,2,19,0.08)',
  },
  modalLabel: {
    fontSize: 13,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  modalCancel: {
    backgroundColor: 'rgba(3,2,19,0.06)',
  },
  modalConfirm: {
    backgroundColor: '#0A84FF',
  },
  modalCancelText: {
    color: '#030213',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  modalConfirmText: {
    color: '#fff',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
});
