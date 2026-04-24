import { LinearGradient } from 'expo-linear-gradient';
import * as React from 'react';
import { View } from 'react-native';

export function NarratorAvatar({
  a,
  b,
  size = 56,
}: {
  a: string;
  b: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
      }}
    >
      <LinearGradient
        colors={[a, b]}
        start={{ x: 0.3, y: 0.25 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1 }}
      />
    </View>
  );
}
