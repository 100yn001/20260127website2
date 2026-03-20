import TopographicArtwork from '@/components/TopographicArtwork';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAudioPlayer } from '@/contexts/AudioPlayerContext';
import { useTheme } from '@/contexts/ThemeContext';
import { createShadow } from '@/utils/shadow';
import { usePathname, useRouter } from 'expo-router';
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

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
const VELOCITY_THRESHOLD = 500;

const formatTime = (millis: number): string => {
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const NowPlayingBar = () => {
  const { currentTrack, isPlaying, isLoading, togglePlayPause, stop, position, duration } = useAudioPlayer();
  const { colors } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  const animatedBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

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
  
  if (createWorkflowPaths.some(path => pathname === path || pathname.endsWith(path))) return null;
  if (!currentTrack) return null;

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  const handlePress = () => {
    router.push({
      pathname: '/player',
      params: {
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

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onUpdate((event) => {
      translateX.value = event.translationX;
      opacity.value = 1 - Math.min(0.8, Math.abs(event.translationX) / SCREEN_WIDTH);
    })
    .onEnd((event) => {
      const swipedPastThreshold = Math.abs(event.translationX) > SWIPE_THRESHOLD;
      const flung = Math.abs(event.velocityX) > VELOCITY_THRESHOLD;

      if (swipedPastThreshold || flung) {
        // Dismiss in the direction of the swipe
        const direction = event.translationX < 0 ? -1 : 1;
        const distance = SCREEN_WIDTH - Math.abs(event.translationX);
        const velocity = Math.max(Math.abs(event.velocityX), 800);
        const dismissDuration = Math.min(300, Math.max(100, (distance / velocity) * 1000));

        translateX.value = withTiming(direction * SCREEN_WIDTH, { duration: dismissDuration });
        opacity.value = withTiming(0, { duration: dismissDuration }, () => {
          runOnJS(dismissPlayer)();
        });
      } else {
        // Snap back
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
        opacity.value = withSpring(1);
      }
    });

  return (
    <GestureDetector gesture={panGesture}>
    <Animated.View style={[styles.wrapper, animatedBarStyle]}>
      <TouchableOpacity
        style={[styles.container, { backgroundColor: colors.card }]}
        onPress={handlePress}
        activeOpacity={0.9}
      >
        <View style={styles.content}>
        {/* Track info */}
        <View style={styles.trackInfo}>
          <View style={styles.artwork}>
            <TopographicArtwork
              baseColor={currentTrack.coverColor || '#7f1d1d'}
              layers={currentTrack.topographyLayers}
              size={44}
            />
          </View>
          <View style={styles.textContainer}>
            <Text
              style={[styles.title, { color: colors.text }]}
              numberOfLines={1}
            >
              {currentTrack.title}
            </Text>
            {currentTrack.subtitle && (
              <Text
                style={[styles.subtitle, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {currentTrack.subtitle}
              </Text>
            )}
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.playButton, { backgroundColor: colors.text }]}
            onPress={(e) => {
              e.stopPropagation();
              togglePlayPause();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <IconSymbol
                name={isPlaying ? 'pause.fill' : 'play.fill'}
                size={18}
                color={colors.background}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress bar at bottom */}
      <View style={[styles.progressBar, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
        <View
          style={[
            styles.progressFill,
            { width: `${progress}%`, backgroundColor: colors.text },
          ]}
        />
      </View>
    </TouchableOpacity>
  </Animated.View>
  </GestureDetector>
  );
};

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 85 : Platform.OS === 'web' ? 60 : 60;

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: TAB_BAR_HEIGHT + 8,
  },
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    ...createShadow('#000', 0, 2, 8, 0.25, 5),
  },
  progressBar: {
    height: 3,
    width: '100%',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  trackInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  artwork: {
    width: 44,
    height: 44,
    borderRadius: 12,
    marginRight: 12,
    overflow: 'hidden',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'EBGaramond-Medium',
  },
  subtitle: {
    fontSize: 12,
    fontFamily: 'EBGaramond-Regular',
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default NowPlayingBar;
