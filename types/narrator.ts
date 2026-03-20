export interface Narrator {
  id: string;
  userId: string;
  name: string;
  gender: 'male' | 'female' | 'other';
  customGender?: string;
  description: string; // Physical attributes, personality
  relationship: string; // Relationship to user
  additionalDetails: string; // Nicknames, etc
  userNameWithNarrator: string; // User's name when with this narrator
  userGenderWithNarrator: 'male' | 'female' | 'other';
  userCustomGenderWithNarrator?: string;
  voiceId: string;
  voicePreviewAudio?: string; // Base64 encoded preview audio
  color?: string; // Hex color for metallic gradient display
  createdAt: Date;
  updatedAt: Date;
  username?: string | null;
  usernameLowercase?: string | null;
  isPublished?: boolean;
  publishedAt?: Date | null;
  publishedBy?: string | null;
  sourcePublicNarratorId?: string | null;
  sourceUserId?: string | null;
}

export interface PublicNarrator extends Omit<Narrator, 'userId'> {
  isPublished: true;
  publishedAt: Date;
  publishedBy: string;
  sourceUserId: string;
  username: string;
  usernameLowercase: string;
  color?: string;
}
