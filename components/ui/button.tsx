import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { ActivityIndicator, Pressable, Text, View, type PressableProps } from 'react-native';
import { cn } from '@/lib/cn';

const containerVariants = cva(
  'flex-row items-center justify-center gap-2 rounded-full active:opacity-90',
  {
    variants: {
      variant: {
        default: 'bg-primary',
        outline: 'border border-border bg-transparent',
        ghost: 'bg-transparent',
        secondary: 'bg-secondary',
      },
      size: {
        default: 'h-12 px-6',
        sm: 'h-9 px-4',
        lg: 'h-14 px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

const textVariants = cva('font-serif-medium text-[0.95rem]', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      outline: 'text-foreground',
      ghost: 'text-foreground',
      secondary: 'text-secondary-foreground',
    },
    size: {
      default: 'text-[0.95rem]',
      sm: 'text-sm',
      lg: 'text-base',
      icon: 'text-[0.95rem]',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

export interface ButtonProps
  extends Omit<PressableProps, 'children'>,
    VariantProps<typeof containerVariants> {
  className?: string;
  textClassName?: string;
  label?: string;
  loading?: boolean;
  children?: React.ReactNode;
}

export const Button = React.forwardRef<View, ButtonProps>(function Button(
  { className, textClassName, variant, size, disabled, label, loading, children, ...props },
  ref
) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      ref={ref as never}
      disabled={isDisabled}
      className={cn(
        containerVariants({ variant, size }),
        isDisabled && 'opacity-40',
        className
      )}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" />
      ) : label ? (
        <Text className={cn(textVariants({ variant, size }), textClassName)}>{label}</Text>
      ) : (
        <ButtonChildren variant={variant ?? 'default'} size={size ?? 'default'} textClassName={textClassName}>
          {children}
        </ButtonChildren>
      )}
    </Pressable>
  );
});

function ButtonChildren({
  children,
  variant,
  size,
  textClassName,
}: {
  children: React.ReactNode;
  variant: NonNullable<VariantProps<typeof containerVariants>['variant']>;
  size: NonNullable<VariantProps<typeof containerVariants>['size']>;
  textClassName?: string;
}) {
  return (
    <>
      {React.Children.map(children, (child) => {
        if (typeof child === 'string' || typeof child === 'number') {
          return (
            <Text className={cn(textVariants({ variant, size }), textClassName)}>{child}</Text>
          );
        }
        return child;
      })}
    </>
  );
}
