import { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

export default function CardScene({
  imageUrl,
  textures,
  aspectRatio,
  onReady,
}: {
  svgString?: string;
  imageUrl?: string;
  /** Baked silver skin URLs; native shows the color map as a flat image. */
  textures?: { colorUrl: string; bumpUrl: string };
  aspectRatio: number;
  onReady?: () => void;
  /** Web-only; ignored on native. Present so consumers can be cross-platform. */
  onCanvasReady?: (canvas: any) => void;
}) {
  // Prefer the baked silver face over the raw artwork — the user should only
  // ever see the silver card.
  const displayUrl = textures?.colorUrl ?? imageUrl;

  useEffect(() => {
    if (displayUrl) onReady?.();
  }, [displayUrl, onReady]);

  return (
    <View style={styles.container}>
      {displayUrl ? (
        <Image
          source={{ uri: displayUrl }}
          style={{ width: '85%', aspectRatio, borderRadius: 12 }}
          resizeMode="contain"
        />
      ) : (
        <View style={[styles.placeholder, { aspectRatio }]} />
      )}
      <Text style={styles.note}>best viewed on web</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  placeholder: {
    width: '85%',
    backgroundColor: '#222',
    borderRadius: 12,
  },
  note: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: 'EBGaramond-Regular',
    fontSize: 13,
  },
});
