import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable } from 'react-native';

export function ProfileButton() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.navigate('/profile')}
      accessibilityLabel="profile"
      className="h-8 w-8 overflow-hidden rounded-full"
    >
      <LinearGradient
        colors={['#e8d2c1', '#a37257']}
        start={{ x: 0.3, y: 0.25 }}
        end={{ x: 1, y: 1 }}
        style={{ width: '100%', height: '100%' }}
      />
    </Pressable>
  );
}
