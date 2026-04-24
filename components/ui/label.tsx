import * as React from 'react';
import { Text } from 'react-native';
import { cn } from '@/lib/cn';

export function Label({
  className,
  ...props
}: React.ComponentProps<typeof Text> & { className?: string }) {
  return (
    <Text
      className={cn('text-xs font-serif-medium tracking-wide text-muted-foreground', className)}
      {...props}
    />
  );
}
