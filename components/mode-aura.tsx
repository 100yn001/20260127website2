import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { cn } from '@/lib/cn';

export type Mode = 'night' | 'day';

/**
 * Mode aura — stacked radial + linear gradients matching the prototype's
 * CSS exactly. Uses react-native-svg so we actually get radial gradients
 * (expo-linear-gradient can't). The three layers are painted bottom-up:
 * linear base, then two radial blobs at opposite corners.
 */
type Intensity = 'full' | 'subtle';

type Recipe = {
  base: { c0: string; a0: number; c1: string; a1: number };
  blobA: { color: string; alpha: number; cx: number; cy: number; r: number };
  blobB: { color: string; alpha: number; cx: number; cy: number; r: number };
};

const colors: Record<Mode, Record<Intensity, Recipe>> = {
  night: {
    full: {
      base: { c0: '#0f172a', a0: 0.7, c1: '#0c0a23', a1: 0.3 },
      blobA: { color: '#1e3a8a', alpha: 0.55, cx: 0.18, cy: 0.12, r: 1.1 },
      blobB: { color: '#312e81', alpha: 0.45, cx: 0.85, cy: 0.95, r: 1.0 },
    },
    subtle: {
      base: { c0: '#0f172a', a0: 0.0, c1: '#0c0a23', a1: 0.0 },
      blobA: { color: '#1e3a8a', alpha: 0.35, cx: 0.15, cy: 0.05, r: 0.9 },
      blobB: { color: '#312e81', alpha: 0.22, cx: 0.9, cy: 1.0, r: 0.8 },
    },
  },
  day: {
    full: {
      base: { c0: '#7f1d1d', a0: 0.55, c1: '#451a03', a1: 0.3 },
      blobA: { color: '#b4412d', alpha: 0.55, cx: 0.18, cy: 0.12, r: 1.1 },
      blobB: { color: '#92400e', alpha: 0.5, cx: 0.85, cy: 0.95, r: 1.0 },
    },
    subtle: {
      base: { c0: '#7f1d1d', a0: 0.0, c1: '#451a03', a1: 0.0 },
      blobA: { color: '#b4412d', alpha: 0.28, cx: 0.15, cy: 0.05, r: 0.9 },
      blobB: { color: '#92400e', alpha: 0.18, cx: 0.9, cy: 1.0, r: 0.8 },
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
  const r = colors[mode][intensity];
  return (
    <View
      pointerEvents="none"
      className={cn('absolute inset-0 z-0', className)}
      style={StyleSheet.absoluteFill}
    >
      <Svg
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <LinearGradient id="aura-base" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={r.base.c0} stopOpacity={r.base.a0} />
            <Stop offset="1" stopColor={r.base.c1} stopOpacity={r.base.a1} />
          </LinearGradient>
          <RadialGradient
            id="aura-blob-a"
            cx={r.blobA.cx}
            cy={r.blobA.cy}
            rx={r.blobA.r}
            ry={r.blobA.r}
            fx={r.blobA.cx}
            fy={r.blobA.cy}
          >
            <Stop offset="0" stopColor={r.blobA.color} stopOpacity={r.blobA.alpha} />
            <Stop offset="1" stopColor={r.blobA.color} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient
            id="aura-blob-b"
            cx={r.blobB.cx}
            cy={r.blobB.cy}
            rx={r.blobB.r}
            ry={r.blobB.r}
            fx={r.blobB.cx}
            fy={r.blobB.cy}
          >
            <Stop offset="0" stopColor={r.blobB.color} stopOpacity={r.blobB.alpha} />
            <Stop offset="1" stopColor={r.blobB.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {(r.base.a0 > 0 || r.base.a1 > 0) && (
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#aura-base)" />
        )}
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#aura-blob-b)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#aura-blob-a)" />
      </Svg>
    </View>
  );
}
