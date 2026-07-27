/**
 * Shared "synk it" handler: creates the sharedAudio doc + sink link via
 * share-service, then hands the link to the platform share surface.
 * Used by the player's share chip and story-details' synk button.
 */

import { Platform } from 'react-native';
import { shareStoryToSink, type ShareStoryParams } from '@/services/share-service';

export type ShareOutcome = 'shared' | 'copied' | 'opened' | 'canceled';

export async function shareStory(params: ShareStoryParams): Promise<ShareOutcome> {
  const link = await shareStoryToSink(params);
  const shareText = `${params.title || 'a story'} · listen on sink`;

  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    // Prefer the OS share sheet on mobile browsers; fall back to clipboard on desktop.
    const nav: any = navigator;
    if (nav.share) {
      try {
        await nav.share({ title: shareText, url: link });
        return 'shared';
      } catch {
        return 'canceled'; // user dismissed the sheet
      }
    }
    if (nav.clipboard?.writeText) {
      await nav.clipboard.writeText(link);
      return 'copied';
    }
    // Last-resort fallback: open in a new tab so the user can copy from the address bar.
    window.open(link, '_blank');
    return 'opened';
  }

  // Native: defer-import Share so web bundles don't pull it in unnecessarily.
  const { Share } = require('react-native');
  await Share.share({ message: `${shareText}\n${link}`, url: link });
  return 'shared';
}
