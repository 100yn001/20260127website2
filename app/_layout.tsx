import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Component, ReactNode, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

// Register RNTP playback service — no-op on web via .web.ts variant
import '@/services/track-player-init';

import NowPlayingBar from '@/components/NowPlayingBar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { AudioPlayerProvider } from '@/contexts/AudioPlayerContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { StoryQueueProvider } from '@/contexts/StoryQueueContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoadedFonts } from '@/hooks/use-loaded-fonts';
import { Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';

class RootErrorBoundary extends Component<
  { children: ReactNode },
  { err: Error | null }
> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error, info: unknown) {
    console.error('[RootErrorBoundary]', err, info);
  }
  render() {
    if (!this.state.err) return this.props.children;
    const msg = this.state.err.message || String(this.state.err);
    const stack = this.state.err.stack || '';
    return (
      <View style={{ flex: 1, backgroundColor: '#000', padding: 24, paddingTop: 64 }}>
        <ScrollView>
          <Text style={{ color: '#fff', fontSize: 20, marginBottom: 12 }}>something broke</Text>
          <Text selectable style={{ color: '#ff8888', fontSize: 14, marginBottom: 16 }}>{msg}</Text>
          <Text selectable style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
            {stack}
          </Text>
        </ScrollView>
      </View>
    );
  }
}

// Keep splash screen visible while loading fonts
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: 'index',
};

function FullscreenButton() {
  const { isFullscreen, toggleFullscreen } = useTheme();
  const pathname = usePathname();
  const isOnPlayer = pathname === '/player';

  // Exit fullscreen when navigating away from the player
  useEffect(() => {
    if (!isOnPlayer && isFullscreen) {
      toggleFullscreen();
    }
  }, [isOnPlayer]);

  if (Platform.OS !== 'web' || !isOnPlayer) return null;
  return (
    <TouchableOpacity
      onPress={toggleFullscreen}
      activeOpacity={0.7}
      style={{
        position: 'absolute',
        right: 16,
        bottom: isFullscreen ? 16 : 76,
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isFullscreen ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.35)',
        zIndex: 999,
      }}
    >
      <IconSymbol
        name={isFullscreen ? 'arrow.down.right.and.arrow.up.left' : 'arrow.up.left.and.arrow.down.right'}
        size={16}
        color="#fff"
      />
    </TouchableOpacity>
  );
}

export default function RootLayout() {
  const _colorScheme = useColorScheme();
  const fontsLoaded = useLoadedFonts();

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <RootErrorBoundary>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <AudioPlayerProvider>
            <StoryQueueProvider>
              <View style={{ flex: 1 }}>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="index" options={{ headerShown: false }} />
                  <Stack.Screen name="onboarding" options={{ headerShown: false }} />
                  <Stack.Screen name="auth" options={{ headerShown: false }} />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="followup" options={{ headerShown: false }} />
                  <Stack.Screen name="character-quiz" options={{ headerShown: false }} />
                  <Stack.Screen name="create-narrator" options={{ headerShown: false }} />
                  <Stack.Screen name="regenerate" options={{ headerShown: false }} />
                  <Stack.Screen name="voice-library" options={{ headerShown: false }} />
                  <Stack.Screen name="narrator-story" options={{ headerShown: false }} />
                  <Stack.Screen name="narrator-selection" options={{ headerShown: false }} />
                  <Stack.Screen name="narrator-stories" options={{ headerShown: false }} />
                  <Stack.Screen name="static-narrators" options={{ headerShown: false }} />
                  <Stack.Screen name="story-details" options={{ headerShown: false }} />
                  <Stack.Screen name="loading" options={{ headerShown: false }} />
                  <Stack.Screen name="player" options={{ headerShown: false }} />
                  <Stack.Screen name="modal" options={{ headerShown: false, presentation: 'modal' }} />
                </Stack>
                <NowPlayingBar />
                <FullscreenButton />
              </View>
              <StatusBar style="light" />
            </StoryQueueProvider>
          </AudioPlayerProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
    </RootErrorBoundary>
  );
}
