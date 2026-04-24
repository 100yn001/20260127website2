import * as React from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '@/lib/cn';

export const Textarea = React.forwardRef<TextInput, TextInputProps & { className?: string }>(
  function Textarea({ className, placeholderTextColor, ...props }, ref) {
    return (
      <TextInput
        ref={ref}
        multiline
        textAlignVertical="top"
        placeholderTextColor={placeholderTextColor ?? 'hsl(var(--muted-foreground))'}
        className={cn(
          'w-full rounded-lg border border-input bg-card px-4 py-3 text-base font-serif leading-relaxed text-foreground',
          className
        )}
        {...props}
      />
    );
  }
);
