import { auth } from '@/config/firebase';
import { describeLandscapeFromStyle, describeStorytellingStyle } from '@/services/claude-service';
import { generateTarotCard } from '@/services/replicate-service';
import { saveSilverCard } from '@/services/user-service';
import { useEffect, useState } from 'react';
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

type Stage = 'styling' | 'landscape' | 'painting' | 'tracing' | 'ready' | 'error';

const STAGE_COPY: Record<Exclude<Stage, 'ready' | 'error'>, string> = {
  styling: 'finding your voice',
  landscape: 'dreaming a landscape',
  painting: 'painting your card',
  tracing: 'pouring the silver',
};

export default function CardStage({
  answers,
  uid,
  onContinue,
}: {
  answers: Record<string, unknown>;
  uid: string | null;
  onContinue: () => void;
}) {
  const [stage, setStage] = useState<Stage>('styling');
  const [svgString, setSvgString] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setStage('styling');
        const styleWords = await describeStorytellingStyle(answers);
        if (cancelled) return;

        setStage('landscape');
        const landscape = await describeLandscapeFromStyle(styleWords);
        if (cancelled) return;

        setStage('painting');
        const { dataUrl, remoteUrl } = await generateTarotCard(landscape);
        if (cancelled) return;
        setImageUrl(dataUrl);

        const activeUid = uid ?? auth.currentUser?.uid ?? null;
        if (activeUid) {
          saveSilverCard(activeUid, {
            storytellingWords: styleWords,
            landscapePrompt: landscape,
            imageUrl: remoteUrl,
          }).catch((err) => console.warn('saveSilverCard failed:', err));
        }

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
  }, [answers, uid]);

  if (stage === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>something broke</Text>
        {errorMsg ? <Text style={styles.errorDetail}>{errorMsg}</Text> : null}
        <TouchableOpacity style={styles.button} onPress={onContinue}>
          <Text style={styles.buttonText}>continue →</Text>
        </TouchableOpacity>
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

  return (
    <View style={styles.container}>
      <View style={styles.sceneWrap}>
        {Platform.OS === 'web' && svgString ? (
          <CardScene svgString={svgString} aspectRatio={aspectRatio} />
        ) : (
          <CardScene
            svgString={svgString ?? undefined}
            imageUrl={imageUrl ?? undefined}
            aspectRatio={aspectRatio}
          />
        )}
      </View>
      <TouchableOpacity style={styles.button} onPress={onContinue}>
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
