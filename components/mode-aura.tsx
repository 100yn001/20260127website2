import { LinearGradient } from 'expo-linear-gradient';
import * as React from 'react';
import { View } from 'react-native';
import { cn } from '@/lib/cn';

export type Mode = 'night' | 'day';

/**
 * Mode aura — colored gradient layered over the app background.
 * Approximates the prototype's CSS radial gradients with two overlaid
 * diagonal LinearGradients. Blue/indigo for nighttime, amber/red for daytime.
 */
type Intensity = 'full' | 'subtle';

const colors: Record<Mode, Record<Intensity, { a: string[]; b: string[]; opacity: number[] }>> = {
  night: {
    full: {
      a: ['rgba(30, 58, 138, 0.55)', 'rgba(30, 58, 138, 0)'],
      b: ['rgba(49, 46, 129, 0.45)', 'rgba(12, 10, 35, 0.3)'],
      opacity: [1, 1],
    },
    subtle: {
      a: ['rgba(30, 58, 138, 0.28)', 'rgba(30, 58, 138, 0)'],
      b: ['rgba(49, 46, 129, 0.18)', 'rgba(49, 46, 129, 0)'],
      opacity: [1, 1],
    },
  },
  day: {
    full: {
      a: ['rgba(180, 65, 45, 0.55)', 'rgba(180, 65, 45, 0)'],
      b: ['rgba(146, 64, 14, 0.5)', 'rgba(69, 26, 3, 0.3)'],
      opacity: [1, 1],
    },
    subtle: {
      a: ['rgba(180, 65, 45, 0.22)', 'rgba(180, 65, 45, 0)'],
      b: ['rgba(146, 64, 14, 0.14)', 'rgba(146, 64, 14, 0)'],
      opacity: [1, 1],
    },
  },
};

export function ModeAura({
  mode,
  intensity = 'subtle',
  className,
}: {
  mode: Mode;
  intensity?: Intensity;
  className?: string;
}) {
  const c = colors[mode][intensity];
  return (
    <View pointerEvents="none" className={cn('absolute inset-0 z-0', className)}>
      <LinearGradient
        colors={c.a as unknown as [string, string]}
        start={{ x: 0.18, y: 0.12 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <LinearGradient
        colors={c.b as unknown as [string, string]}
        start={{ x: 1, y: 1 }}
        end={{ x: 0, y: 0 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
    </View>
  );
}
