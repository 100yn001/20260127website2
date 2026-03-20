export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  onboardingAnswers: {
    personality?: string;
    preference?: string;
    object?: string;
    descriptors?: string[];
    descriptors2?: string[];
  };
  bookmarkedStories?: string[];
  createdAt: Date;
  updatedAt: Date;
}
