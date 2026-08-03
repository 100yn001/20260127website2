import { AMBIENT_BED_URLS } from './ambient-beds.generated';

// Universal playback-side ambience: a small fixed menu of loopable synthesized
// beds the player can layer under ANY audio. Default is always none — ambience
// is opt-in per listen, never baked into app audio and never personalized (the
// old generated-ambient feature stays removed).
//
// Files are 120s phase-continuous loops with their under-voice level baked in
// (the player plays them at volume 1, rate 1). Rendered + uploaded by
// scripts/public-stories/beds.mjs; adding a bed later = new file + new label,
// no player changes.

export type AmbientBedKey = 'rain' | 'street' | 'waves' | 'forest' | 'hum';

export const AMBIENT_BED_LABELS: Record<AmbientBedKey, string> = {
  rain: 'rain',
  street: 'night street',
  waves: 'waves',
  forest: 'forest',
  hum: 'low hum',
};

/** Beds that are actually uploaded and playable right now. */
export function availableAmbientBeds(): AmbientBedKey[] {
  return (Object.keys(AMBIENT_BED_LABELS) as AmbientBedKey[]).filter(
    (k) => typeof AMBIENT_BED_URLS[k] === 'string' && AMBIENT_BED_URLS[k].startsWith('https://'),
  );
}

export function ambientBedUrl(key: string): string | null {
  const url = AMBIENT_BED_URLS[key];
  return typeof url === 'string' && url.startsWith('https://') ? url : null;
}
