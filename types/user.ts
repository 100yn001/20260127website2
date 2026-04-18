export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  onboardingAnswers: {
    personalityInitial?: Record<string, string>;
    personalityReally?: Record<string, string>;
    personality?: string;
    preference?: string;
    object?: string;
    animal?: string;
    descriptors?: string[];
    descriptors2?: string[];
    [k: string]: unknown;
  };
  silverCard?: {
    storytellingWords: string;
    landscapePrompt: string;
    imageUrl?: string;
    generatedAt?: Date;
  };
  bookmarkedStories?: string[];
  createdAt: Date;
  updatedAt: Date;
}
