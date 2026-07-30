import { NarrationMode } from '@/constants/narration-modes';

export interface DepthLayer {
  x: number;
  y: number;
  size: number;
  opacity: number;
  depth: number;
}

export interface Story {
  id: string;
  userId: string;
  title: string;
  audioUrl: string;
  audioChunkURLs?: string[];
  transcript: string;
  prompt?: string; // Description from create tab
  tags?: string[]; // Location, setting, etc from recipe tab
  setting: string;
  location: string;
  character: string;
  genderSelf: string;
  genderOther: string;
  trope: string;
  isNighttime: boolean;
  features?: string[];
  featurePreferences?: Record<string, string[]>;
  duration: '5min' | '10min' | '15min';
  narrationMode?: NarrationMode; // immersive | intermediate | cinematic
  narrativeRatio?: number; // legacy descriptive·direct (kept for back-compat)
  narratorId?: string;
  createdAt: Date;
  coverColor?: string;
  topographyLayers?: DepthLayer[];
  // legacy — generated-ambient feature removed; old docs may still carry these.
  // Playback-side ambience is now the player's universal bed toggle
  // (constants/ambient-beds.ts), not per-story data.
  ambientUrl?: string;
  ambientPrompt?: string;
}

export interface SharedAudio {
  id: string;
  /** UID of the user who shared this audio */
  sharedBy: string;
  /** Original story ID in the 'stories' collection */
  storyId: string;
  /** Story title for display in Sink */
  title: string;
  /** Firebase Storage download URLs for audio chunks */
  audioChunkURLs: string[];
  /** Single merged audio URL (if available) */
  audioUrl?: string;
  /** Narrator name/ID for display */
  narratorId?: string;
  /** Whether the audio has been played in Sink */
  played: boolean;
  /** Timestamp when the shared link was created */
  createdAt: Date;
  /** Timestamp when the link expires (auto-cleanup) */
  expiresAt: Date;
  /** Cover color from the original story */
  coverColor?: string;
  /** Duration label from the original story */
  duration?: '5min' | '10min' | '15min';
  /** Whether this is a nighttime story */
  isNighttime: boolean;
}

export interface PreGeneratedStory {
  id: string;
  title: string;
  description: string;
  audioUrl: string;
  audioChunkURLs?: string[];
  transcript: string;
  setting: string;
  character: string;
  trope: string;
  isNighttime: boolean;
  thumbnailUrl?: string;
  duration?: number;
  createdAt: Date;
}
