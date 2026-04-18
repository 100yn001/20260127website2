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

type Stage = 'styling' | 'landscape' | 'painting' | 'tracing' | 'ready' | 'error';

const STAGE_COPY: Record<Exclude<Stage, 'ready' | 'error'>, string> = {
  styling: 'finding your voice',
  landscape: 'dreaming a landscape',
  painting: 'painting your card',
  tracing: 'pouring the silver',
};

export default function CardStage({
  answers,
  onContinue,
}: {
  answers: Record<string, unknown>;
  onContinue: (result: SilverCardResult) => void;
}) {
  const [stage, setStage] = useState<Stage>('styling');
  const [svgString, setSvgString] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [storyWords, setStoryWords] = useState<string | null>(null);
  const [landscape, setLandscape] = useState<string | null>(null);
  const [remoteImageUrl, setRemoteImageUrl] = useState<string | null>(null);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setStage('styling');
        const styleWords = await describeStorytellingStyle(answers);
        if (cancelled) return;
        setStoryWords(styleWords);

        setStage('landscape');
        const landscapePrompt = await describeLandscapeFromStyle(styleWords);
        if (cancelled) return;
        setLandscape(landscapePrompt);

        setStage('painting');
        const { dataUrl, remoteUrl } = await generateTarotCard(landscapePrompt);
        if (cancelled) return;
        setImageUrl(dataUrl);
        setRemoteImageUrl(remoteUrl);

        if (Platform.OS === 'web') {
          setStage('tracing');
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

        if (!cancelled) setStage('ready');
      } catch (err) {
        if (cancelled) return;
        console.error('[CardStage] pipeline failed:', err);
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStage('error');
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [answers]);

  const handleContinue = () => {
    if (!storyWords || !landscape || !remoteImageUrl) return;
    onContinue({
      storytellingWords: storyWords,
      landscapePrompt: landscape,
      imageUrl: remoteImageUrl,
    });
  };

  if (stage === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>something broke</Text>
        {errorMsg ? <Text style={styles.errorDetail}>{errorMsg}</Text> : null}
      </View>
    );
  }

  if (stage !== 'ready') {
    const copy = STAGE_COPY[stage];
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color="#ffffff" />
        <Text style={styles.loadingText}>{copy}</Text>
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
      {storyWords ? (
        <Text style={styles.styleHeader}>
          you&apos;re a <Text style={styles.styleWords}>{storyWords}</Text> kind of storyteller
        </Text>
      ) : null}
      <View style={styles.sceneWrap}>
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
      </View>
      <TouchableOpacity style={styles.button} onPress={handleContinue}>
        <Text style={styles.buttonText}>continue →</Text>
      </TouchableOpacity>
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
  },
  styleHeader: {
    color: '#fff',
    fontFamily: 'EBGaramond-Regular',
    fontSize: 18,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  styleWords: {
    fontStyle: 'italic',
  },
  sceneWrap: {
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
  button: {
    position: 'absolute',
    bottom: 48,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#fff',
    fontFamily: 'EBGaramond-Medium',
    fontSize: 16,
  },
});
