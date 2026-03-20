export interface Voice {
  id: string;
  accent: string;
  gender: 'male' | 'female' | 'neutral';
  descriptors: string[];
}

export interface CustomVoice {
  id: string; // Firestore doc ID
  userId: string;
  voiceId: string; // ElevenLabs permanent voice ID
  name: string; // User-given name for the voice
  gender: 'male' | 'female' | 'neutral';
  accent: string;
  descriptors: string; // e.g. "warm, deep"
  voiceDesignDescription: string; // The full description sent to ElevenLabs
  previewAudioBase64?: string; // Cached preview audio
  createdAt: Date;
}
