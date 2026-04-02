import { DepthLayer } from '@/types/story';

/**
 * Renders the topographic artwork to an offscreen HTML Canvas
 * and returns a PNG Blob. Web-only utility.
 */
export async function renderArtworkToPng(
  baseColor: string,
  layers?: DepthLayer[],
  size: number = 440
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const { r, g, b } = hexToRgb(baseColor);

  // Compute gradient direction from layers
  const depth0 = layers?.[0]?.depth ?? 0.5;
  const angle = depth0 * Math.PI * 2;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2;
  const x0 = cx - Math.cos(angle) * radius;
  const y0 = cy - Math.sin(angle) * radius;
  const x1 = cx + Math.cos(angle) * radius;
  const y1 = cy + Math.sin(angle) * radius;

  // Gradient colors: highlight, base, shadow
  const highlight = mixWithWhite(r, g, b, 0.25);
  const shadow = mixWithBlack(r, g, b, 0.65);

  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  grad.addColorStop(0, `rgb(${highlight.r},${highlight.g},${highlight.b})`);
  grad.addColorStop(0.5, `rgb(${r},${g},${b})`);
  grad.addColorStop(1, `rgb(${shadow.r},${shadow.g},${shadow.b})`);

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle noise overlay to approximate turbulence
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;
  const seed = layers?.[0] ? Math.floor(layers[0].x * 100 + layers[0].y * 10) : 42;
  let rng = seed;
  for (let i = 0; i < data.length; i += 4) {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    const noise = ((rng % 256) - 128) * 0.06;
    data[i] = clamp(data[i] + noise, 0, 255);
    data[i + 1] = clamp(data[i + 1] + noise, 0, 255);
    data[i + 2] = clamp(data[i + 2] + noise, 0, 255);
  }
  ctx.putImageData(imageData, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create PNG blob'));
    }, 'image/png');
  });
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) };
  }
  const short = /^#?([a-f\d])([a-f\d])$/i.exec(hex);
  if (short) {
    return {
      r: parseInt(short[1] + short[1], 16),
      g: parseInt(short[2] + short[2], 16),
      b: parseInt(short[3] + short[3], 16),
    };
  }
  return { r: 127, g: 29, b: 29 };
}

function mixWithWhite(r: number, g: number, b: number, amount: number) {
  const mix = (v: number) => Math.round(v + (255 - v) * amount);
  return { r: mix(r), g: mix(g), b: mix(b) };
}

function mixWithBlack(r: number, g: number, b: number, amount: number) {
  const factor = 1 - amount;
  return { r: Math.round(r * factor), g: Math.round(g * factor), b: Math.round(b * factor) };
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
