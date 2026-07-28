import * as React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { hashStr, reliefFor, shiftLightness } from '@/lib/cover';

/**
 * Subtle seeded relief on top of a cover gradient: one soft highlight of the
 * lighter shade and one darker pool in the opposite corner, with per-seed
 * position and ellipse shape. Overlay only — render after the LinearGradient
 * inside an overflow-hidden container.
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
  const r = reliefFor(key);
  const light = shiftLightness(cover.a, 0.14);
  const dark = shiftLightness(cover.b, -0.12);
  // Gradient ids land in a shared DOM namespace on web — key them by
  // seed+colors so distinct reliefs never collide.
  const uid = Math.abs(hashStr(key + cover.a + cover.b)).toString(36);

  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <RadialGradient
          id={`hl${uid}`}
          cx={`${r.hx}%`}
          cy={`${r.hy}%`}
          rx={`${r.hrx}%`}
          ry={`${r.hry}%`}
        >
          <Stop offset="0" stopColor={light} stopOpacity={0.5} />
          <Stop offset="0.6" stopColor={light} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient
          id={`sh${uid}`}
          cx={`${r.sx}%`}
          cy={`${r.sy}%`}
          rx={`${r.srx}%`}
          ry={`${r.sry}%`}
        >
          <Stop offset="0" stopColor={dark} stopOpacity={0.4} />
          <Stop offset="0.55" stopColor={dark} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#hl${uid})`} />
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#sh${uid})`} />
    </Svg>
  );
}
