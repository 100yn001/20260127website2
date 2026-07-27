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
    /** Storage URLs of the baked silver material textures (color + emboss
     *  bump). The 3D card rebuilds instantly from these — geometry, lights
     *  and controls are trivial; only this "skin" is expensive to derive. */
    colorTexUrl?: string;
    bumpTexUrl?: string;
    generatedAt?: Date;
    /** Legacy field — kept for back-compat reads of pre-classifier docs. */
    landscapePrompt?: string;
  };
  bookmarkedStories?: string[];
  /** Stripe Customer object id, populated by the createStripeCustomer Cloud
   *  Function on first signup. Absent for any user who signed up before the
   *  Stripe rollout or whose post-signup callable invocation failed. */
  stripeCustomerId?: string;
  /** Stripe Subscription object id for the user's $0/month "yn beta" sub. */
  stripeSubscriptionId?: string;
  /** Server timestamp set when the Stripe Customer is first created. Used as
   *  the anchor for "5 free stories a day for a month" beta messaging and
   *  any future trial-window logic. */
  betaTrialStartedAt?: Date;
  /** Per-day generation counter for the client-side beta cap. `date` is a
   *  local 'YYYY-MM-DD' string so a midnight rollover resets the count. */
  dailyUsage?: { date: string; count: number };
  createdAt: Date;
  updatedAt: Date;
}
