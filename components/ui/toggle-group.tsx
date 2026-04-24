import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { cn } from '@/lib/cn';

interface ToggleGroupProps<T extends string> {
  value: T | null;
  onValueChange: (v: T) => void;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  className?: string;
  fullWidth?: boolean;
}

export function ToggleGroup<T extends string>({
  value,
  onValueChange,
  options,
  className,
  fullWidth = true,
}: ToggleGroupProps<T>) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-1 rounded-full border border-border bg-muted p-1',
        fullWidth && 'w-full',
        className
      )}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onValueChange(opt.value)}
            className={cn(
              'flex-1 flex-row items-center justify-center gap-1.5 rounded-full px-3 py-2',
              active ? 'bg-card' : 'bg-transparent'
            )}
          >
            {opt.icon}
            <Text
              className={cn(
                'text-sm font-serif',
                active ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
