export type CoverPalette = { a: string; b: string };

const PALETTES: [string, string][] = [
  ['#d6c2a8', '#8a6c47'],
  ['#a6b3d5', '#3b4a7a'],
  ['#cddacb', '#5c7a63'],
  ['#e8d2c1', '#a37257'],
  ['#c4a8d8', '#593c77'],
];

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

export function coverFor(seed: string | undefined | null): CoverPalette {
  const idx = Math.abs(hashStr(seed || 'x')) % PALETTES.length;
  const [a, b] = PALETTES[idx];
  return { a, b };
}

/**
 * Build a gradient from a single hex color (e.g. a story's saved coverColor):
 * lighter end at the top-left, the saved color at the bottom-right. Stable
 * for the same input — the same coverColor always yields the same gradient.
 *
 * Falls through to coverFor(seed) when `hex` isn't a parseable color.
 */
export function coverFromColor(hex: string | undefined | null, seed?: string | null): CoverPalette {
  if (typeof hex === 'string' && /^#?[0-9a-f]{6}$/i.test(hex.trim())) {
    const base = hex.trim().startsWith('#') ? hex.trim() : `#${hex.trim()}`;
    return { a: shiftHsl(base, 0, -0.05, 0.18), b: base };
  }
  return coverFor(seed ?? hex ?? null);
}

/**
 * Take the user's profile tint as a base and produce a slightly-varied gradient
 * keyed by `seed` (e.g. story id). Same seed → same colors, so a story renders
 * identically in vault, library, player, and the now-playing bar.
 */
export function variedTint(
  base: { a: string; b: string },
  seed: string | undefined | null,
): CoverPalette {
  const h = Math.abs(hashStr(seed || 'x'));
  const lOffset = ((h % 21) - 10) / 100; // -0.10 .. +0.10
  const hueOffset = ((h >> 5) % 31) - 15;  // -15 .. +15 deg
  return {
    a: shiftHsl(base.a, hueOffset, 0, lOffset),
    b: shiftHsl(base.b, hueOffset, 0, lOffset * 0.6),
  };
}

function shiftHsl(hex: string, dH: number, dS: number, dL: number): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex((h + dH + 360) % 360, clamp01(s + dS), clamp01(l + dL));
}
function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hh = 0; const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) hh = ((g - b) / d) % 6;
    else if (max === g) hh = (b - r) / d + 2;
    else hh = (r - g) / d + 4;
    hh *= 60;
    if (hh < 0) hh += 360;
  }
  return { h: hh, s, l };
}
function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}
