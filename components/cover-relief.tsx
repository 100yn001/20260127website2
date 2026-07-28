import * as React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { hashStr, shiftHsl, washesFor } from '@/lib/cover';

/**
 * Seeded soft washes on top of a cover gradient: a few large hue/lightness
 * drifted color fields anchored beyond the tile edges, so every story's
 * gradient leans a little differently without any visible spots or grain.
 * Overlay only — render after the LinearGradient inside an overflow-hidden
 * container.
 *
 * Falls back to seeding from the colors themselves when no seed is given, so
 * it is always stable for a given cover.
 */
export function CoverRelief({
  cover,
  seed,
}: {
  cover: { a: string; b: string };
  seed?: string | null;
}) {
  const key = seed || `${cover.a}${cover.b}`;
  const washes = washesFor(key);
  // Gradient ids land in a shared DOM namespace on web — key them by
  // seed+colors so distinct reliefs never collide.
  const uid = Math.abs(hashStr(key + cover.a + cover.b)).toString(36);

  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        {washes.map((w, i) => (
          <RadialGradient
            key={i}
            id={`ws${uid}-${i}`}
            cx={`${w.x}%`}
            cy={`${w.y}%`}
            rx={`${w.rx}%`}
            ry={`${w.ry}%`}
          >
            <Stop
              offset="0"
              stopColor={shiftHsl(cover.a, w.hueShift, 0.04, w.lightShift)}
              stopOpacity={w.opacity}
            />
            <Stop
              offset="1"
              stopColor={shiftHsl(cover.a, w.hueShift, 0.04, w.lightShift)}
              stopOpacity={0}
            />
          </RadialGradient>
        ))}
      </Defs>
      {washes.map((_, i) => (
        <Rect key={i} x="0" y="0" width="100%" height="100%" fill={`url(#ws${uid}-${i})`} />
      ))}
    </Svg>
  );
}
