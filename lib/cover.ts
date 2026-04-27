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
