import { Slot } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { BottomTabs } from '@/components/bottom-tabs';

export default function TabLayout() {
  return (
    <View className="flex-1 bg-background">
      <Slot />
      <BottomTabs />
    </View>
  );
}
