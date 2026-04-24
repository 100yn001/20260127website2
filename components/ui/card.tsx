import * as React from 'react';
import { Text, View, type ViewProps } from 'react-native';
import { cn } from '@/lib/cn';

export const Card = React.forwardRef<View, ViewProps & { className?: string }>(
  function Card({ className, ...props }, ref) {
    return (
      <View
        ref={ref}
        className={cn('rounded-[var(--radius)] border border-border bg-card', className)}
        {...props}
      />
    );
  }
);

export function CardHeader({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn('px-5 pt-5 gap-1.5', className)} {...props} />;
}

export function CardTitle({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Text> & { className?: string }) {
  return (
    <Text className={cn('text-[1.05rem] font-serif-medium text-foreground', className)} {...props}>
      {children}
    </Text>
  );
}

export function CardDescription({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Text> & { className?: string }) {
  return (
    <Text className={cn('text-sm font-serif text-muted-foreground', className)} {...props}>
      {children}
    </Text>
  );
}

export function CardContent({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn('p-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn('flex-row items-center px-5 pb-5', className)} {...props} />;
}
