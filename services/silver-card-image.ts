/**
 * Silver-card image persistence.
 *
 * Replicate's delivery URLs expire about an hour after generation, so the
 * tarot card revealed during onboarding must be re-hosted on Firebase
 * Storage for the profile screen to render it later. Uploads go under
 * sharedArtwork/{uid}/ — the one Storage path owners may write to
 * (see storage.rules), and it serves the CORS headers CardScene's WebGL
 * texture loader needs.
 *
 * The card's 3D "skin" (silver color map + emboss bump map) is baked once
 * and persisted as two PNGs (colorTexUrl / bumpTexUrl on the silverCard
 * doc); the viewer rebuilds the 3D card from those instantly instead of
 * re-vectorizing the artwork on every open.
 */

import { storage } from '@/config/firebase';
import type { UserProfile } from '@/types/user';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { generateTarotCard } from './replicate-service';
import { updateUserProfile } from './user-service';

type SilverCard = NonNullable<UserProfile['silverCard']>;

/** Decode a data: URL to a Blob without fetch() — RN's fetch can't read data URLs. */
function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const mime = dataUrl.slice(0, comma).match(/data:([^;]+)/)?.[1] ?? 'image/png';
  const bin = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function uploadBlob(uid: string, blob: Blob, name: string): Promise<string> {
  const storageRef = ref(storage, `sharedArtwork/${uid}/${name}`);
  await uploadBytes(storageRef, blob, { contentType: blob.type });
  return getDownloadURL(storageRef);
}

/** Upload the card artwork for a user and return a durable download URL. */
export async function uploadSilverCardImage(uid: string, dataUrl: string): Promise<string> {
  return uploadBlob(uid, dataUrlToBlob(dataUrl), `silver-card-${Date.now()}.png`);
}

/**
 * Bake the silver skin (color + bump PNGs) from a vectorized svg and upload
 * both. Web-only — callers gate on a DOM being present.
 */
export async function bakeAndUploadCardTextures(
  uid: string,
  svg: string,
  aspectRatio: number,
): Promise<{ colorTexUrl: string; bumpTexUrl: string }> {
  const { bakeSilverTextureBlobs } = await import('@/components/silver-card/bake-textures');
  const texW = 1024;
  const texH = Math.round(texW / aspectRatio);
  const { colorBlob, bumpBlob } = await bakeSilverTextureBlobs(svg, texW, texH);
  const ts = Date.now();
  const [colorTexUrl, bumpTexUrl] = await Promise.all([
    uploadBlob(uid, colorBlob, `silver-card-color-${ts}.png`),
    uploadBlob(uid, bumpBlob, `silver-card-bump-${ts}.png`),
  ]);
  return { colorTexUrl, bumpTexUrl };
}

/**
 * Pre-fix cards stored the raw Replicate URL; those images are gone. Only a
 * re-hosted (Firebase Storage) URL is worth rendering or keeping.
 */
export function isDurableCardImageUrl(url: string | undefined): url is string {
  return !!url && !url.includes('replicate.delivery');
}

/** True when the card has its baked silver skin and needs no further prep. */
export function hasBakedTextures(card: SilverCard | null | undefined): boolean {
  return !!card?.colorTexUrl && !!card?.bumpTexUrl;
}

async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`artwork fetch ${res.status}`);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

let restoreInFlight: Promise<SilverCard | null> | null = null;

/**
 * Bring a card fully up to date: regenerate an expired/missing artwork from
 * the stored scene prompt, and (on web) bake + persist the silver textures
 * when absent. Patches users/{uid}.silverCard and returns the updated card,
 * or null when nothing needed (or could) be done. Deduped module-wide — a
 * remount during the ~30s Replicate generation must not start a second paid
 * generation.
 */
export async function restoreSilverCardImage(
  uid: string,
  card: SilverCard,
): Promise<SilverCard | null> {
  const canBake = typeof document !== 'undefined';
  const needsImage = !isDurableCardImageUrl(card.imageUrl);
  const needsTextures = canBake && !hasBakedTextures(card);
  if (!needsImage && !needsTextures) return null;
  const scenePrompt = card.scenePrompt ?? card.landscapePrompt;
  if (needsImage && !scenePrompt) return null;
  if (!restoreInFlight) {
    restoreInFlight = (async () => {
      try {
        let updated: SilverCard = { ...card };
        let dataUrl: string | null = null;
        if (needsImage) {
          const gen = await generateTarotCard(scenePrompt as string);
          dataUrl = gen.dataUrl;
          updated.imageUrl = await uploadSilverCardImage(uid, dataUrl);
        }
        if (canBake && !hasBakedTextures(updated) && updated.imageUrl) {
          try {
            if (!dataUrl) dataUrl = await fetchAsDataUrl(updated.imageUrl);
            const { vectorizeImage } = await import('./vectorize');
            const { svg, width, height } = await vectorizeImage(dataUrl);
            const tex = await bakeAndUploadCardTextures(uid, svg, width / height);
            updated = { ...updated, ...tex };
          } catch (err) {
            console.warn('[silver-card] texture bake failed (artwork still saved):', err);
          }
        }
        await updateUserProfile(uid, { silverCard: updated });
        return updated;
      } finally {
        restoreInFlight = null;
      }
    })();
  }
  return restoreInFlight;
}
