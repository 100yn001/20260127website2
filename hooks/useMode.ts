import { useLocalSearchParams } from 'expo-router';

export type Mode = 'night' | 'day';

export function useMode(): { mode: Mode; modeParam: string } {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: Mode = params.mode === 'day' ? 'day' : 'night';
  return { mode, modeParam: `mode=${mode}` };
}

export function modeCopy(mode: Mode) {
  return mode === 'night'
    ? { label: 'nighttime', blurb: 'romantic encounters and adult themes' }
    : { label: 'daytime', blurb: 'bedtime stories, nature, quiet comfort audios' };
}
