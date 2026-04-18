import { Component, ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import CardScene from './CardScene';

export type SilverCardResult = {
  storytellingWords: string;
  landscapePrompt: string;
  imageUrl: string;
  archetypeTitle?: string;
};

class SceneErrorBoundary extends Component<
  { fallback: (msg: string) => ReactNode; children: ReactNode },
  { msg: string | null }
> {
  state = { msg: null as string | null };
  static getDerivedStateFromError(err: unknown) {
    return { msg: err instanceof Error ? err.message : String(err) };
  }
  componentDidCatch(err: unknown) {
    console.error('[CardScene] render failed:', err);
  }
  render() {
    if (this.state.msg) return this.props.fallback(this.state.msg);
    return this.props.children;
  }
}

export default function CardStage({
  svgString,
  imageUrl,
  dims,
  archetypeTitle,
  error,
  onContinue,
}: {
  svgString: string | null;
  imageUrl: string | null;
  dims: { width: number; height: number } | null;
  archetypeTitle: string | null;
  error: string | null;
  onContinue: () => void;
}) {
  const [painted, setPainted] = useState(false);
  const [overlayMounted, setOverlayMounted] = useState(true);

  const overlayOpacity = useSharedValue(1);
  const titleOpacity = useSharedValue(0);
  const buttonOpacity = useSharedValue(0);

  useEffect(() => {
    if (!painted) return;
    // Hold the opaque overlay over the canvas until WebGL has actually
    // drawn the textured card — then fade the overlay out to reveal it.
    overlayOpacity.value = withDelay(120, withTiming(0, { duration: 900 }));
    titleOpacity.value = withDelay(900, withTiming(1, { duration: 900 }));
    buttonOpacity.value = withDelay(1500, withTiming(1, { duration: 800 }));
    const t = setTimeout(() => setOverlayMounted(false), 1100);
    return () => clearTimeout(t);
  }, [painted, overlayOpacity, titleOpacity, buttonOpacity]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const titleStyle = useAnimatedStyle(() => ({ opacity: titleOpacity.value }));
  const buttonStyle = useAnimatedStyle(() => ({ opacity: buttonOpacity.value }));

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>something broke</Text>
        <Text style={styles.errorDetail}>{error}</Text>
      </View>
    );
  }

  const aspectRatio = dims ? dims.width / dims.height : 2 / 3;
  const sceneReady =
    Platform.OS === 'web' ? !!(svgString && dims) : !!(imageUrl && dims);

  const sceneFallback = (msg: string) => (
    <View style={styles.center}>
      <Text style={styles.errorDetail}>3D render failed: {msg}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.sceneWrap}>
        {/* The 3D canvas sits at the bottom and renders as soon as it can,
            but it stays hidden behind the opaque black overlay until WebGL
            has finished drawing the textured mesh. */}
        {sceneReady ? (
          <View
            style={StyleSheet.absoluteFill}
            pointerEvents={overlayMounted ? 'none' : 'auto'}
          >
            <SceneErrorBoundary fallback={sceneFallback}>
              {Platform.OS === 'web' && svgString ? (
                <CardScene
                  svgString={svgString}
                  aspectRatio={aspectRatio}
                  onReady={() => setPainted(true)}
                />
              ) : (
                <CardScene
                  svgString={svgString ?? undefined}
                  imageUrl={imageUrl ?? undefined}
                  aspectRatio={aspectRatio}
                  onReady={() => setPainted(true)}
                />
              )}
            </SceneErrorBoundary>
          </View>
        ) : null}

        {overlayMounted && (
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]}
            pointerEvents="none"
          >
            <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
            <Text style={styles.subtleText}>painting your card…</Text>
          </Animated.View>
        )}
      </View>

      {archetypeTitle ? (
        <Animated.View style={[styles.titleWrap, titleStyle]} pointerEvents="none">
          <Text style={styles.titleText}>{archetypeTitle}</Text>
        </Animated.View>
      ) : null}

      <Animated.View
        style={[styles.buttonWrap, buttonStyle]}
        pointerEvents={painted ? 'auto' : 'none'}
      >
        <TouchableOpacity onPress={onContinue} activeOpacity={0.6}>
          <Text style={styles.buttonText}>continue →</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  sceneWrap: {
    flex: 1,
    width: '100%',
    position: 'relative',
  },
  overlay: {
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  subtleText: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'EBGaramond-Regular',
    fontSize: 14,
  },
  errorTitle: {
    color: '#fff',
    fontFamily: 'EBGaramond-Medium',
    fontSize: 20,
  },
  errorDetail: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'EBGaramond-Regular',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  titleWrap: {
    position: 'absolute',
    bottom: 96,
    paddingHorizontal: 24,
  },
  titleText: {
    color: '#fff',
    fontFamily: 'EBGaramond-Italic',
    fontStyle: 'italic',
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 1.5,
  },
  buttonWrap: {
    position: 'absolute',
    bottom: 32,
  },
  buttonText: {
    color: '#fff',
    fontFamily: 'EBGaramond-Medium',
    fontSize: 16,
  },
});
