import { DepthLayer } from '@/types/shared-audio';
import {
    Canvas,
    ColorMatrix,
    Group,
    LinearGradient,
    Rect,
    Turbulence,
    vec,
} from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

interface TopographicArtworkProps {
  baseColor: string;
  layers?: DepthLayer[];
  size?: number;
}

const FALLBACK_COLOR = '#7f1d1d';

export function generateDepthLayers(count: number = 5): DepthLayer[] {
  const layers: DepthLayer[] = [];
  for (let i = 0; i < count; i++) {
    layers.push({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 40 + Math.random() * 60,
      opacity: 0.3 + Math.random() * 0.4,
      depth: Math.random(),
    });
  }
  return layers;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    };
  }
  const shortResult = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
  if (shortResult) {
    return {
      r: parseInt(shortResult[1] + shortResult[1], 16),
      g: parseInt(shortResult[2] + shortResult[2], 16),
      b: parseInt(shortResult[3] + shortResult[3], 16),
    };
  }
  return { r: 127, g: 29, b: 29 };
}

const toHex = (r: number, g: number, b: number) =>
  `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const mixWithBlack = (hex: string, amount: number) => {
  const { r, g, b } = hexToRgb(hex);
  const factor = clamp(1 - amount, 0, 1);
  const mix = (value: number) => Math.round(value * factor);
  return toHex(mix(r), mix(g), mix(b));
};

const mixHexColors = (base: string, overlay: string, amount: number) => {
  const { r: r1, g: g1, b: b1 } = hexToRgb(base);
  const { r: r2, g: g2, b: b2 } = hexToRgb(overlay);
  const blend = (a: number, b: number) => Math.round(a + (b - a) * clamp(amount, 0, 1));
  return toHex(blend(r1, r2), blend(g1, g2), blend(b1, b2));
};

export default function TopographicArtwork({
  baseColor,
  layers,
  size = 280,
}: TopographicArtworkProps) {
  const color = baseColor || FALLBACK_COLOR;
  
  const depthLayers = useMemo(() => {
    if (layers && layers.length > 0) {
      return layers;
    }
    return generateDepthLayers(5);
  }, [layers]);
  
  const turbulenceParams = useMemo(() => {
    const seed = depthLayers.length > 0 
      ? Math.floor(depthLayers[0].x * 100 + depthLayers[0].y * 10)
      : 42;
    return {
      seed,
      freqX: 0.01 + (depthLayers[0]?.depth ?? 0.5) * 0.015,
      freqY: 0.01 + (depthLayers[1]?.depth ?? 0.5) * 0.015,
      octaves: 3,
    };
  }, [depthLayers]);
  
  const gradientOrientation = useMemo(() => {
    const angle = (depthLayers[0]?.depth ?? 0.5) * Math.PI * 2;
    return {
      x: Math.cos(angle),
      y: Math.sin(angle),
    };
  }, [depthLayers]);

  const gradientVectors = useMemo(() => {
    const center = size / 2;
    const radius = size / 2;
    const start = vec(center - gradientOrientation.x * radius, center - gradientOrientation.y * radius);
    const end = vec(center + gradientOrientation.x * radius, center + gradientOrientation.y * radius);
    return { start, end };
  }, [gradientOrientation, size]);

  const gradientColors = useMemo(() => {
    const highlight = mixHexColors(color, '#ffffff', 0.25);
    const mid = color;
    const shadow = mixWithBlack(color, 0.65);
    return [highlight, mid, shadow];
  }, [color]);

  const noiseSeed = useMemo(() => (depthLayers[0]?.size ?? 40) * 13, [depthLayers]);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Canvas style={{ width: size, height: size }}>
        <Group>
          <Rect x={0} y={0} width={size} height={size}>
            <LinearGradient
              start={gradientVectors.start}
              end={gradientVectors.end}
              colors={gradientColors}
            />
          </Rect>

          <Group blendMode="softLight">
            <Rect x={0} y={0} width={size} height={size}>
              <Turbulence
                freqX={turbulenceParams.freqX * 5}
                freqY={turbulenceParams.freqY * 5}
                octaves={2}
                seed={noiseSeed}
              />
              <ColorMatrix
                matrix={[
                  0.15, 0, 0, 0, 0,
                  0, 0.15, 0, 0, 0,
                  0, 0, 0.15, 0, 0,
                  0, 0, 0, 0.12, 0,
                ]}
              />
            </Rect>
          </Group>
        </Group>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
});
