import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/ThemeContext';

export default function TabLayout() {
  // Suppress browser focus outlines on tab bar elements (web only)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.textContent = '[role="tablist"] * { outline: none !important; }';
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);
  const { colors, isFullscreen } = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.cardActive,
        tabBarInactiveTintColor: colors.tabText,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: isFullscreen
          ? { display: 'none' as const }
          : {
              backgroundColor: colors.tabBackground,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingBottom: Platform.OS === 'ios' ? 20 : Platform.OS === 'web' ? 8 : 5,
              height: Platform.OS === 'ios' ? 85 : 60,
            },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '400',
          textTransform: 'lowercase',
          fontFamily: 'EBGaramond-Regular',
        },
      }}>
      <Tabs.Screen
        name="library"
        options={{
          title: 'library',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="book.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="narrators"
        options={{
          title: 'narrators',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="waveform" color={color} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'create',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="plus.circle.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="mystories"
        options={{
          title: 'stories',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="clock.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'profile',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="person.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="recipe"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="bookmarks"
        options={{
          href: null,
        }}
      />
      {/* Hide the old screens */}
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="mystories-new"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="mystories-old"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
