import React, { useEffect, useMemo, useRef } from 'react';
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
    return { seed1: 42, seed2: 92, sweepAngle: 45 };
  }
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
  return {
    seed1: Math.abs(hash1) % 1000,
    seed2: Math.abs(hash2) % 1000,
    sweepAngle: Math.abs(hash3) % 180,
  };
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
  return { r: 127, g: 29, b: 29 };
}

// Simple seeded pseudo-random number generator
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * NarratorArtwork (Web version) — renders a metallic gradient circle using HTML5 Canvas
 */
export default function NarratorArtwork({
  color,
  size = 112,
  seed,
}: NarratorArtworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseColor = color || NARRATOR_COLOR_PALETTE[0];
  const turbulenceParams = useMemo(() => getTurbulenceParams(seed || color), [seed, color]);

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
    const { r, g, b } = hexToRgb(baseColor);

    const lighten = (v: number, amount: number) =>
      Math.min(255, Math.floor(v + (255 - v) * amount));
    const darken = (v: number, amount: number) =>
      Math.max(0, Math.floor(v * (1 - amount)));

    // Clip to circle
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.clip();

    // 1) Base radial gradient — offset light source
    const baseGrad = ctx.createRadialGradient(
      center * 0.6, center * 0.5, 0,
      center, center, radius * 1.6
    );
    baseGrad.addColorStop(0, `rgb(${lighten(r, 0.75)},${lighten(g, 0.75)},${lighten(b, 0.75)})`);
    baseGrad.addColorStop(0.15, `rgb(${lighten(r, 0.5)},${lighten(g, 0.5)},${lighten(b, 0.5)})`);
    baseGrad.addColorStop(0.35, `rgb(${lighten(r, 0.25)},${lighten(g, 0.25)},${lighten(b, 0.25)})`);
    baseGrad.addColorStop(0.55, baseColor);
    baseGrad.addColorStop(0.8, `rgb(${darken(r, 0.25)},${darken(g, 0.25)},${darken(b, 0.25)})`);
    baseGrad.addColorStop(1, `rgb(${darken(r, 0.5)},${darken(g, 0.5)},${darken(b, 0.5)})`);
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, size, size);

    // 2) Noise texture (simulated turbulence with seeded random)
    // Use an offscreen canvas so drawImage respects the active clip path
    const rng = seededRandom(turbulenceParams.seed1);
    const offscreen = document.createElement('canvas');
    offscreen.width = size;
    offscreen.height = size;
    const offCtx = offscreen.getContext('2d');
    if (offCtx) {
      const noiseImageData = offCtx.createImageData(size, size);
      for (let i = 0; i < noiseImageData.data.length; i += 4) {
        const noise = Math.floor(rng() * 255);
        noiseImageData.data[i] = noise;
        noiseImageData.data[i + 1] = noise;
        noiseImageData.data[i + 2] = noise;
        noiseImageData.data[i + 3] = 25; // low opacity
      }
      offCtx.putImageData(noiseImageData, 0, 0);
      ctx.drawImage(offscreen, 0, 0);
    }

    ctx.save();

    // 3) Metallic sweep gradient
    const angle = (turbulenceParams.sweepAngle * Math.PI) / 180;
    const sweepGrad = ctx.createLinearGradient(
      0, 0,
      center + Math.cos(angle) * size,
      center + Math.sin(angle) * size
    );
    sweepGrad.addColorStop(0, `rgba(${lighten(r, 0.6)},${lighten(g, 0.6)},${lighten(b, 0.6)},0.4)`);
    sweepGrad.addColorStop(0.35, `rgba(${darken(r, 0.3)},${darken(g, 0.3)},${darken(b, 0.3)},0.3)`);
    sweepGrad.addColorStop(0.65, `rgba(${lighten(r, 0.4)},${lighten(g, 0.4)},${lighten(b, 0.4)},0.35)`);
    sweepGrad.addColorStop(1, `rgba(${darken(r, 0.2)},${darken(g, 0.2)},${darken(b, 0.2)},0.25)`);
    ctx.fillStyle = sweepGrad;
    ctx.fillRect(0, 0, size, size);

    // 4) Rim highlight — top left
    const rimGrad = ctx.createRadialGradient(
      center * 0.3, center * 0.3, 0,
      center * 0.3, center * 0.3, radius * 0.7
    );
    rimGrad.addColorStop(0, 'rgba(255,255,255,0.45)');
    rimGrad.addColorStop(0.3, 'rgba(255,255,255,0.2)');
    rimGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rimGrad;
    ctx.fillRect(0, 0, size, size);

    // 5) Secondary highlight — depth
    const secGrad = ctx.createRadialGradient(
      center * 0.5, center * 0.4, 0,
      center * 0.5, center * 0.4, radius * 0.5
    );
    secGrad.addColorStop(0, 'rgba(255,255,255,0.25)');
    secGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = secGrad;
    ctx.fillRect(0, 0, size, size);

    // 6) Bottom shadow — 3D sphere effect
    const shadowGrad = ctx.createRadialGradient(
      center * 1.5, center * 1.6, 0,
      center * 1.5, center * 1.6, radius * 1.2
    );
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0)');
    shadowGrad.addColorStop(1, `rgba(${darken(r, 0.7)},${darken(g, 0.7)},${darken(b, 0.7)},0.6)`);
    ctx.fillStyle = shadowGrad;
    ctx.fillRect(0, 0, size, size);

    // 7) Edge darkening vignette
    const vignetteGrad = ctx.createRadialGradient(
      center, center, 0,
      center, center, radius
    );
    vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vignetteGrad.addColorStop(0.6, 'rgba(0,0,0,0)');
    vignetteGrad.addColorStop(0.85, 'rgba(0,0,0,0.15)');
    vignetteGrad.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, size, size);

    ctx.restore();
  }, [baseColor, size, turbulenceParams]);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size, borderRadius: 999 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 999,
    overflow: 'hidden',
  },
});
