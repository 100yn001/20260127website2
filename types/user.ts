import type { ArchetypeId, HeroSub, MuseSub, ShadowSub } from '@/constants/archetypes';

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
    archetypeId: ArchetypeId;        // e.g. "muse-lover"
    archetypeTitle: string;          // e.g. "The Troubadour"
    heroSub: HeroSub;
    museSub: MuseSub;
    shadowSub: ShadowSub;
    scenePrompt: string;             // composed prompt actually sent to Replicate
    imageUrl?: string;
    generatedAt?: Date;
    /** Legacy field — kept for back-compat reads of pre-classifier docs. */
    landscapePrompt?: string;
  };
  bookmarkedStories?: string[];
  createdAt: Date;
  updatedAt: Date;
}
