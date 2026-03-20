import NarratorArtwork, { getRandomNarratorColor } from '@/components/NarratorArtwork';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { auth, db } from '@/config/firebase';
import { FontSizes } from '@/constants/typography';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Narrator } from '@/types/narrator';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions
} from 'react-native';
import { LongPressGestureHandler, State } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

const ITEM_WIDTH = 184;
const ITEM_SPACING = 8;
const SNAP_INTERVAL = ITEM_WIDTH + ITEM_SPACING;

const UNSELECTED_SCALE = 144 / 176; // ≈ 0.818

interface WheelItemProps {
  narrator: Narrator;
  index: number;
  isSelected: boolean;
  colors: any;
  onPress: () => void;
  onLongPressActive: () => void;
  onLongPressEnd: () => void;
}

const WheelItem = React.memo(({ narrator, isSelected, colors, onPress, onLongPressActive, onLongPressEnd }: WheelItemProps) => {
  const animatedArtworkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(isSelected ? 1 : UNSELECTED_SCALE, { duration: 200 }) }],
    opacity: withTiming(isSelected ? 1 : 0.6, { duration: 200 }),
  }));

  return (
    <LongPressGestureHandler
      minDurationMs={200}
      onHandlerStateChange={(event: any) => {
        if (event.nativeEvent.state === State.ACTIVE) {
          onLongPressActive();
        } else if (event.nativeEvent.state === State.END || event.nativeEvent.state === State.CANCELLED) {
          onLongPressEnd();
        }
      }}
    >
      <TouchableOpacity
        style={[styles.wheelItem, { width: ITEM_WIDTH, marginRight: ITEM_SPACING }, Platform.OS === 'web' && { outline: 'none' } as any]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <Animated.View style={[styles.artworkWrapper, animatedArtworkStyle]}>
          <NarratorArtwork
            color={narrator.color || getRandomNarratorColor(narrator.id)}
            size={176}
          />
        </Animated.View>
        <Text
          style={[
            styles.wheelItemName,
            { color: isSelected ? colors.text : colors.textSecondary },
            isSelected && styles.wheelItemNameSelected,
          ]}
          numberOfLines={1}
        >
          {narrator.name}
        </Text>
      </TouchableOpacity>
    </LongPressGestureHandler>
  );
});

export default function NarratorsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { width: vw } = useWindowDimensions();
  const storyCols = Platform.OS === 'web' ? (vw >= 1024 ? 5 : vw >= 600 ? 4 : 3) : 3;
  const tileWidth = (vw - 48 - 12 * (storyCols - 1)) / storyCols;
  const [narrators, setNarrators] = useState<Narrator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const lastHapticIndex = useRef(0);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticScrollRef = useRef(false);

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const playVoicePreview = async (narrator: Narrator) => {
    if (!narrator.voicePreviewAudio) return;

    try {
      // If already playing, stop
      if (isPlayingPreview && sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
        setIsPlayingPreview(false);
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
      setIsPlayingPreview(true);

      newSound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlayingPreview(false);
          newSound.unloadAsync();
          setSound(null);
        }
      });
    } catch (error) {
      console.error('Error playing voice preview:', error);
      setIsPlayingPreview(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const narratorsRef = collection(db, 'users', user.uid, 'narrators');

    const unsubscribe = onSnapshot(narratorsRef, (snapshot) => {
      const narratorsList = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        } as Narrator;
      });

      setNarrators(narratorsList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const staticNarratorsRoute = '/static-narrators' as const;
  
  const selectedNarrator = narrators[selectedIndex];
  
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (programmaticScrollRef.current) return;
    const offsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / SNAP_INTERVAL);
    const clampedIndex = Math.max(0, Math.min(newIndex, narrators.length - 1));
    
    if (clampedIndex !== lastHapticIndex.current && clampedIndex >= 0 && clampedIndex < narrators.length) {
      lastHapticIndex.current = clampedIndex;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    setSelectedIndex(clampedIndex);
  }, [narrators.length]);
  
  const handleMomentumScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / SNAP_INTERVAL);
    const clampedIndex = Math.max(0, Math.min(newIndex, narrators.length - 1));
    setSelectedIndex(clampedIndex);
  }, [narrators.length]);
  
  const handleSelectNarrator = () => {
    if (!selectedNarrator) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/narrator-story',
      params: {
        narratorId: selectedNarrator.id,
        narratorName: selectedNarrator.name,
        narratorData: JSON.stringify(selectedNarrator),
      },
    });
  };

  const handleRemoveNarrator = useCallback(() => {
    if (!selectedNarrator) return;
    Alert.alert(
      'remove narrator',
      `remove ${selectedNarrator.name.toLowerCase()} from your library?`,
      [
        { text: 'cancel', style: 'cancel' },
        {
          text: 'remove',
          style: 'destructive',
          onPress: async () => {
            const user = auth.currentUser;
            if (!user) return;
            try {
              await deleteDoc(doc(db, 'users', user.uid, 'narrators', selectedNarrator.id));
              setSelectedIndex((prev) => Math.max(0, Math.min(prev, narrators.length - 2)));
            } catch (error) {
              console.error('Error removing narrator:', error);
              Alert.alert('could not remove', 'please try again.');
            }
          },
        },
      ]
    );
  }, [selectedNarrator, narrators.length]);

  // Keyboard arrow navigation (web only)
  useEffect(() => {
    if (Platform.OS !== 'web' || narrators.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => {
          const next = e.key === 'ArrowRight'
            ? Math.min(prev + 1, narrators.length - 1)
            : Math.max(prev - 1, 0);
          programmaticScrollRef.current = true;
          scrollViewRef.current?.scrollTo({ x: next * SNAP_INTERVAL, animated: true });
          setTimeout(() => { programmaticScrollRef.current = false; }, 350);
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [narrators.length]);

  const horizontalPadding = (vw - ITEM_WIDTH) / 2;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.headerBar, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>narrators</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.discoverButton}
            onPress={() => router.push(staticNarratorsRoute as never)}
          >
            <IconSymbol name="sparkles" size={16} color="#0A84FF" />
            <Text style={styles.discoverButtonText}>browse public</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.plusButton}
            onPress={() => router.push('/create-narrator')}
          >
            <IconSymbol name="plus" size={24} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Loading state */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      )}

      {/* Empty state */}
      {!isLoading && narrators.length === 0 && (
        <View style={styles.emptyState}>
          <IconSymbol name="waveform" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.text }]}>no narrators yet</Text>
          <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>create your first narrator to get started</Text>
          <TouchableOpacity
            style={styles.emptyCreateButton}
            onPress={() => router.push('/create-narrator')}
          >
            <IconSymbol name="plus" size={18} color="#fff" />
            <Text style={styles.emptyCreateButtonText}>create narrator</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Wheel carousel */}
      {!isLoading && narrators.length > 0 && (
        <View style={styles.mainContent}>
          {/* Narrator wheel */}
          <View style={[styles.wheelContainer, Platform.OS === 'web' && { outline: 'none' } as any]}>
            <ScrollView
              ref={scrollViewRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={SNAP_INTERVAL}
              decelerationRate="fast"
              contentContainerStyle={[
                styles.wheelContent,
                { paddingHorizontal: horizontalPadding }
              ]}
              onScroll={handleScroll}
              onMomentumScrollEnd={handleMomentumScrollEnd}
              scrollEventThrottle={16}
            >
              {narrators.map((narrator, index) => (
                <WheelItem
                  key={narrator.id}
                  narrator={narrator}
                  index={index}
                  isSelected={index === selectedIndex}
                  colors={colors}
                  onPress={() => {
                    programmaticScrollRef.current = true;
                    const targetOffset = index * SNAP_INTERVAL;
                    scrollViewRef.current?.scrollTo({ x: targetOffset, animated: true });
                    setTimeout(() => { programmaticScrollRef.current = false; }, 350);
                    setSelectedIndex(index);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  onLongPressActive={() => {
                    if (narrator.voicePreviewAudio) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      playVoicePreview(narrator);
                    }
                  }}
                  onLongPressEnd={() => {
                    if (sound) {
                      sound.stopAsync();
                      sound.unloadAsync();
                      setSound(null);
                      setIsPlayingPreview(false);
                    }
                  }}
                />
              ))}
            </ScrollView>
          </View>

          {/* Details card */}
          {selectedNarrator && (
            <View style={[styles.detailsCard, { backgroundColor: colors.card, borderColor: colors.border, width: '35%', alignSelf: 'center' as const }]}>
              <View style={styles.detailsHeader}>
                <View style={styles.titleBlock}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.detailsName, { color: colors.text }]}>
                      {selectedNarrator.name}
                    </Text>
                  </View>
                  {!!selectedNarrator.relationship && (
                    <Text style={[styles.detailsRelationship, { color: colors.textSecondary }]}>
                      {selectedNarrator.relationship}
                    </Text>
                  )}
                </View>
                <View style={styles.headerBadges}>
                  {selectedNarrator.isPublished && (
                    <View style={styles.verifiedChip}>
                      <IconSymbol name="checkmark.seal.fill" size={14} color="#0A84FF" />
                      <Text style={styles.verifiedChipText}>public</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.removeIconButton}
                    onPress={handleRemoveNarrator}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <IconSymbol name="trash" size={18} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.detailsActions}>
                <TouchableOpacity
                  style={[styles.viewStoriesButton, { borderColor: colors.border }]}
                  onPress={() => {
                    router.push({
                      pathname: '/narrator-stories',
                      params: {
                        narratorId: selectedNarrator.id,
                        narratorData: JSON.stringify(selectedNarrator),
                      },
                    });
                  }}
                >
                  <IconSymbol name="book.closed" size={16} color={colors.text} />
                  <Text style={[styles.viewStoriesText, { color: colors.text }]}>view stories</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={handleSelectNarrator}
                >
                  <IconSymbol name="sparkles" size={16} color="#fff" />
                  <Text style={styles.selectButtonText}>create story</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Page indicator */}
          <View style={styles.pageIndicator}>
            <Text style={[styles.pageIndicatorText, { color: colors.textSecondary }]}>
              {selectedIndex + 1} / {narrators.length}
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  discoverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(10, 132, 255, 0.12)',
  },
  discoverButtonText: {
    fontSize: 13,
    color: '#0A84FF',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  plusButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: FontSizes.subtitle,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  emptyHint: {
    fontSize: FontSizes.body,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    textAlign: 'center',
  },
  emptyCreateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0A84FF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    marginTop: 16,
  },
  emptyCreateButtonText: {
    fontSize: 15,
    color: '#fff',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
  },
  wheelContainer: {
    height: 245,
  },
  wheelContent: {
    alignItems: 'center',
  },
  wheelItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  artworkWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    opacity: 0.6,
  },
  artworkWrapperSelected: {
    opacity: 1,
    transform: [{ scale: 1 }],
  },
  wheelItemName: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    textAlign: 'center',
  },
  wheelItemNameSelected: {
    fontFamily: 'EBGaramond-Medium',
    fontSize: 15,
  },
  detailsCard: {
    marginHorizontal: 24,
    borderRadius: 16,
    padding: 16,
    marginTop: 24,
    borderWidth: 1,
    gap: 12,
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleBlock: {
    flexShrink: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voicePlayButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsName: {
    fontSize: 22,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  detailsRelationship: {
    marginTop: 4,
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  detailsUsername: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    color: '#717182',
  },
  detailsLabel: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
    width: 90,
  },
  detailsValue: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    flex: 1,
  },
  headerBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  removeIconButton: {
    padding: 8,
    borderRadius: 999,
  },
  genderLine: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  detailsActions: {
    flexDirection: 'row',
    gap: 12,
  },
  viewStoriesButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  viewStoriesText: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  selectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: '#0A84FF',
  },
  selectButtonText: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
    color: '#fff',
  },
  verifiedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: 'rgba(10, 132, 255, 0.12)',
  },
  verifiedChipText: {
    fontSize: 11,
    color: '#0A84FF',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  pageIndicator: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  pageIndicatorText: {
    fontSize: 13,
    fontFamily: 'EBGaramond-Regular',
  },
});
