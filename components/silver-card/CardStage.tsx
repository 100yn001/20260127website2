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

  const cardOpacity = useSharedValue(0);
  const placeholderOpacity = useSharedValue(1);
  const titleOpacity = useSharedValue(0);
  const buttonOpacity = useSharedValue(0);

  useEffect(() => {
    if (!painted) return;
    cardOpacity.value = withTiming(1, { duration: 1200 });
    placeholderOpacity.value = withTiming(0, { duration: 700 });
    titleOpacity.value = withDelay(900, withTiming(1, { duration: 1100 }));
    buttonOpacity.value = withDelay(1800, withTiming(1, { duration: 900 }));
  }, [painted, cardOpacity, placeholderOpacity, titleOpacity, buttonOpacity]);

  const cardStyle = useAnimatedStyle(() => ({ opacity: cardOpacity.value }));
  const placeholderStyle = useAnimatedStyle(() => ({ opacity: placeholderOpacity.value }));
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
        {sceneReady ? (
          <Animated.View
            style={[StyleSheet.absoluteFill, cardStyle]}
            pointerEvents={painted ? 'auto' : 'none'}
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
          </Animated.View>
        ) : null}

        {!painted && (
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.center, placeholderStyle]}
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
        <TouchableOpacity style={styles.button} onPress={onContinue}>
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
    paddingTop: 32,
    paddingBottom: 32,
    backgroundColor: '#000',
  },
  sceneWrap: {
    flex: 1,
    width: '100%',
    position: 'relative',
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
    paddingHorizontal: 24,
    marginTop: 8,
    marginBottom: 16,
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
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#fff',
    fontFamily: 'EBGaramond-Medium',
    fontSize: 16,
  },
});
