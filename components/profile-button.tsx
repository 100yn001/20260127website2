import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable } from 'react-native';
import { useArtworkTint } from '@/hooks/useArtworkTint';

export function ProfileButton() {
  const router = useRouter();
  const tint = useArtworkTint();
  return (
    <Pressable
      onPress={() => router.navigate('/profile')}
      accessibilityLabel="profile"
      className="h-8 w-8 overflow-hidden rounded-full"
    >
      <LinearGradient
        colors={[tint.a, tint.b]}
        start={{ x: 0.3, y: 0.25 }}
        end={{ x: 1, y: 1 }}
        style={{ width: '100%', height: '100%' }}
      />
    </Pressable>
  );
}
