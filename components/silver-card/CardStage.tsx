import { describeLandscapeFromStyle, describeStorytellingStyle } from '@/services/claude-service';
import { generateTarotCard } from '@/services/replicate-service';
import { Component, ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
  answers,
  onContinue,
}: {
  answers: Record<string, unknown>;
  onContinue: (result: SilverCardResult) => void;
}) {
  const [svgString, setSvgString] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [storyWords, setStoryWords] = useState<string | null>(null);
  const [landscape, setLandscape] = useState<string | null>(null);
  const [remoteImageUrl, setRemoteImageUrl] = useState<string | null>(null);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cardReady, setCardReady] = useState(false);

  const headerOpacity = useSharedValue(0);
  const cardOpacity = useSharedValue(0);
  const buttonOpacity = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const styleWords = await describeStorytellingStyle(answers);
        if (cancelled) return;
        setStoryWords(styleWords);
        headerOpacity.value = withTiming(1, { duration: 1400 });

        const landscapePrompt = await describeLandscapeFromStyle(styleWords);
        if (cancelled) return;
        setLandscape(landscapePrompt);

        const { dataUrl, remoteUrl } = await generateTarotCard(landscapePrompt);
        if (cancelled) return;
        setImageUrl(dataUrl);
        setRemoteImageUrl(remoteUrl);

        if (Platform.OS === 'web') {
          const { vectorizeImage } = await import('@/services/vectorize');
          const { svg, width, height } = await vectorizeImage(dataUrl);
          if (cancelled) return;
          setSvgString(svg);
          setDims({ width, height });
        } else {
          const imgDims = await new Promise<{ width: number; height: number }>((resolve) => {
            Image.getSize(
              dataUrl,
              (width, height) => resolve({ width, height }),
              () => resolve({ width: 2, height: 3 }),
            );
          });
          if (cancelled) return;
          setDims(imgDims);
        }

        if (!cancelled) {
          setCardReady(true);
          cardOpacity.value = withDelay(300, withTiming(1, { duration: 1600 }));
          buttonOpacity.value = withDelay(2100, withTiming(1, { duration: 900 }));
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[CardStage] pipeline failed:', err);
        setErrorMsg(err instanceof Error ? err.message : String(err));
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [answers]);

  const headerStyle = useAnimatedStyle(() => ({ opacity: headerOpacity.value }));
  const cardAnimStyle = useAnimatedStyle(() => ({ opacity: cardOpacity.value }));
  const buttonStyle = useAnimatedStyle(() => ({ opacity: buttonOpacity.value }));

  const handleContinue = () => {
    if (!storyWords || !landscape || !remoteImageUrl) return;
    onContinue({
      storytellingWords: storyWords,
      landscapePrompt: landscape,
      imageUrl: remoteImageUrl,
    });
  };

  if (errorMsg) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>something broke</Text>
        <Text style={styles.errorDetail}>{errorMsg}</Text>
      </View>
    );
  }

  if (!storyWords) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color="#ffffff" />
        <Text style={styles.loadingText}>finding your voice</Text>
      </View>
    );
  }

  const aspectRatio = dims ? dims.width / dims.height : 2 / 3;

  const sceneFallback = (msg: string) => (
    <View style={styles.center}>
      <Text style={styles.errorDetail}>3D render failed: {msg}</Text>
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={{ width: 240, aspectRatio, borderRadius: 12, marginTop: 16 }}
          resizeMode="contain"
        />
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.headerWrap, headerStyle]}>
        <Text style={styles.styleHeader}>
          you&apos;re a <Text style={styles.styleWords}>{storyWords}</Text>
          {'\n'}kind of storyteller
        </Text>
      </Animated.View>

      <View style={styles.sceneWrap}>
        {cardReady ? (
          <Animated.View style={[styles.sceneFill, cardAnimStyle]}>
            <SceneErrorBoundary fallback={sceneFallback}>
              {Platform.OS === 'web' && svgString ? (
                <CardScene svgString={svgString} aspectRatio={aspectRatio} />
              ) : (
                <CardScene
                  svgString={svgString ?? undefined}
                  imageUrl={imageUrl ?? undefined}
                  aspectRatio={aspectRatio}
                />
              )}
            </SceneErrorBoundary>
          </Animated.View>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
            <Text style={styles.subtleText}>painting your card…</Text>
          </View>
        )}
      </View>

      {cardReady ? (
        <Animated.View style={[styles.buttonWrap, buttonStyle]}>
          <TouchableOpacity style={styles.button} onPress={handleContinue}>
            <Text style={styles.buttonText}>continue →</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    paddingBottom: 48,
  },
  headerWrap: {
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  styleHeader: {
    color: '#fff',
    fontFamily: 'EBGaramond-Regular',
    fontSize: 20,
    textAlign: 'center',
    lineHeight: 28,
  },
  styleWords: {
    fontStyle: 'italic',
  },
  sceneWrap: {
    flex: 1,
    width: '100%',
  },
  sceneFill: {
    flex: 1,
    width: '100%',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#fff',
    fontFamily: 'EBGaramond-Regular',
    fontSize: 18,
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
  buttonWrap: {
    position: 'absolute',
    bottom: 48,
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
