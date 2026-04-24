import { BlurView } from 'expo-blur';
import { useRouter, useSegments } from 'expo-router';
import { Archive, Library as LibraryIcon, Sparkles, Users } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import * as React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { cn } from '@/lib/cn';

type Tab = {
  to: string;
  label: string;
  icon: (color: string) => React.ReactNode;
  match: (pathname: string) => boolean;
};

const ICON = 18;

const tabs: Tab[] = [
  {
    to: '/(tabs)/library',
    label: 'library',
    icon: (c) => <LibraryIcon size={ICON} color={c} />,
    match: (s) => s.includes('library'),
  },
  {
    to: '/(tabs)/narrators',
    label: 'narrators',
    icon: (c) => <Users size={ICON} color={c} />,
    match: (s) => s.includes('narrators'),
  },
  {
    to: '/(tabs)/create',
    label: 'create',
    icon: (c) => <Sparkles size={ICON} color={c} />,
    match: (s) => s.includes('create'),
  },
  {
    to: '/(tabs)/vault',
    label: 'vault',
    icon: (c) => <Archive size={ICON} color={c} />,
    match: (s) => s.includes('vault') || s.includes('mystories'),
  },
];

export function BottomTabs() {
  const router = useRouter();
  const segments = useSegments() as unknown as string[];
  const { colorScheme } = useColorScheme();
  const blurTint = colorScheme === 'dark' ? 'dark' : 'light';
  const insetBottom = Platform.OS === 'web' ? 12 : 24;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: insetBottom,
        paddingTop: 8,
        paddingHorizontal: 12,
        zIndex: 20,
      }}
    >
      <View
        className="self-center overflow-hidden rounded-full border border-border/70"
        style={{
          width: '100%',
          maxWidth: 420,
          // subtle card tint behind the blur so it reads on light backgrounds
          backgroundColor:
            colorScheme === 'dark' ? 'rgba(18,18,18,0.55)' : 'rgba(255,255,255,0.65)',
        }}
      >
        <BlurView
          intensity={Platform.OS === 'ios' ? 40 : 25}
          tint={blurTint}
          style={{ padding: 4, borderRadius: 999 }}
        >
          <View className="flex-row items-center">
            {tabs.map((t) => {
              const active = t.match(segments);
              const color = active
                ? colorScheme === 'dark'
                  ? '#0a0a0a'
                  : '#fafaf7'
                : 'hsl(var(--muted-foreground))';
              return (
                <Pressable
                  key={t.to}
                  onPress={() => router.navigate(t.to as never)}
                  className={cn(
                    'flex-1 h-10 flex-row items-center justify-center gap-1.5 rounded-full',
                    active && 'bg-foreground'
                  )}
                >
                  {t.icon(color)}
                  <Text
                    className={cn(
                      'text-sm font-serif',
                      active ? 'text-background' : 'text-muted-foreground'
                    )}
                    numberOfLines={1}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </BlurView>
      </View>
    </View>
  );
}
