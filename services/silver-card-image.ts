/**
 * Silver-card image persistence.
 *
 * Replicate's delivery URLs expire about an hour after generation, so the
 * tarot card revealed during onboarding must be re-hosted on Firebase
 * Storage for the profile screen to render it later. Uploads go under
 * sharedArtwork/{uid}/ — the one Storage path owners may write to
 * (see storage.rules), and it serves the CORS headers CardScene's WebGL
 * texture loader needs.
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

/** Upload the card image for a user and return a durable download URL. */
export async function uploadSilverCardImage(uid: string, dataUrl: string): Promise<string> {
  const blob = dataUrlToBlob(dataUrl);
  const storageRef = ref(storage, `sharedArtwork/${uid}/silver-card-${Date.now()}.png`);
  await uploadBytes(storageRef, blob, { contentType: blob.type });
  return getDownloadURL(storageRef);
}

/**
 * Pre-fix cards stored the raw Replicate URL; those images are gone. Only a
 * re-hosted (Firebase Storage) URL is worth rendering or keeping.
 */
export function isDurableCardImageUrl(url: string | undefined): url is string {
  return !!url && !url.includes('replicate.delivery');
}

let restoreInFlight: Promise<SilverCard | null> | null = null;

/**
 * Heal a card whose image URL is missing or expired: regenerate from the
 * stored scene prompt, re-host the result, and patch users/{uid}.silverCard.
 * Returns the updated card, or null when nothing needed (or could) be done.
 * Deduped module-wide — a profile remount during the ~30s Replicate
 * generation must not kick off a second paid generation.
 */
export async function restoreSilverCardImage(
  uid: string,
  card: SilverCard,
): Promise<SilverCard | null> {
  if (isDurableCardImageUrl(card.imageUrl)) return null;
  const scenePrompt = card.scenePrompt ?? card.landscapePrompt;
  if (!scenePrompt) return null;
  if (!restoreInFlight) {
    restoreInFlight = (async () => {
      try {
        const { dataUrl } = await generateTarotCard(scenePrompt);
        const imageUrl = await uploadSilverCardImage(uid, dataUrl);
        const updated: SilverCard = { ...card, imageUrl };
        await updateUserProfile(uid, { silverCard: updated });
        return updated;
      } finally {
        restoreInFlight = null;
      }
    })();
  }
  return restoreInFlight;
}
