import { useRouter, useSegments } from 'expo-router';
import { Archive, Library as LibraryIcon, Sparkles, Users } from 'lucide-react-native';
import * as React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { cn } from '@/lib/cn';

type Tab = {
  to: string;
  label: string;
  icon: (color: string) => React.ReactNode;
  match: (segments: string[]) => boolean;
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
    to: '/(tabs)/create',
    label: 'create',
    icon: (c) => <Sparkles size={ICON} color={c} />,
    match: (s) => s.includes('create'),
  },
  {
    to: '/(tabs)/narrators',
    label: 'narrators',
    icon: (c) => <Users size={ICON} color={c} />,
    match: (s) => s.includes('narrators'),
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
        className="self-center flex-row items-center rounded-full border border-border bg-card p-1"
        style={{ width: '100%', maxWidth: 420 }}
      >
        {tabs.map((t) => {
          const active = t.match(segments);
          const color = active
            ? 'hsl(var(--background))'
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
    </View>
  );
}
