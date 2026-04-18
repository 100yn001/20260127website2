import { Image, StyleSheet, Text, View } from 'react-native';

export default function CardScene({
  imageUrl,
  aspectRatio,
}: {
  svgString?: string;
  imageUrl?: string;
  aspectRatio: number;
}) {
  return (
    <View style={styles.container}>
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
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
