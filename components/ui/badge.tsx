import * as React from 'react';
import { Text, View } from 'react-native';
import { cn } from '@/lib/cn';

export function Badge({
  children,
  variant = 'default',
  className,
  textClassName,
}: {
  children: React.ReactNode;
  variant?: 'default' | 'outline';
  className?: string;
  textClassName?: string;
}) {
  return (
    <View
      className={cn(
        'self-start rounded-full px-3 py-1',
        variant === 'default' && 'bg-accent',
        variant === 'outline' && 'border border-border',
        className
      )}
    >
      <Text
        className={cn(
          'text-xs font-serif-medium',
          variant === 'default' && 'text-accent-foreground',
          variant === 'outline' && 'text-muted-foreground',
          textClassName
        )}
      >
        {children}
      </Text>
    </View>
  );
}
