import * as React from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '@/lib/cn';

export const Input = React.forwardRef<TextInput, TextInputProps & { className?: string }>(
  function Input({ className, placeholderTextColor, ...props }, ref) {
    return (
      <TextInput
        ref={ref}
        placeholderTextColor={placeholderTextColor ?? 'hsl(var(--muted-foreground))'}
        className={cn(
          'h-11 w-full rounded-lg border border-input bg-card px-3 text-[0.95rem] font-serif text-foreground',
          className
        )}
        {...props}
      />
    );
  }
);
