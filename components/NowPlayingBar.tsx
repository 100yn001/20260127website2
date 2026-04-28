import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAudioPlayer } from '@/contexts/AudioPlayerContext';
import { useTheme } from '@/contexts/ThemeContext';
import { coverFor } from '@/lib/cover';
import { createShadow } from '@/utils/shadow';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

const SWIPE_THRESHOLD_RATIO = 0.25;
const VELOCITY_THRESHOLD = 500;
const DESKTOP_BREAKPOINT = 768;

export const NowPlayingBar = () => {
  const { currentTrack, isPlaying, isLoading, togglePlayPause, stop } = useAudioPlayer();
  const { colors } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  const [windowWidth, setWindowWidth] = useState(() => Dimensions.get('window').width);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setWindowWidth(window.width));
    return () => sub.remove();
  }, []);
  const isDesktop = Platform.OS === 'web' && windowWidth >= DESKTOP_BREAKPOINT;

  const animatedBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  const cover = useMemo(
    () => coverFor(currentTrack?.id || currentTrack?.coverColor || currentTrack?.title),
    [currentTrack?.id, currentTrack?.coverColor, currentTrack?.title],
  );

  // Hide on player screen and create workflow screens
  const createWorkflowPaths = [
    '/player',
    '/story-details',
    '/create',
    '/recipe',
    '/followup',
    '/character-quiz',
    '/create-narrator',
    '/loading',
    '/regenerate',
    '/narrator-story',
    '/narrator-selection',
    '/narrator-stories',
    '/static-narrators',
    '/voice-library',
  ];

  if (createWorkflowPaths.some((path) => pathname === path || pathname.endsWith(path))) return null;
  if (!currentTrack) return null;

  const handlePress = () => {
    router.push({
      pathname: '/player',
      params: {
        id: currentTrack.id || '',
        storyId: currentTrack.id || '',
        audioUrl: encodeURIComponent(currentTrack.audioUrl),
        audioChunkURLs: currentTrack.audioChunkURLs?.length ? JSON.stringify(currentTrack.audioChunkURLs) : '',
        transcript: currentTrack.transcript || '',
        title: currentTrack.title || '',
        coverColor: currentTrack.coverColor || '',
        topographyLayers: currentTrack.topographyLayers ? JSON.stringify(currentTrack.topographyLayers) : '',
        fromMiniPlayer: 'true',
      },
    });
  };

  const dismissPlayer = () => {
    stop();
  };

  const screenWidth = Dimensions.get('window').width;
  const swipeThreshold = screenWidth * SWIPE_THRESHOLD_RATIO;

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onUpdate((event) => {
      translateX.value = event.translationX;
      opacity.value = 1 - Math.min(0.8, Math.abs(event.translationX) / screenWidth);
    })
    .onEnd((event) => {
      const swipedPastThreshold = Math.abs(event.translationX) > swipeThreshold;
      const flung = Math.abs(event.velocityX) > VELOCITY_THRESHOLD;

      if (swipedPastThreshold || flung) {
        const direction = event.translationX < 0 ? -1 : 1;
        const distance = screenWidth - Math.abs(event.translationX);
        const velocity = Math.max(Math.abs(event.velocityX), 800);
        const dismissDuration = Math.min(300, Math.max(100, (distance / velocity) * 1000));

        translateX.value = withTiming(direction * screenWidth, { duration: dismissDuration });
        opacity.value = withTiming(0, { duration: dismissDuration }, () => {
          runOnJS(dismissPlayer)();
        });
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
        opacity.value = withSpring(1);
      }
    });

  const PlayPauseButton = (
    <TouchableOpacity
      style={[styles.playButton, { backgroundColor: '#000' }]}
      onPress={(e) => {
        e.stopPropagation();
        togglePlayPause();
      }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <IconSymbol name={isPlaying ? 'pause.fill' : 'play.fill'} size={18} color="#fff" />
      )}
    </TouchableOpacity>
  );

  if (isDesktop) {
    return (
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.desktopWrapper, animatedBarStyle]}>
          <TouchableOpacity
            style={[styles.desktopContainer, { backgroundColor: 'rgba(26, 26, 31, 0.92)' }]}
            onPress={handlePress}
            activeOpacity={0.92}
          >
            <View style={styles.desktopArtwork}>
              <LinearGradient
                colors={[cover.a, cover.b]}
                start={{ x: 0.28, y: 0.22 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </View>
            <View style={styles.desktopFooter}>
              <View style={styles.desktopTextContainer}>
                <Text style={[styles.desktopTitle, { color: colors.text }]} numberOfLines={1}>
                  {currentTrack.title}
                </Text>
                {currentTrack.subtitle ? (
                  <Text
                    style={[styles.desktopSubtitle, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {currentTrack.subtitle}
                  </Text>
                ) : null}
              </View>
              {PlayPauseButton}
            </View>
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    );
  }

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.mobileWrapper, animatedBarStyle]}>
        <TouchableOpacity
          style={[
            styles.mobileContainer,
            { backgroundColor: 'rgba(26, 26, 31, 0.85)' },
            Platform.OS === 'web' && ({ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' } as any),
          ]}
          onPress={handlePress}
          activeOpacity={0.9}
        >
          <View style={styles.mobileContent}>
            <View style={styles.mobileTrackInfo}>
              <View style={styles.mobileArtwork}>
                <LinearGradient
                  colors={[cover.a, cover.b]}
                  start={{ x: 0.28, y: 0.22 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              </View>
              <View style={styles.mobileTextContainer}>
                <Text style={[styles.mobileTitle, { color: colors.text }]} numberOfLines={1}>
                  {currentTrack.title}
                </Text>
                {currentTrack.subtitle ? (
                  <Text
                    style={[styles.mobileSubtitle, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {currentTrack.subtitle}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.mobileControls}>{PlayPauseButton}</View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
};

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 85 : 60;
const DESKTOP_SQUARE_SIZE = 240;

const styles = StyleSheet.create({
  // Mobile bar (full-width along the bottom, above the tab bar)
  mobileWrapper: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: TAB_BAR_HEIGHT + 8,
  },
  mobileContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    ...createShadow('#000', 0, 2, 8, 0.25, 5),
  },
  mobileContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mobileTrackInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  mobileArtwork: {
    width: 44,
    height: 44,
    borderRadius: 6,
    marginRight: 12,
    overflow: 'hidden',
  },
  mobileTextContainer: {
    flex: 1,
  },
  mobileTitle: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'EBGaramond-Medium',
  },
  mobileSubtitle: {
    fontSize: 12,
    fontFamily: 'EBGaramond-Regular',
    marginTop: 2,
  },
  mobileControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Desktop square card (bottom-right corner)
  desktopWrapper: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: DESKTOP_SQUARE_SIZE,
  },
  desktopContainer: {
    width: DESKTOP_SQUARE_SIZE,
    height: DESKTOP_SQUARE_SIZE,
    borderRadius: 10,
    overflow: 'hidden',
    ...createShadow('#000', 0, 8, 24, 0.4, 10),
  },
  desktopArtwork: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  desktopFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  desktopTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  desktopTitle: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'EBGaramond-Medium',
  },
  desktopSubtitle: {
    fontSize: 12,
    fontFamily: 'EBGaramond-Regular',
    marginTop: 2,
  },

  // Slightly-rounded black play/pause button (shared)
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default NowPlayingBar;
