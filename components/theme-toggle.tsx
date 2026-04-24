import { Moon, Sun } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/cn';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <View
      className={cn(
        'flex-row items-center rounded-full border border-border bg-card p-0.5',
        className
      )}
    >
      <Pressable
        onPress={() => {
          if (!isDark) toggleTheme();
        }}
        accessibilityLabel="dark mode"
        className={cn(
          'h-7 w-7 items-center justify-center rounded-full',
          isDark ? 'bg-foreground' : 'bg-transparent'
        )}
      >
        <Moon size={14} color={isDark ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground))'} />
      </Pressable>
      <Pressable
        onPress={() => {
          if (isDark) toggleTheme();
        }}
        accessibilityLabel="light mode"
        className={cn(
          'h-7 w-7 items-center justify-center rounded-full',
          !isDark ? 'bg-foreground' : 'bg-transparent'
        )}
      >
        <Sun size={14} color={!isDark ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground))'} />
      </Pressable>
    </View>
  );
}
