export interface SharedAudio {
  id: string;
  sharedBy: string;
  storyId: string;
  title: string;
  audioChunkURLs: string[];
  audioUrl?: string;
  narratorId?: string;
  played: boolean;
  createdAt: Date;
  expiresAt: Date;
  coverColor?: string;
  duration?: '5min' | '10min' | '15min';
  isNighttime: boolean;
}
