import { DepthLayer } from '@/types/story';
import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

interface TopographicArtworkProps {
  baseColor: string;
  layers?: DepthLayer[];
  size?: number;
}

const FALLBACK_COLOR = '#7f1d1d';

/**
 * Generate random depth layers for the topographic effect
 */
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
  const blend = (a: number, bv: number) => Math.round(a + (bv - a) * clamp(amount, 0, 1));
  return toHex(blend(r1, r2), blend(g1, g2), blend(b1, b2));
};

// Simple seeded pseudo-random number generator
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * TopographicArtwork (Web version) — renders using HTML5 Canvas
 */
export default function TopographicArtwork({
  baseColor,
  layers,
  size = 280,
}: TopographicArtworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const color = baseColor || FALLBACK_COLOR;

  const depthLayers = useMemo(() => {
    if (layers && layers.length > 0) return layers;
    return generateDepthLayers(5);
  }, [layers]);

  const gradientOrientation = useMemo(() => {
    const angle = (depthLayers[0]?.depth ?? 0.5) * Math.PI * 2;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }, [depthLayers]);

  const gradientColors = useMemo(() => {
    const highlight = mixHexColors(color, '#ffffff', 0.25);
    const mid = color;
    const shadow = mixWithBlack(color, 0.65);
    return [highlight, mid, shadow];
  }, [color]);

  const noiseSeed = useMemo(
    () => Math.floor((depthLayers[0]?.size ?? 40) * 13 + (depthLayers[0]?.x ?? 0) * 100 + (depthLayers[0]?.y ?? 0) * 10),
    [depthLayers]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    const center = size / 2;
    const radius = size / 2;

    // 1) Base linear gradient
    const startX = center - gradientOrientation.x * radius;
    const startY = center - gradientOrientation.y * radius;
    const endX = center + gradientOrientation.x * radius;
    const endY = center + gradientOrientation.y * radius;

    const baseGrad = ctx.createLinearGradient(startX, startY, endX, endY);
    baseGrad.addColorStop(0, gradientColors[0]);
    baseGrad.addColorStop(0.5, gradientColors[1]);
    baseGrad.addColorStop(1, gradientColors[2]);
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, size, size);

    // 2) Noise texture overlay (softLight approximation)
    const rng = seededRandom(noiseSeed);
    const noiseImageData = ctx.createImageData(size, size);
    for (let i = 0; i < noiseImageData.data.length; i += 4) {
      const noise = Math.floor(rng() * 255);
      noiseImageData.data[i] = noise;
      noiseImageData.data[i + 1] = noise;
      noiseImageData.data[i + 2] = noise;
      noiseImageData.data[i + 3] = 20; // subtle overlay
    }
    // Draw noise via a temporary canvas to blend
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = size * dpr;
    tempCanvas.height = size * dpr;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.putImageData(noiseImageData, 0, 0);
      ctx.globalCompositeOperation = 'soft-light';
      ctx.drawImage(tempCanvas, 0, 0, size, size);
      ctx.globalCompositeOperation = 'source-over';
    }
  }, [color, size, gradientOrientation, gradientColors, noiseSeed]);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size, borderRadius: 20 }}
      />
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
