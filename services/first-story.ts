/**
 * Native stub for the onboarding first-story step.
 *
 * The actual generation/playback path lives in `first-story.web.ts` and uses
 * URL.createObjectURL / HTML <audio>. The onboarding step is gated on
 * Platform.OS === 'web' so this stub should never be invoked at runtime —
 * it exists so TypeScript's default (.ts) resolution finds matching exports
 * with the Blob types this app uses on the web target.
 */

export type FirstStoryGender = 'male' | 'female' | 'neutral';
export type FirstStoryScenario = 'walk' | 'meditation';

export interface GeneratedFirstStory {
  transcript: string;
  narrationBlobs: Blob[];
  ambientBlob: Blob | null;
  scenario: FirstStoryScenario;
  gender: FirstStoryGender;
}

export async function generateFirstStory(_args: {
  name: string;
  gender: FirstStoryGender;
  scenario: FirstStoryScenario;
}): Promise<GeneratedFirstStory> {
  throw new Error('generateFirstStory is web-only');
}

export async function saveFirstStory(
  _uid: string,
  _story: GeneratedFirstStory,
): Promise<string> {
  throw new Error('saveFirstStory is web-only');
}
