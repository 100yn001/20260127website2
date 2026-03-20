import {
    Canvas,
    Circle,
    ColorMatrix,
    Group,
    LinearGradient,
    RadialGradient,
    Turbulence,
    vec
} from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

interface NarratorArtworkProps {
  color?: string;
  size?: number;
  seed?: string;
}

// Predefined color palette for random selection - exported for use in color picker
export const NARRATOR_COLOR_PALETTE = [
  '#7f1d1d', // deep red
  '#713f12', // amber brown
  '#365314', // olive green
  '#134e4a', // teal
  '#1e3a5f', // navy blue
  '#4c1d95', // deep purple
  '#831843', // magenta
  '#0f172a', // slate
  '#064e3b', // emerald
  '#7c2d12', // burnt orange
];

/**
 * Generate a random color from the palette based on a seed
 */
export function getRandomNarratorColor(seed?: string): string {
  if (seed) {
    // Use seed to generate consistent color
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return NARRATOR_COLOR_PALETTE[Math.abs(hash) % NARRATOR_COLOR_PALETTE.length];
  }
  return NARRATOR_COLOR_PALETTE[Math.floor(Math.random() * NARRATOR_COLOR_PALETTE.length)];
}

/**
 * Generate turbulence parameters from string for consistent but varied textures
 */
function getTurbulenceParams(str?: string) {
  if (!str) {
    return {
      seed1: 42,
      seed2: 92,
      freqX1: 0.04,
      freqY1: 0.08,
      freqX2: 0.08,
      freqY2: 0.02,
      octaves1: 3,
      octaves2: 2,
      sweepAngle: 45,
    };
  }
  
  // Generate multiple hash values for different parameters
  let hash1 = 0;
  let hash2 = 0;
  let hash3 = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash1 = ((hash1 << 5) - hash1) + char;
    hash1 = hash1 & hash1;
    hash2 = ((hash2 << 7) - hash2) + char * 3;
    hash2 = hash2 & hash2;
    hash3 = ((hash3 << 3) - hash3) + char * 7;
    hash3 = hash3 & hash3;
  }
  
  const seed1 = Math.abs(hash1) % 1000;
  const seed2 = Math.abs(hash2) % 1000;
  
  // Vary frequencies based on hash for unique patterns
  const freqBase1 = 0.02 + (Math.abs(hash1) % 50) / 1000; // 0.02 - 0.07
  const freqBase2 = 0.03 + (Math.abs(hash2) % 60) / 1000; // 0.03 - 0.09
  
  // Vary octaves for different complexity levels
  const octaves1 = 2 + (Math.abs(hash1) % 3); // 2-4
  const octaves2 = 1 + (Math.abs(hash2) % 3); // 1-3
  
  // Vary sweep angle for diagonal gradient
  const sweepAngle = (Math.abs(hash3) % 180); // 0-180 degrees
  
  return {
    seed1,
    seed2,
    freqX1: freqBase1,
    freqY1: freqBase1 * (1.5 + (Math.abs(hash3) % 100) / 100), // aspect ratio variation
    freqX2: freqBase2,
    freqY2: freqBase2 * (0.5 + (Math.abs(hash1) % 100) / 100),
    octaves1,
    octaves2,
    sweepAngle,
  };
}

/**
 * Parse hex color to RGB values
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    };
  }
  return { r: 127, g: 29, b: 29 };
}

/**
 * Generate extended metallic gradient colors from base color
 */
function generateMetallicColors(baseColor: string) {
  const { r, g, b } = hexToRgb(baseColor);
  
  const lighten = (v: number, amount: number) => 
    Math.min(255, Math.floor(v + (255 - v) * amount));
  const darken = (v: number, amount: number) => 
    Math.max(0, Math.floor(v * (1 - amount)));
  const toHex = (rv: number, gv: number, bv: number) =>
    `#${rv.toString(16).padStart(2, '0')}${gv.toString(16).padStart(2, '0')}${bv.toString(16).padStart(2, '0')}`;
  const toRgba = (rv: number, gv: number, bv: number, a: number) =>
    `rgba(${rv},${gv},${bv},${a})`;
  
  return {
    // Main radial gradient - bright center to dark edge
    primary: [
      toHex(lighten(r, 0.75), lighten(g, 0.75), lighten(b, 0.75)),
      toHex(lighten(r, 0.5), lighten(g, 0.5), lighten(b, 0.5)),
      toHex(lighten(r, 0.25), lighten(g, 0.25), lighten(b, 0.25)),
      baseColor,
      toHex(darken(r, 0.25), darken(g, 0.25), darken(b, 0.25)),
      toHex(darken(r, 0.5), darken(g, 0.5), darken(b, 0.5)),
    ],
    // Secondary sweep for metallic banding
    sweep: [
      toRgba(lighten(r, 0.6), lighten(g, 0.6), lighten(b, 0.6), 0.4),
      toRgba(darken(r, 0.3), darken(g, 0.3), darken(b, 0.3), 0.3),
      toRgba(lighten(r, 0.4), lighten(g, 0.4), lighten(b, 0.4), 0.35),
      toRgba(darken(r, 0.2), darken(g, 0.2), darken(b, 0.2), 0.25),
    ],
    // Rim light colors
    rim: [
      toRgba(lighten(r, 0.8), lighten(g, 0.8), lighten(b, 0.8), 0.5),
      'rgba(255,255,255,0)',
    ],
    // Deep shadow for 3D effect
    shadow: [
      'rgba(0,0,0,0)',
      toRgba(darken(r, 0.7), darken(g, 0.7), darken(b, 0.7), 0.6),
    ],
  };
}

/**
 * NarratorArtwork - Creates a circular metallic gradient using Skia
 * Renders an intricate metallic texture with turbulence, multiple gradients, and rim lighting
 */
export default function NarratorArtwork({
  color,
  size = 112,
  seed,
}: NarratorArtworkProps) {
  const baseColor = color || NARRATOR_COLOR_PALETTE[0];
  const center = size / 2;
  const radius = size / 2;
  const turbulenceParams = useMemo(() => getTurbulenceParams(seed || color), [seed, color]);
  
  // Calculate sweep gradient endpoints based on angle
  const sweepEnd = useMemo(() => {
    const angle = (turbulenceParams.sweepAngle * Math.PI) / 180;
    return vec(
      center + Math.cos(angle) * size,
      center + Math.sin(angle) * size
    );
  }, [turbulenceParams.sweepAngle, center, size]);
  
  // Generate metallic gradient colors
  const colors = useMemo(() => generateMetallicColors(baseColor), [baseColor]);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Canvas style={{ width: size, height: size }}>
        {/* Clip to circle */}
        <Group clip={{ x: 0, y: 0, width: size, height: size }}>
          {/* Base metallic gradient - offset light source */}
          <Circle cx={center} cy={center} r={radius}>
            <RadialGradient
              c={vec(center * 0.6, center * 0.5)}
              r={radius * 1.6}
              colors={colors.primary}
              positions={[0, 0.15, 0.35, 0.55, 0.8, 1]}
            />
          </Circle>
          
          {/* Primary turbulence texture - unique per narrator */}
          <Circle cx={center} cy={center} r={radius}>
            <Turbulence
              freqX={turbulenceParams.freqX1}
              freqY={turbulenceParams.freqY1}
              octaves={turbulenceParams.octaves1}
              seed={turbulenceParams.seed1}
            />
            <ColorMatrix
              matrix={[
                0.18, 0, 0, 0, 0,
                0, 0.18, 0, 0, 0,
                0, 0, 0.18, 0, 0,
                0, 0, 0, 0.15, 0,
              ]}
            />
          </Circle>
          
          {/* Metallic banding - varied angle sweep */}
          <Circle cx={center} cy={center} r={radius}>
            <LinearGradient
              start={vec(0, 0)}
              end={sweepEnd}
              colors={colors.sweep}
              positions={[0, 0.35, 0.65, 1]}
            />
          </Circle>
          
          {/* Secondary turbulence for fine grain - different pattern */}
          <Circle cx={center} cy={center} r={radius}>
            <Turbulence
              freqX={turbulenceParams.freqX2}
              freqY={turbulenceParams.freqY2}
              octaves={turbulenceParams.octaves2}
              seed={turbulenceParams.seed2}
            />
            <ColorMatrix
              matrix={[
                0.12, 0, 0, 0, 0,
                0, 0.12, 0, 0, 0,
                0, 0, 0.12, 0, 0,
                0, 0, 0, 0.1, 0,
              ]}
            />
          </Circle>
          
          {/* Rim highlight - top left */}
          <Circle cx={center} cy={center} r={radius}>
            <RadialGradient
              c={vec(center * 0.3, center * 0.3)}
              r={radius * 0.7}
              colors={[
                'rgba(255,255,255,0.45)',
                'rgba(255,255,255,0.2)',
                'rgba(255,255,255,0)',
              ]}
              positions={[0, 0.3, 1]}
            />
          </Circle>
          
          {/* Secondary highlight - creates depth */}
          <Circle cx={center} cy={center} r={radius}>
            <RadialGradient
              c={vec(center * 0.5, center * 0.4)}
              r={radius * 0.5}
              colors={[
                'rgba(255,255,255,0.25)',
                'rgba(255,255,255,0)',
              ]}
              positions={[0, 1]}
            />
          </Circle>
          
          {/* Bottom shadow for 3D sphere effect */}
          <Circle cx={center} cy={center} r={radius}>
            <RadialGradient
              c={vec(center * 1.5, center * 1.6)}
              r={radius * 1.2}
              colors={colors.shadow}
              positions={[0, 1]}
            />
          </Circle>
          
          {/* Edge darkening vignette */}
          <Circle cx={center} cy={center} r={radius}>
            <RadialGradient
              c={vec(center, center)}
              r={radius}
              colors={[
                'rgba(0,0,0,0)',
                'rgba(0,0,0,0)',
                'rgba(0,0,0,0.15)',
                'rgba(0,0,0,0.35)',
              ]}
              positions={[0, 0.6, 0.85, 1]}
            />
          </Circle>
        </Group>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 999,
    overflow: 'hidden',
  },
});
