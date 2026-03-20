// Native: Register RNTP playback service (must be at module level, outside React)
import TrackPlayer from 'react-native-track-player';

TrackPlayer.registerPlaybackService(() => require('@/services/track-player-service'));
