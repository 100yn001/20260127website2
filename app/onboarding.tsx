import { auth, functions } from '@/config/firebase';
import { personalityInitial, personalityReally } from '@/constants/personality-sets';
import { useAuth } from '@/contexts/AuthContext';
import { describeStorytellingStyle } from '@/services/claude-service';
import { generateTarotCard } from '@/services/replicate-service';
import { classifyArchetype } from '@/services/archetype';
import {
    ARCHETYPES_BY_ID,
    composeScene,
    type ArchetypeId,
    type HeroSub,
    type MuseSub,
    type ShadowSub,
} from '@/constants/archetypes';
import {
    generateFirstStory,
    saveFirstStory,
    type FirstStoryGender,
    type FirstStoryScenario,
    type GeneratedFirstStory,
} from '@/services/first-story';
import { saveSilverCard, saveUserProfile } from '@/services/user-service';
import CardScene from '@/components/silver-card/CardScene';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withTiming,
} from 'react-native-reanimated';

type Step =
  | 'welcome'
  | 'birthday'
  | 'intro-audio'
  | 'initial-quiz'
  | 'initial-recap'
  | 'intro-really'
  | 'quiz'
  | 'object'
  | 'animal'
  | 'descriptors'
  | 'descriptors2'
  | 'name'
  | 'storyteller-recap'
  | 'first-story'
  | 'signup';

const MIN_AGE_YEARS = 18;

// Returns a whole-number age in years if the inputs form a valid Gregorian
// date in the past, otherwise null. Used to gate onboarding on 18+.
function computeAgeYears(
  monthStr: string,
  dayStr: string,
  yearStr: string,
  today: Date,
): number | null {
  if (!/^\d{1,2}$/.test(monthStr) || !/^\d{1,2}$/.test(dayStr) || !/^\d{4}$/.test(yearStr)) {
    return null;
  }
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const year = parseInt(yearStr, 10);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900) return null;
  const dob = new Date(year, month - 1, day);
  if (
    dob.getFullYear() !== year ||
    dob.getMonth() !== month - 1 ||
    dob.getDate() !== day
  ) {
    return null;
  }
  if (dob.getTime() > today.getTime()) return null;
  let age = today.getFullYear() - year;
  const beforeBirthdayThisYear =
    today.getMonth() < dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate());
  if (beforeBirthdayThisYear) age -= 1;
  return age;
}

type Pipeline = {
  words?: string;
  /** Display title, e.g. "The Troubadour". */
  archetype?: string;
  /** Stable id of the chosen archetype, e.g. "muse-lover". */
  archetypeId?: ArchetypeId;
  heroSub?: HeroSub;
  museSub?: MuseSub;
  shadowSub?: ShadowSub;
  /** The full composed scene prompt sent to Replicate. */
  landscape?: string;
  imageUrl?: string;
  remoteUrl?: string;
  svg?: string;
  dims?: { width: number; height: number };
  error?: string;
};

// Shuffle and pick 10 random questions
const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const objects = ['mirror', 'hourglass', 'globe', 'violin', 'kite', 'magnet'];

const animals = ['raven', 'bear', 'seahorse', 'fox', 'rabbit', 'beetle'];

const descriptorWords = [
  'sensitive', 'candid', 'thoughtful',
  'methodical', 'grounded', 'messy',
  'quiet', 'decisive', 'detached',
];

const descriptorWords2 = [
  'stoic', 'discerning', 'expressive',
  'loud', 'dreamy', 'intuitive',
  'tender', 'weird', 'introspective',
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { user, signUp, signIn: _signIn } = useAuth();
  const [step, setStep] = useState<Step>('welcome');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [initialIndex, setInitialIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [selectedInitialChoice, setSelectedInitialChoice] = useState<string | null>(null);
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [selectedAnimal, setSelectedAnimal] = useState<string | null>(null);
  const [selectedDescriptors, setSelectedDescriptors] = useState<string[]>([]);
  const [selectedDescriptors2, setSelectedDescriptors2] = useState<string[]>([]);
  const [questions] = useState(() => shuffleArray(personalityReally).slice(0, 10));
  const [initialQuestions] = useState(() => personalityInitial);
  const [initialAnswers, setInitialAnswers] = useState<Record<string, string>>({});
  const [reallyAnswers, setReallyAnswers] = useState<Record<string, string>>({});
  const [nameInput, setNameInput] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const birthMonthRef = useRef<TextInput>(null);
  const birthDayRef = useRef<TextInput>(null);
  const birthYearRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(false);
  const [showExistingAccountModal, setShowExistingAccountModal] = useState(false);
  const [pipeline, setPipeline] = useState<Pipeline>({});
  const pipelineStarted = useRef(false);

  // ── First-story step (after silver-card reveal, before signup) ─────────
  type FirstStoryStage = 'pick' | 'generating' | 'ready' | 'error';
  const [firstStoryStage, setFirstStoryStage] = useState<FirstStoryStage>('pick');
  const [firstStoryGender, setFirstStoryGender] = useState<FirstStoryGender | null>(null);
  const [firstStoryScenario, setFirstStoryScenario] = useState<FirstStoryScenario | null>(null);
  const [firstStoryError, setFirstStoryError] = useState<string | null>(null);
  const [firstStory, setFirstStory] = useState<GeneratedFirstStory | null>(null);
  // Object URLs for the player. Created after blobs land, revoked on unmount.
  const [narrationUrls, setNarrationUrls] = useState<string[]>([]);
  const [ambientUrl, setAmbientUrl] = useState<string | null>(null);
  const [firstStoryPlaying, setFirstStoryPlaying] = useState(false);
  const [firstStoryAmbientOn, setFirstStoryAmbientOn] = useState(true);
  const narrationAudioRef = useRef<HTMLAudioElement | null>(null);
  const ambientAudioRef = useRef<HTMLAudioElement | null>(null);
  const narrationChunkIndexRef = useRef(0);
  // Per-chunk durations in seconds, populated by probing each narration URL
  // once it lands. Total story duration = sum. Progress bar uses elapsed/total.
  const [chunkDurations, setChunkDurations] = useState<number[]>([]);
  const [firstStoryProgress, setFirstStoryProgress] = useState(0);
  // Stable per-onboarding-session seed used as the FNV-1a tiebreak input
  // for the archetype classifier. Generated once at mount; the user's real
  // uid isn't known until signup, but classification needs to run earlier.
  const sessionIdRef = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const [cardPainted, setCardPainted] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [overlayMounted, setOverlayMounted] = useState(true);
  const [nameSubmitting, setNameSubmitting] = useState(false);
  const revealedRef = useRef(false);

  const opacity = useSharedValue(0);
  const welcomeOpacity = useSharedValue(0);
  const toOpacity = useSharedValue(0);
  const ynOpacity = useSharedValue(0);
  const buttonOpacity = useSharedValue(0);

  // Storyteller-recap staggered fade-in values
  const recapLeadOpacity = useSharedValue(0);
  const recapWord1Opacity = useSharedValue(0);
  const recapWord2Opacity = useSharedValue(0);
  const recapWord3Opacity = useSharedValue(0);
  const recapTailOpacity = useSharedValue(0);
  const recapButtonOpacity = useSharedValue(0);
  const recapOverlayOpacity = useSharedValue(1);
  const cardWrapOpacity = useSharedValue(0);
  const cardTitleOpacity = useSharedValue(0);
  const cardContinueOpacity = useSharedValue(0);

  useEffect(() => {
    const fetchOnboardingStatus = async () => {
      const stored = await AsyncStorage.getItem('hasCompletedOnboarding');
      setHasCompletedOnboarding(stored === 'true');
    };
    fetchOnboardingStatus();
  }, []);

  useEffect(() => {
    if (user && hasCompletedOnboarding && step === 'welcome') {
      router.replace('/(tabs)/library');
    }
  }, [user, hasCompletedOnboarding, step, router]);


  useEffect(() => {
    if (step === 'welcome') {
      // Reset all opacity values to 0 first
      welcomeOpacity.value = 0;
      toOpacity.value = 0;
      ynOpacity.value = 0;
      buttonOpacity.value = 0;
      
      // Then stagger word appearances
      welcomeOpacity.value = withTiming(1, { duration: 700 });
      toOpacity.value = withDelay(400, withTiming(1, { duration: 700 }));
      ynOpacity.value = withDelay(800, withTiming(1, { duration: 1000 }));
      buttonOpacity.value = withDelay(4300, withTiming(1, { duration: 1500 }));
    } else {
      opacity.value = withTiming(1, { duration: 1200 });
    }
  }, [step]);

  // Auto-transition for black-screen intro steps
  useEffect(() => {
    if (step === 'intro-audio') {
      const timer = setTimeout(() => advanceStepWithFade('initial-quiz'), 3500);
      return () => clearTimeout(timer);
    }
    if (step === 'initial-recap') {
      const timer = setTimeout(() => advanceStepWithFade('intro-really'), 4500);
      return () => clearTimeout(timer);
    }
    if (step === 'intro-really') {
      const timer = setTimeout(() => advanceStepWithFade('quiz'), 3000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  // Trigger the staggered fade-in once the full pipeline has finished AND
  // the 3D card has painted its textures. Until then the overlay shows a
  // spinner; once ready the storyteller sentence reveals word-by-word and
  // the "reveal" button fades in last.
  const fullyReady =
    !!pipeline.words && !!pipeline.archetype && !!pipeline.svg && !!pipeline.dims && cardPainted;

  useEffect(() => {
    if (!fullyReady) return;
    recapLeadOpacity.value = withTiming(1, { duration: 800 });
    recapWord1Opacity.value = withDelay(700, withTiming(1, { duration: 700 }));
    recapWord2Opacity.value = withDelay(1300, withTiming(1, { duration: 700 }));
    recapWord3Opacity.value = withDelay(1900, withTiming(1, { duration: 700 }));
    recapTailOpacity.value = withDelay(2600, withTiming(1, { duration: 800 }));
    recapButtonOpacity.value = withDelay(3400, withTiming(1, { duration: 900 }));
  }, [
    fullyReady,
    recapLeadOpacity,
    recapWord1Opacity,
    recapWord2Opacity,
    recapWord3Opacity,
    recapTailOpacity,
    recapButtonOpacity,
  ]);

  const handleReveal = () => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    setReveal(true);
    recapOverlayOpacity.value = withTiming(0, { duration: 900 });
    cardWrapOpacity.value = withTiming(1, { duration: 900 });
    cardTitleOpacity.value = withDelay(700, withTiming(1, { duration: 900 }));
    cardContinueOpacity.value = withDelay(1300, withTiming(1, { duration: 900 }));
    setTimeout(() => setOverlayMounted(false), 950);
  };

  // Kick off the silver-card pipeline as soon as the user lands on the
  // storyteller-recap screen so the slow Replicate generation overlaps with
  // the time the user spends reading their archetype.
  useEffect(() => {
    if (step !== 'storyteller-recap' || pipelineStarted.current) return;
    pipelineStarted.current = true;

    (async () => {
      try {
        // 1. Pure-function classification — instant, no network round-trip.
        const classification = classifyArchetype(answers, sessionIdRef.current);
        const archetypeDef = ARCHETYPES_BY_ID[classification.primary];
        const scenePrompt = composeScene(
          classification.primary,
          classification.heroSub,
          classification.museSub,
          classification.shadowSub,
        );
        setPipeline((p) => ({
          ...p,
          archetypeId: classification.primary,
          archetype: archetypeDef.title,
          heroSub: classification.heroSub,
          museSub: classification.museSub,
          shadowSub: classification.shadowSub,
          landscape: scenePrompt,
        }));

        // 2. Claude (3 adjective words) and Replicate (the slow tarot
        //    image) both depend only on `answers` / `scenePrompt` — neither
        //    on each other. Run them in parallel.
        const [words, card] = await Promise.all([
          describeStorytellingStyle(answers),
          generateTarotCard(scenePrompt),
        ]);
        setPipeline((p) => ({
          ...p,
          words,
          imageUrl: card.dataUrl,
          remoteUrl: card.remoteUrl,
        }));

        // 3. Vectorize on web; just measure on native.
        if (Platform.OS === 'web') {
          const { vectorizeImage } = await import('@/services/vectorize');
          const { svg, width, height } = await vectorizeImage(card.dataUrl);
          setPipeline((p) => ({ ...p, svg, dims: { width, height } }));
        } else {
          const dims = await new Promise<{ width: number; height: number }>((resolve) => {
            Image.getSize(
              card.dataUrl,
              (width, height) => resolve({ width, height }),
              () => resolve({ width: 2, height: 3 }),
            );
          });
          setPipeline((p) => ({ ...p, dims }));
        }
      } catch (err) {
        console.error('[silver-card pipeline] failed:', err);
        setPipeline((p) => ({
          ...p,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    })();
  }, [step, answers]);

  const advanceStepWithFade = (next: Step) => {
    opacity.value = withTiming(0, { duration: 600 });
    setTimeout(() => {
      setStep(next);
      opacity.value = withTiming(1, { duration: 800 });
    }, 650);
  };

  const handleInitialChoice = (choice: string) => {
    setSelectedInitialChoice(choice);
    const currentQuestion = initialQuestions[initialIndex];
    const questionKey = `initial_${currentQuestion.top}_${currentQuestion.bottom}`;
    setInitialAnswers((prev) => ({ ...prev, [questionKey]: choice }));
    setAnswers((prev) => ({ ...prev, [questionKey]: choice }));

    setTimeout(() => {
      opacity.value = withTiming(0, { duration: 500 });
      setTimeout(() => {
        if (initialIndex < initialQuestions.length - 1) {
          setInitialIndex(initialIndex + 1);
          setSelectedInitialChoice(null);
          opacity.value = withTiming(1, { duration: 700 });
        } else {
          setStep('initial-recap');
          opacity.value = withTiming(1, { duration: 700 });
        }
      }, 550);
    }, 1000);
  };

  const handleChoice = (choice: string) => {
    setSelectedChoice(choice);
    const currentQuestion = questions[questionIndex];
    const questionKey = `really_${currentQuestion.top}_${currentQuestion.bottom}`;
    setReallyAnswers((prev) => ({ ...prev, [questionKey]: choice }));
    setAnswers((prev) => ({ ...prev, [questionKey]: choice }));

    setTimeout(() => {
      opacity.value = withTiming(0, { duration: 500 });
      setTimeout(() => {
        if (questionIndex < questions.length - 1) {
          setQuestionIndex(questionIndex + 1);
          setSelectedChoice(null);
        } else {
          setStep('object');
        }
        opacity.value = withTiming(1, { duration: 700 });
      }, 550);
    }, 1000);
  };

  const handleObjectChoice = (object: string) => {
    setSelectedObject(object);
    setAnswers({ ...answers, object });
    
    setTimeout(() => {
      opacity.value = withTiming(0, { duration: 500 });
      setTimeout(() => {
        setStep('animal');
        opacity.value = withTiming(1, { duration: 700 });
      }, 550);
    }, 1000);
  };

  const handleAnimalChoice = (animal: string) => {
    setSelectedAnimal(animal);
    setAnswers({ ...answers, animal });
    
    setTimeout(() => {
      opacity.value = withTiming(0, { duration: 500 });
      setTimeout(() => {
        setStep('descriptors');
        opacity.value = withTiming(1, { duration: 700 });
      }, 550);
    }, 1200);
  };

  const toggleDescriptor = (word: string) => {
    if (selectedDescriptors.includes(word)) {
      setSelectedDescriptors(selectedDescriptors.filter(w => w !== word));
    } else if (selectedDescriptors.length < 3) {
      setSelectedDescriptors([...selectedDescriptors, word]);
    }
  };

  const handleDescriptorsContinue = () => {
    setAnswers({ ...answers, descriptors: selectedDescriptors.join(', ') });
    opacity.value = withTiming(0, { duration: 500 });
    setTimeout(() => {
      setStep('descriptors2');
      opacity.value = withTiming(1, { duration: 700 });
    }, 550);
  };

  const toggleDescriptor2 = (word: string) => {
    if (selectedDescriptors2.includes(word)) {
      setSelectedDescriptors2(selectedDescriptors2.filter(w => w !== word));
    } else if (selectedDescriptors2.length < 3) {
      setSelectedDescriptors2([...selectedDescriptors2, word]);
    }
  };

  const handleDescriptors2Continue = () => {
    setAnswers({ ...answers, descriptors2: selectedDescriptors2.join(', ') });
    opacity.value = withTiming(0, { duration: 500 });
    setTimeout(() => {
      setStep('name');
      opacity.value = withTiming(1, { duration: 700 });
    }, 550);
  };

  const handleNameSubmit = async () => {
    if (!nameInput.trim()) return;

    // Cover the name step with a black+spinner overlay immediately so the
    // ~50ms gap between fade-out and storyteller-recap mounting isn't a
    // visible black-only frame — the spinner is already there and the
    // storyteller-recap's overlay (same bg, same spinner position) takes
    // over seamlessly.
    setNameSubmitting(true);
    opacity.value = withTiming(0, { duration: 400 });
    setTimeout(() => {
      setStep('storyteller-recap');
      opacity.value = withTiming(1, { duration: 500 });
      setNameSubmitting(false);
    }, 400);
  };

  const handleSignUpSubmit = async () => {
    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    try {
      setIsLoading(true);
      
      // Create Firebase auth account (this also signs in the user)
      await signUp(email, password);
      
      // Wait a moment for auth state to update
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const currentUser = auth.currentUser;
      
      if (!currentUser) throw new Error('Failed to get user');

      // Provision a Stripe Checkout Session and a Customer (idempotent by
      // firebaseUid metadata). The Cloud Function also stamps
      // stripeCustomerId + betaTrialStartedAt on the user doc, so the
      // local saveUserProfile call below only needs to mirror customerId.
      // Failure is non-blocking: signup still completes and the user lands
      // in the library — we just skip the Stripe redirect.
      let stripeCustomerId: string | undefined;
      let stripeCheckoutUrl: string | undefined;
      try {
        // Stripe requires absolute success/cancel URLs. On native there's no
        // window.location, so fall back to the canonical production origin
        // instead of '' (which produced relative URLs Stripe rejects).
        const origin =
          Platform.OS === 'web' && typeof window !== 'undefined'
            ? window.location.origin
            : 'https://yourname.media';
        const createStripeCustomer = httpsCallable<
          { email: string; name: string; successUrl: string; cancelUrl: string },
          { customerId: string; checkoutUrl: string }
        >(functions, 'createStripeCustomer');
        const result = await createStripeCustomer({
          email,
          name: nameInput,
          // Stripe redirects here after the user clicks "Subscribe" or "Back".
          // Both land in the library so onboarding always terminates.
          successUrl: `${origin}/library?checkout=success`,
          cancelUrl: `${origin}/library?checkout=cancel`,
        });
        stripeCustomerId = result.data.customerId;
        stripeCheckoutUrl = result.data.checkoutUrl;
      } catch (err) {
        console.warn('createStripeCustomer failed (continuing):', err);
      }

      // Save user profile with onboarding answers to Firestore
      const dob =
        birthMonth && birthDay && birthYear.length === 4
          ? `${birthYear}-${birthMonth.padStart(2, '0')}-${birthDay.padStart(2, '0')}`
          : undefined;
      await saveUserProfile(
        currentUser.uid,
        email,
        nameInput,
        {
          personalityInitial: initialAnswers,
          personalityReally: reallyAnswers,
          object: selectedObject || undefined,
          animal: selectedAnimal || undefined,
          descriptors: selectedDescriptors,
          descriptors2: selectedDescriptors2,
          dob,
        } as any,
        stripeCustomerId ? { stripeCustomerId } : undefined,
      );

      // Persist the silver card alongside the user profile
      if (
        pipeline.words &&
        pipeline.archetypeId &&
        pipeline.archetype &&
        pipeline.heroSub &&
        pipeline.museSub &&
        pipeline.shadowSub &&
        pipeline.landscape
      ) {
        await saveSilverCard(currentUser.uid, {
          storytellingWords: pipeline.words,
          archetypeId: pipeline.archetypeId,
          archetypeTitle: pipeline.archetype,
          heroSub: pipeline.heroSub,
          museSub: pipeline.museSub,
          shadowSub: pipeline.shadowSub,
          scenePrompt: pipeline.landscape,
          imageUrl: pipeline.remoteUrl,
        }).catch((err) => console.warn('saveSilverCard failed:', err));
      }

      // Persist the first-story (generated pre-signup, blobs held in state).
      // Failure here doesn't block onboarding completion — the user has
      // already heard the story, and we'd rather land them in the app than
      // strand them on the signup screen.
      if (firstStory) {
        try {
          await saveFirstStory(currentUser.uid, firstStory);
        } catch (err) {
          console.warn('saveFirstStory failed:', err);
        }
      }

      // Also save to AsyncStorage for offline access
      await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
      await AsyncStorage.setItem('userName', nameInput);
      await AsyncStorage.setItem('onboardingAnswers', JSON.stringify(answers));

      setIsLoading(false);

      // If Stripe came back with a Checkout URL, hand the user off there;
      // Stripe will redirect back to /library?checkout=success once they
      // confirm. If Stripe was unreachable or we're on native, fall back
      // to the normal in-app redirect.
      if (stripeCheckoutUrl && Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.assign(stripeCheckoutUrl);
      } else {
        router.replace('/(tabs)/library');
      }

    } catch (error: any) {
      setIsLoading(false);
      
      // Check if email already exists
      if (error.code === 'auth/email-already-in-use' || error.message?.includes('email-already-in-use')) {
        setShowExistingAccountModal(true);
      } else {
        Alert.alert('sign up failed', error.message);
      }
    }
  };


  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const welcomeStyle = useAnimatedStyle(() => ({
    opacity: welcomeOpacity.value,
  }));

  const toStyle = useAnimatedStyle(() => ({
    opacity: toOpacity.value,
  }));

  const ynStyle = useAnimatedStyle(() => ({
    opacity: ynOpacity.value,
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
  }));

  const recapLeadStyle = useAnimatedStyle(() => ({ opacity: recapLeadOpacity.value }));
  const recapWord1Style = useAnimatedStyle(() => ({ opacity: recapWord1Opacity.value }));
  const recapWord2Style = useAnimatedStyle(() => ({ opacity: recapWord2Opacity.value }));
  const recapWord3Style = useAnimatedStyle(() => ({ opacity: recapWord3Opacity.value }));
  const recapTailStyle = useAnimatedStyle(() => ({ opacity: recapTailOpacity.value }));
  const recapButtonStyle = useAnimatedStyle(() => ({ opacity: recapButtonOpacity.value }));
  const recapOverlayStyle = useAnimatedStyle(() => ({ opacity: recapOverlayOpacity.value }));
  const cardWrapStyle = useAnimatedStyle(() => ({ opacity: cardWrapOpacity.value }));
  const cardTitleStyle = useAnimatedStyle(() => ({ opacity: cardTitleOpacity.value }));
  const cardContinueStyle = useAnimatedStyle(() => ({ opacity: cardContinueOpacity.value }));

  const handleWelcomeContinue = () => {
    // Fade out welcome screen elements
    buttonOpacity.value = withTiming(0, { duration: 800 });
    welcomeOpacity.value = withTiming(0, { duration: 900 });
    toOpacity.value = withTiming(0, { duration: 900 });
    ynOpacity.value = withTiming(0, { duration: 900 });
    setTimeout(() => {
      setStep('birthday');
      opacity.value = withTiming(1, { duration: 900 });
    }, 1000);
  };

  const birthdayAge = computeAgeYears(birthMonth, birthDay, birthYear, new Date());
  const birthdayComplete =
    birthMonth.length > 0 && birthDay.length > 0 && birthYear.length === 4;
  const birthdayValid = birthdayAge !== null;
  const birthdayUnderage =
    birthdayComplete && birthdayValid && (birthdayAge as number) < MIN_AGE_YEARS;
  const birthdayBadDate = birthdayComplete && !birthdayValid;
  const birthdayCanContinue =
    birthdayValid && (birthdayAge as number) >= MIN_AGE_YEARS;

  // Build object URLs for the player when blobs land. Revoke them when the
  // step unmounts or the user generates a new story so we don't leak.
  useEffect(() => {
    if (!firstStory) return;
    const nUrls = firstStory.narrationBlobs.map((b) => URL.createObjectURL(b));
    const aUrl = firstStory.ambientBlob
      ? URL.createObjectURL(firstStory.ambientBlob)
      : null;
    setNarrationUrls(nUrls);
    setAmbientUrl(aUrl);
    setChunkDurations([]);
    setFirstStoryProgress(0);
    return () => {
      nUrls.forEach((u) => URL.revokeObjectURL(u));
      if (aUrl) URL.revokeObjectURL(aUrl);
    };
  }, [firstStory]);

  // Probe each narration chunk's duration so the progress bar can compute
  // elapsed/total before the user starts playback. Each probe is cheap (a
  // throwaway Audio element resolving on `loadedmetadata`); cancellation
  // flips a local flag so a unit-tested race doesn't write stale state.
  useEffect(() => {
    if (narrationUrls.length === 0) return;
    let cancelled = false;
    const durations: number[] = new Array(narrationUrls.length).fill(0);
    let resolved = 0;
    narrationUrls.forEach((url, i) => {
      const probe = new Audio();
      probe.preload = 'metadata';
      const onMeta = () => {
        const d = probe.duration;
        durations[i] = Number.isFinite(d) && d > 0 ? d : 0;
        resolved += 1;
        if (resolved === narrationUrls.length && !cancelled) {
          setChunkDurations(durations);
        }
        probe.removeEventListener('loadedmetadata', onMeta);
      };
      probe.addEventListener('loadedmetadata', onMeta);
      probe.src = url;
    });
    return () => {
      cancelled = true;
    };
  }, [narrationUrls]);

  // Tear down audio on unmount so a back-nav doesn't leave anything playing.
  useEffect(() => {
    return () => {
      narrationAudioRef.current?.pause();
      ambientAudioRef.current?.pause();
    };
  }, []);

  const startFirstStoryGeneration = async () => {
    if (!firstStoryGender || !firstStoryScenario) return;
    if (Platform.OS !== 'web') {
      setFirstStoryError('first-story playback is web-only for now');
      setFirstStoryStage('error');
      return;
    }
    setFirstStoryError(null);
    setFirstStoryStage('generating');
    try {
      const story = await generateFirstStory({
        name: nameInput.trim() || 'friend',
        gender: firstStoryGender,
        scenario: firstStoryScenario,
      });
      setFirstStory(story);
      setFirstStoryStage('ready');
    } catch (err) {
      console.error('first-story generation failed:', err);
      setFirstStoryError(err instanceof Error ? err.message : String(err));
      setFirstStoryStage('error');
    }
  };

  const playNarrationFromIndex = (i: number) => {
    if (!narrationUrls.length) return;
    const audio = narrationAudioRef.current;
    if (!audio) return;
    narrationChunkIndexRef.current = i;
    audio.src = narrationUrls[i];
    audio.play().catch((err) => console.warn('narration play failed:', err));
  };

  const handleNarrationEnded = () => {
    const next = narrationChunkIndexRef.current + 1;
    if (next < narrationUrls.length) {
      playNarrationFromIndex(next);
    } else {
      setFirstStoryPlaying(false);
      narrationChunkIndexRef.current = 0;
      setFirstStoryProgress(0);
      ambientAudioRef.current?.pause();
    }
  };

  const handleNarrationTimeUpdate = () => {
    const audio = narrationAudioRef.current;
    if (!audio) return;
    const total = chunkDurations.reduce((a, b) => a + b, 0);
    if (total <= 0) return;
    const before = chunkDurations
      .slice(0, narrationChunkIndexRef.current)
      .reduce((a, b) => a + b, 0);
    const elapsed = before + (Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
    const ratio = Math.min(1, Math.max(0, elapsed / total));
    setFirstStoryProgress(ratio);
  };

  const handleFirstStoryPlayPause = () => {
    const narration = narrationAudioRef.current;
    const ambient = ambientAudioRef.current;
    if (!narration) return;
    if (firstStoryPlaying) {
      narration.pause();
      ambient?.pause();
      setFirstStoryPlaying(false);
      return;
    }
    if (!narration.src) {
      playNarrationFromIndex(0);
    } else {
      narration.play().catch((err) => console.warn('narration resume failed:', err));
    }
    if (firstStoryAmbientOn && ambient && ambientUrl) {
      if (!ambient.src) ambient.src = ambientUrl;
      ambient.loop = true;
      ambient.volume = 0.35;
      ambient.play().catch((err) => console.warn('ambient play failed:', err));
    }
    setFirstStoryPlaying(true);
  };

  const handleAmbientToggle = () => {
    const next = !firstStoryAmbientOn;
    setFirstStoryAmbientOn(next);
    const ambient = ambientAudioRef.current;
    if (!ambient || !ambientUrl) return;
    if (next) {
      if (!ambient.src) ambient.src = ambientUrl;
      ambient.loop = true;
      ambient.volume = 0.35;
      if (firstStoryPlaying) {
        ambient.play().catch((err) => console.warn('ambient resume failed:', err));
      }
    } else {
      ambient.pause();
    }
  };

  const handleFirstStoryContinue = () => {
    narrationAudioRef.current?.pause();
    ambientAudioRef.current?.pause();
    setFirstStoryPlaying(false);
    setFirstStoryProgress(0);
    advanceStepWithFade('signup');
  };

  const handleBirthdaySubmit = () => {
    if (!birthdayCanContinue) return;
    const mm = birthMonth.padStart(2, '0');
    const dd = birthDay.padStart(2, '0');
    setAnswers((prev) => ({ ...prev, dob: `${birthYear}-${mm}-${dd}` }));
    advanceStepWithFade('intro-audio');
  };

  if (step === 'welcome') {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <View style={styles.titleRow}>
            <Animated.Text style={[styles.welcomeWord, welcomeStyle]}>welcome</Animated.Text>
            <Animated.Text style={[styles.welcomeWord, toStyle]}>to</Animated.Text>
            <Animated.View style={ynStyle}>
              <Text style={styles.welcomeWord}>
                <Text style={styles.bracket}>{'{'}</Text>
                <Text style={styles.bracket}>yn</Text>
                <Text style={styles.bracket}>{'}'}</Text>
              </Text>
            </Animated.View>
          </View>
        </View>

        <Animated.View style={[styles.bottomButtons, buttonStyle]}>
          <TouchableOpacity onPress={handleWelcomeContinue} style={styles.button}>
            <Text style={styles.continueText}>get started →</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/auth/login')} style={styles.signInButton}>
            <Text style={styles.signInText}>already have an account? sign in</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }


  if (step === 'birthday') {
    return (
      <View style={styles.container}>
        <Animated.View style={[styles.fullScreen, animatedStyle]}>
          <View style={styles.centered}>
            <Text style={styles.subtitle}>
              when&apos;s your <Text style={styles.italic}>birthday</Text>?
            </Text>
            <View style={styles.birthdayRow}>
              <TextInput
                ref={birthMonthRef}
                style={[styles.birthdayInput, styles.birthdayInputMd]}
                value={birthMonth}
                onChangeText={(t) => {
                  const cleaned = t.replace(/[^0-9]/g, '').slice(0, 2);
                  setBirthMonth(cleaned);
                  if (cleaned.length === 2) birthDayRef.current?.focus();
                }}
                placeholder="mm"
                placeholderTextColor="#555"
                keyboardType="number-pad"
                maxLength={2}
                autoFocus
              />
              <Text style={styles.birthdaySlash}>/</Text>
              <TextInput
                ref={birthDayRef}
                style={[styles.birthdayInput, styles.birthdayInputMd]}
                value={birthDay}
                onChangeText={(t) => {
                  const cleaned = t.replace(/[^0-9]/g, '').slice(0, 2);
                  setBirthDay(cleaned);
                  if (cleaned.length === 2) birthYearRef.current?.focus();
                }}
                placeholder="dd"
                placeholderTextColor="#555"
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text style={styles.birthdaySlash}>/</Text>
              <TextInput
                ref={birthYearRef}
                style={[styles.birthdayInput, styles.birthdayInputYr]}
                value={birthYear}
                onChangeText={(t) => setBirthYear(t.replace(/[^0-9]/g, '').slice(0, 4))}
                placeholder="yyyy"
                placeholderTextColor="#555"
                keyboardType="number-pad"
                maxLength={4}
              />
            </View>
            {birthdayBadDate ? (
              <Text style={styles.birthdayHint}>that doesn&apos;t look like a real date</Text>
            ) : birthdayUnderage ? (
              <Text style={styles.birthdayHint}>
                you must be 18 or older to use{' '}
                <Text style={styles.bracket}>{'{'}yn{'}'}</Text>
              </Text>
            ) : null}
            {birthdayCanContinue ? (
              <TouchableOpacity
                style={styles.continueButton}
                onPress={handleBirthdaySubmit}
              >
                <Text style={styles.continueText}>continue →</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </Animated.View>
      </View>
    );
  }

  if (step === 'intro-audio') {
    return (
      <View style={styles.container}>
        <Animated.View style={[styles.fullScreen, animatedStyle]}>
          <View style={styles.centered}>
            <Text style={styles.subtitle}>
              <Text style={styles.bracket}>{'{'}yn{'}'}</Text> creates personalized{'\n'}audio experiences
            </Text>
            <Text style={[styles.subtitle, { marginTop: 32 }]}>
              let&apos;s get to know <Text style={styles.italic}>you</Text>
            </Text>
          </View>
        </Animated.View>
      </View>
    );
  }

  if (step === 'initial-quiz') {
    const currentQuestion = initialQuestions[initialIndex];
    const isTopSelected = selectedInitialChoice === currentQuestion.top;
    const isBottomSelected = selectedInitialChoice === currentQuestion.bottom;

    return (
      <View style={styles.container}>
        <View style={styles.quizContainer}>
          <TouchableOpacity
            style={styles.quizTop}
            onPress={() => handleInitialChoice(currentQuestion.top)}
            disabled={selectedInitialChoice !== null}
          >
            <Animated.Text style={[
              styles.quizText,
              isTopSelected && styles.selectedText,
              animatedStyle,
            ]}>
              {currentQuestion.top}
            </Animated.Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quizBottom}
            onPress={() => handleInitialChoice(currentQuestion.bottom)}
            disabled={selectedInitialChoice !== null}
          >
            <Animated.Text style={[
              styles.quizText,
              isBottomSelected && styles.selectedText,
              animatedStyle,
            ]}>
              {currentQuestion.bottom}
            </Animated.Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === 'initial-recap') {
    const chosen = initialQuestions
      .map((q) => initialAnswers[`initial_${q.top}_${q.bottom}`])
      .filter((v): v is string => typeof v === 'string');

    return (
      <View style={styles.container}>
        <Animated.View style={[styles.fullScreen, animatedStyle]}>
          <View style={styles.centered}>
            <Text style={styles.recapLead}>so you&apos;re a</Text>
            {chosen.map((choice, i) => (
              <Text key={`${choice}_${i}`} style={styles.recapChoice}>
                <Text style={styles.italic}>{choice}</Text>
                {i < chosen.length - 1 ? ',' : ''}
              </Text>
            ))}
            <Text style={styles.recapTail}>kind of person...</Text>
          </View>
        </Animated.View>
      </View>
    );
  }

  if (step === 'intro-really') {
    return (
      <View style={styles.container}>
        <Animated.View style={[styles.fullScreen, animatedStyle]}>
          <View style={styles.centered}>
            <Text style={styles.subtitle}>
              ...but who are you <Text style={styles.italic}>really</Text>?
            </Text>
          </View>
        </Animated.View>
      </View>
    );
  }

  if (step === 'quiz') {
    const currentQuestion = questions[questionIndex];
    const isTopSelected = selectedChoice === currentQuestion.top;
    const isBottomSelected = selectedChoice === currentQuestion.bottom;

    return (
      <View style={styles.container}>
        <View style={styles.quizContainer}>
          <TouchableOpacity
            style={styles.quizTop}
            onPress={() => handleChoice(currentQuestion.top)}
            disabled={selectedChoice !== null}
          >
            <Animated.Text style={[
              styles.quizText,
              isTopSelected && styles.selectedText,
              animatedStyle,
            ]}>
              {currentQuestion.top}
            </Animated.Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quizBottom}
            onPress={() => handleChoice(currentQuestion.bottom)}
            disabled={selectedChoice !== null}
          >
            <Animated.Text style={[
              styles.quizText,
              isBottomSelected && styles.selectedText,
              animatedStyle,
            ]}>
              {currentQuestion.bottom}
            </Animated.Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === 'object') {
    return (
      <View style={styles.container}>
        <Animated.View style={[styles.fullScreen, animatedStyle]}>
          <View style={styles.centered}>
            <Text style={styles.subtitle}>pick an object</Text>
            <View style={styles.objectGrid}>
              {objects.map((object) => (
                <TouchableOpacity
                  key={object}
                  style={styles.objectButton}
                  onPress={() => handleObjectChoice(object)}
                  disabled={selectedObject !== null}
                >
                  <Text style={[
                    styles.objectText,
                    selectedObject === object && styles.selectedText
                  ]}>
                    {object}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Animated.View>
      </View>
    );
  }

  if (step === 'animal') {
    return (
      <View style={styles.container}>
        <Animated.View style={[styles.fullScreen, animatedStyle]}>
          <View style={styles.centered}>
            <Text style={styles.subtitle}>pick an animal</Text>
            <View style={styles.objectGrid}>
              {animals.map((animal) => (
                <TouchableOpacity
                  key={animal}
                  style={styles.objectButton}
                  onPress={() => handleAnimalChoice(animal)}
                  disabled={selectedAnimal !== null}
                >
                  <Text style={[
                    styles.objectText,
                    selectedAnimal === animal && styles.selectedText
                  ]}>
                    {animal}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Animated.View>
      </View>
    );
  }

  if (step === 'descriptors') {
    return (
      <View style={styles.container}>
        <Animated.View style={[styles.fullScreen, animatedStyle]}>
          <View style={styles.centered}>
            <Text style={styles.subtitle}>
              pick the three words{'\n'}that best describe you
            </Text>
            <View style={styles.descriptorGrid}>
              {descriptorWords.map((word) => (
                <TouchableOpacity
                  key={word}
                  style={styles.descriptorButton}
                  onPress={() => toggleDescriptor(word)}
                >
                  <Text style={[
                    styles.descriptorText,
                    selectedDescriptors.includes(word) && styles.selectedText
                  ]}>
                    {word}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedDescriptors.length === 3 && (
              <TouchableOpacity
                style={styles.continueButton}
                onPress={handleDescriptorsContinue}
              >
                <Text style={styles.continueText}>continue →</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </View>
    );
  }

  if (step === 'descriptors2') {
    return (
      <View style={styles.container}>
        <Animated.View style={[styles.fullScreen, animatedStyle]}>
          <View style={styles.centered}>
            <Text style={styles.subtitle}>
              pick the three words{'\n'}that best describe you
            </Text>
            <View style={styles.descriptorGrid}>
              {descriptorWords2.map((word) => (
                <TouchableOpacity
                  key={word}
                  style={styles.descriptorButton}
                  onPress={() => toggleDescriptor2(word)}
                >
                  <Text style={[
                    styles.descriptorText,
                    selectedDescriptors2.includes(word) && styles.selectedText
                  ]}>
                    {word}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedDescriptors2.length === 3 && (
              <TouchableOpacity
                style={styles.continueButton}
                onPress={handleDescriptors2Continue}
              >
                <Text style={styles.continueText}>continue →</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </View>
    );
  }

  if (step === 'name') {
    return (
      <View style={styles.container}>
        <Animated.View style={[styles.fullScreen, animatedStyle]}>
          <View style={styles.centered}>
            <Text style={styles.subtitle}>
              what is <Text style={styles.bracket}>your name</Text>
            </Text>
            <TextInput
              style={styles.nameInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder=""
              placeholderTextColor="#666"
              autoFocus
              autoCapitalize="words"
            />
            {nameInput.trim() && (
              <TouchableOpacity
                style={styles.continueButton}
                onPress={handleNameSubmit}
              >
                <Text style={styles.continueText}>continue →</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
        {/* Black+spinner overlay that appears the moment continue is tapped,
            bridging the gap until storyteller-recap mounts its own
            identical overlay. Keeps the transition visually continuous. */}
        {nameSubmitting ? (
          <View style={[StyleSheet.absoluteFill, styles.recapOverlay]} pointerEvents="none">
            <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
          </View>
        ) : null}
      </View>
    );
  }

  if (step === 'storyteller-recap') {
    const sceneReady =
      Platform.OS === 'web'
        ? !!(pipeline.svg && pipeline.dims)
        : !!(pipeline.imageUrl && pipeline.dims);
    const aspectRatio = pipeline.dims
      ? pipeline.dims.width / pipeline.dims.height
      : 2 / 3;
    const words = (pipeline.words || '')
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean);

    return (
      <View style={styles.container}>
        {/* Everything that's part of the step fade sits inside this
            Animated.View. The black overlay lives OUTSIDE it so the step
            fade-in can't momentarily pull its opacity below 1. */}
        <Animated.View style={[styles.fullScreen, animatedStyle]}>
          {/* 3D card: mounts as soon as we have the svg so it paints while
              the user is still looking at the storyteller description.
              Wrapped in an Animated.View pinned to opacity 0 until the user
              taps "reveal". */}
          {sceneReady ? (
            <Animated.View
              style={[StyleSheet.absoluteFill, cardWrapStyle]}
              pointerEvents={reveal && !overlayMounted ? 'auto' : 'none'}
            >
              <CardScene
                svgString={pipeline.svg ?? ''}
                aspectRatio={aspectRatio}
                onReady={() => setCardPainted(true)}
              />
            </Animated.View>
          ) : null}

          {/* Archetype title + continue button: fade in once reveal pressed. */}
          {reveal && pipeline.archetype ? (
            <Animated.View style={[styles.recapTitleWrap, cardTitleStyle]} pointerEvents="none">
              <Text style={styles.recapTitleText}>{pipeline.archetype}</Text>
            </Animated.View>
          ) : null}
          {reveal ? (
            <Animated.View style={[styles.recapContinueWrap, cardContinueStyle]}>
              <TouchableOpacity onPress={() => advanceStepWithFade('first-story')}>
                <Text style={styles.continueText}>continue →</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : null}
        </Animated.View>

        {/* Opaque overlay: always fully black, independent of any step fade.
            Shows spinner until pipeline ready, then the staggered storyteller
            sentence. Only ever fades OUT — when the user taps "reveal". */}
        {overlayMounted ? (
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.recapOverlay, recapOverlayStyle]}
            pointerEvents={reveal ? 'none' : 'auto'}
          >
            <View style={styles.centered}>
                {pipeline.error ? (
                  <View style={{ alignItems: 'center', gap: 12 }}>
                    <Text style={styles.subtitle}>something broke</Text>
                    <Text style={styles.errorDetailInline}>{pipeline.error}</Text>
                  </View>
                ) : !fullyReady ? (
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
                ) : (
                  <>
                    <Animated.Text style={[styles.recapLine, { marginBottom: 20 }, recapLeadStyle]}>
                      {nameInput.trim()}, you are a
                    </Animated.Text>
                    {words[0] ? (
                      <Animated.Text style={[styles.recapWord, recapWord1Style]}>
                        {words[0]}
                      </Animated.Text>
                    ) : null}
                    {words[1] ? (
                      <Animated.Text style={[styles.recapWord, recapWord2Style]}>
                        {words[1]}
                      </Animated.Text>
                    ) : null}
                    {words[2] ? (
                      <Animated.Text style={[styles.recapWord, { marginBottom: 20 }, recapWord3Style]}>
                        {words[2]}
                      </Animated.Text>
                    ) : null}
                    <Animated.Text style={[styles.recapLine, recapTailStyle]}>
                      storyteller
                    </Animated.Text>
                    <Animated.View style={[styles.revealButtonWrap, recapButtonStyle]}>
                      <TouchableOpacity onPress={handleReveal}>
                        <Text style={styles.revealText}>reveal my archetype →</Text>
                      </TouchableOpacity>
                    </Animated.View>
                  </>
                )}
              </View>
            </Animated.View>
          ) : null}
      </View>
    );
  }

  if (step === 'first-story') {
    const canGenerate = !!firstStoryGender && !!firstStoryScenario;
    return (
      <View style={styles.container}>
        <Animated.View style={[styles.fullScreen, animatedStyle]}>
          <View style={styles.centered}>
            {firstStoryStage === 'pick' ? (
              <>
                <Text style={styles.subtitle}>
                  let&apos;s create your <Text style={styles.italic}>first story</Text>
                </Text>
                <Text style={styles.firstStoryLabel}>narrator</Text>
                <View style={styles.firstStoryRow}>
                  <TouchableOpacity
                    style={styles.firstStoryChoice}
                    onPress={() => setFirstStoryGender('male')}
                  >
                    <Text
                      style={[
                        styles.firstStoryChoiceText,
                        firstStoryGender === 'male' && styles.selectedText,
                      ]}
                    >
                      he
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.firstStoryChoice}
                    onPress={() => setFirstStoryGender('female')}
                  >
                    <Text
                      style={[
                        styles.firstStoryChoiceText,
                        firstStoryGender === 'female' && styles.selectedText,
                      ]}
                    >
                      she
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.firstStoryChoice}
                    onPress={() => setFirstStoryGender('neutral')}
                  >
                    <Text
                      style={[
                        styles.firstStoryChoiceText,
                        firstStoryGender === 'neutral' && styles.selectedText,
                      ]}
                    >
                      they
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.firstStoryLabel, { marginTop: 28 }]}>scene</Text>
                <View style={styles.firstStoryColumn}>
                  <TouchableOpacity
                    style={styles.firstStoryChoice}
                    onPress={() => setFirstStoryScenario('walk')}
                  >
                    <Text
                      style={[
                        styles.firstStoryChoiceText,
                        firstStoryScenario === 'walk' && styles.selectedText,
                      ]}
                    >
                      a walk in the park
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.firstStoryChoice}
                    onPress={() => setFirstStoryScenario('meditation')}
                  >
                    <Text
                      style={[
                        styles.firstStoryChoiceText,
                        firstStoryScenario === 'meditation' && styles.selectedText,
                      ]}
                    >
                      a meditation
                    </Text>
                  </TouchableOpacity>
                </View>
                {canGenerate ? (
                  <TouchableOpacity
                    style={styles.continueButton}
                    onPress={startFirstStoryGeneration}
                  >
                    <Text style={styles.continueText}>generate →</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : firstStoryStage === 'generating' ? (
              <>
                <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
                <Text style={[styles.firstStoryHint, { marginTop: 24 }]}>
                  weaving your story...
                </Text>
              </>
            ) : firstStoryStage === 'error' ? (
              <>
                <Text style={styles.subtitle}>something broke</Text>
                {firstStoryError ? (
                  <Text style={styles.errorDetailInline}>{firstStoryError}</Text>
                ) : null}
                <TouchableOpacity
                  style={[styles.continueButton, { bottom: 120 }]}
                  onPress={() => {
                    setFirstStoryError(null);
                    setFirstStoryStage('pick');
                  }}
                >
                  <Text style={styles.continueText}>try again →</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.continueButton}
                  onPress={() => advanceStepWithFade('signup')}
                >
                  <Text style={styles.continueText}>skip for now →</Text>
                </TouchableOpacity>
              </>
            ) : firstStoryStage === 'ready' ? (
              <>
                <Text style={styles.subtitle}>
                  <Text style={styles.italic}>
                    {firstStoryScenario === 'walk' ? 'a walk in the park' : 'a meditation'}
                  </Text>
                </Text>
                <View style={styles.firstStoryPlayerRow}>
                  <TouchableOpacity
                    style={styles.firstStoryPlayButton}
                    onPress={handleFirstStoryPlayPause}
                  >
                    <Text style={styles.firstStoryPlayText}>
                      {firstStoryPlaying ? '❚❚' : '▶'}
                    </Text>
                  </TouchableOpacity>
                  {ambientUrl ? (
                    <TouchableOpacity
                      style={styles.firstStoryAmbientButton}
                      onPress={handleAmbientToggle}
                    >
                      <Text style={styles.firstStoryAmbientText}>
                        ambient {firstStoryAmbientOn ? 'on' : 'off'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={styles.firstStoryProgressTrack}>
                  <View
                    style={[
                      styles.firstStoryProgressFill,
                      { width: `${Math.round(firstStoryProgress * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={[styles.firstStoryHint, { marginTop: 32 }]}>
                  sign up to save your card{'\n'}and your first story
                </Text>
                <TouchableOpacity
                  style={styles.continueButton}
                  onPress={handleFirstStoryContinue}
                >
                  <Text style={styles.continueText}>sign up →</Text>
                </TouchableOpacity>
                {Platform.OS === 'web' ? (
                  <>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {React.createElement('audio' as any, {
                      ref: narrationAudioRef,
                      onEnded: handleNarrationEnded,
                      onTimeUpdate: handleNarrationTimeUpdate,
                      onPause: () => {
                        // Browser-driven pauses (e.g. media-key) should sync state.
                        if (narrationAudioRef.current && !narrationAudioRef.current.ended) {
                          // No-op: an explicit user pause already calls setFirstStoryPlaying(false).
                        }
                      },
                      preload: 'auto',
                    })}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {React.createElement('audio' as any, {
                      ref: ambientAudioRef,
                      preload: 'auto',
                    })}
                  </>
                ) : null}
              </>
            ) : null}
          </View>
        </Animated.View>
      </View>
    );
  }

  if (step === 'signup') {
    const canSubmit = email.trim() && password.trim() && confirmPassword.trim();
    return (
      <View style={styles.container}>
        <Animated.View style={[styles.fullScreen, animatedStyle]}>
          <View style={[styles.centered, { width: '100%', maxWidth: 380, alignSelf: 'center' }]}>
            <View style={{ width: '100%' }}>
              <Text style={[styles.subtitle, { textAlign: 'center' }]}>
                <Text style={styles.italic}>create your account</Text>
              </Text>
              <Text style={[styles.signupSub, { textAlign: 'center', marginBottom: 24 }]}>
                <Text style={styles.bracket}>this is a beta!</Text>
                {'\n'}sign up now for 5 free stories a day for a month
                {'\n'}+ access to the public story library
              </Text>

              <View style={{ gap: 12 }}>
                <View style={{ gap: 6 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      letterSpacing: 1.5,
                      color: '#666',
                      fontFamily: 'EBGaramond-Regular',
                      textTransform: 'uppercase',
                    }}
                  >
                    email
                  </Text>
                  <TextInput
                    style={{
                      height: 44,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: '#2a2a2a',
                      backgroundColor: '#111',
                      paddingHorizontal: 12,
                      color: '#fff',
                      fontSize: 15,
                      fontFamily: 'EBGaramond-Regular',
                    }}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@domain.com"
                    placeholderTextColor="#555"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoFocus
                    editable={!isLoading}
                  />
                </View>
                <View style={{ gap: 6 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      letterSpacing: 1.5,
                      color: '#666',
                      fontFamily: 'EBGaramond-Regular',
                      textTransform: 'uppercase',
                    }}
                  >
                    password
                  </Text>
                  <TextInput
                    style={{
                      height: 44,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: '#2a2a2a',
                      backgroundColor: '#111',
                      paddingHorizontal: 12,
                      color: '#fff',
                      fontSize: 15,
                      fontFamily: 'EBGaramond-Regular',
                    }}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="at least 6 characters"
                    placeholderTextColor="#555"
                    secureTextEntry
                    editable={!isLoading}
                  />
                </View>
                <View style={{ gap: 6 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      letterSpacing: 1.5,
                      color: '#666',
                      fontFamily: 'EBGaramond-Regular',
                      textTransform: 'uppercase',
                    }}
                  >
                    confirm password
                  </Text>
                  <TextInput
                    style={{
                      height: 44,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: '#2a2a2a',
                      backgroundColor: '#111',
                      paddingHorizontal: 12,
                      color: '#fff',
                      fontSize: 15,
                      fontFamily: 'EBGaramond-Regular',
                    }}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="type it again"
                    placeholderTextColor="#555"
                    secureTextEntry
                    editable={!isLoading}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={{
                  marginTop: 20,
                  height: 52,
                  borderRadius: 999,
                  backgroundColor: '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: !canSubmit || isLoading ? 0.4 : 1,
                }}
                onPress={handleSignUpSubmit}
                disabled={!canSubmit || isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text
                    style={{
                      color: '#000',
                      fontSize: 16,
                      fontFamily: 'EBGaramond-Medium',
                    }}
                  >
                    create account
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={{ marginTop: 14, alignItems: 'center' }}
                onPress={() => router.push('/auth/login')}
                disabled={isLoading}
              >
                <Text style={{ color: '#888', fontSize: 14, fontFamily: 'EBGaramond-Regular' }}>
                  already have an account?{' '}
                  <Text style={{ color: '#fff', fontFamily: 'EBGaramond-Medium' }}>sign in</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        {/* Existing Account Modal */}
        <Modal
          visible={showExistingAccountModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowExistingAccountModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>account exists</Text>
              <Text style={styles.modalMessage}>
                looks like you already have a{' '}
                <Text style={styles.modalYn}>{'{'}yn{'}'}</Text>
                {' '}account
              </Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setShowExistingAccountModal(false)}
                >
                  <Text style={styles.modalCancelText}>cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalSignInButton}
                  onPress={() => {
                    setShowExistingAccountModal(false);
                    router.push('/auth/login');
                  }}
                >
                  <Text style={styles.modalSignInText}>sign in</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreen: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 32,
    color: '#fff',
    marginBottom: 60,
    fontFamily: 'EBGaramond-Medium',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  welcomeWord: {
    fontSize: 36,
    color: '#fff',
    fontFamily: 'EBGaramond-Medium',
  },
  bracket: {
    color: '#7f1d1d',
  },
  bottomButtons: {
    position: 'absolute',
    bottom: 60,
    alignItems: 'center',
    gap: 16,
  },
  bottomButtonsFixed: {
    position: 'absolute',
    bottom: 60,
    alignItems: 'center',
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  signInButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  signInText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    textDecorationLine: 'underline',
    fontFamily: 'EBGaramond-Regular',
  },
  subtitle: {
    fontSize: 24,
    color: '#fff',
    marginBottom: 40,
    textAlign: 'center',
    fontFamily: 'EBGaramond-Regular',
  },
  continueButton: {
    position: 'absolute',
    bottom: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  signupButton: {
    marginTop: 24,
  },
  continueText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  quizContainer: {
    flex: 1,
    width: '100%',
  },
  quizTop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quizBottom: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quizText: {
    fontSize: 24,
    color: '#fff',
    fontFamily: 'EBGaramond-Regular',
  },
  signupSub: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'EBGaramond-Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: -24,
    marginBottom: 32,
    paddingHorizontal: 24,
  },
  selectedText: {
    textDecorationLine: 'underline',
  },
  recapLead: {
    fontSize: 22,
    color: '#fff',
    fontFamily: 'EBGaramond-Regular',
    marginBottom: 12,
    textAlign: 'center',
  },
  recapChoice: {
    fontSize: 20,
    color: '#fff',
    fontFamily: 'EBGaramond-Regular',
    textAlign: 'center',
    lineHeight: 28,
  },
  recapTail: {
    fontSize: 22,
    color: '#fff',
    fontFamily: 'EBGaramond-Regular',
    marginTop: 12,
    textAlign: 'center',
  },
  objectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 24,
    maxWidth: 300,
  },
  objectButton: {
    padding: 12,
  },
  objectText: {
    fontSize: 18,
    color: '#fff',
    fontFamily: 'EBGaramond-Regular',
  },
  descriptorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    width: 320,
  },
  descriptorButton: {
    width: 95,
    padding: 8,
    alignItems: 'center',
  },
  descriptorText: {
    fontSize: 16,
    color: '#fff',
    fontFamily: 'EBGaramond-Regular',
  },
  nameInput: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.3)',
    color: '#fff',
    fontSize: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    textAlign: 'center',
    width: 250,
    fontFamily: 'EBGaramond-Regular',
  },
  birthdayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  birthdayInput: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.3)',
    color: '#fff',
    fontSize: 22,
    paddingVertical: 8,
    paddingHorizontal: 8,
    textAlign: 'center',
    fontFamily: 'EBGaramond-Regular',
  },
  birthdayInputMd: {
    width: 56,
  },
  birthdayInputYr: {
    width: 88,
  },
  birthdaySlash: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 22,
    fontFamily: 'EBGaramond-Regular',
  },
  birthdayHint: {
    marginTop: 24,
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.7)',
    fontFamily: 'EBGaramond-Regular',
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 22,
  },
  firstStoryLabel: {
    fontSize: 12,
    letterSpacing: 1.5,
    color: 'rgba(255, 255, 255, 0.5)',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  firstStoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  firstStoryColumn: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  firstStoryChoice: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  firstStoryChoiceText: {
    fontSize: 20,
    color: '#fff',
    fontFamily: 'EBGaramond-Regular',
    textAlign: 'center',
  },
  firstStoryHint: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.7)',
    fontFamily: 'EBGaramond-Regular',
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 22,
  },
  firstStoryPlayerRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  firstStoryPlayButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  firstStoryPlayText: {
    fontSize: 22,
    color: '#fff',
    fontFamily: 'EBGaramond-Regular',
    lineHeight: 24,
  },
  firstStoryAmbientButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  firstStoryAmbientText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    fontFamily: 'EBGaramond-Regular',
    letterSpacing: 0.5,
  },
  firstStoryProgressTrack: {
    marginTop: 16,
    width: 220,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  firstStoryProgressFill: {
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 1,
  },
  italic: {
    fontStyle: 'italic',
  },
  signInLink: {
    marginTop: 20,
    paddingVertical: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    width: 300,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    color: '#fff',
    fontFamily: 'EBGaramond-Medium',
    marginBottom: 12,
  },
  modalMessage: {
    fontSize: 16,
    color: '#fff',
    fontFamily: 'EBGaramond-Regular',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  modalYn: {
    color: '#7f1d1d',
    fontFamily: 'EBGaramond-Medium',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    color: '#fff',
    fontFamily: 'EBGaramond-Regular',
  },
  modalSignInButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#2b2b34',
    alignItems: 'center',
  },
  modalSignInText: {
    fontSize: 16,
    color: '#fff',
    fontFamily: 'EBGaramond-Medium',
  },
  recapStoryteller: {
    fontSize: 22,
    color: '#fff',
    fontFamily: 'EBGaramond-Regular',
    textAlign: 'center',
    lineHeight: 30,
  },
  recapStoryWords: {
    fontSize: 26,
    color: '#fff',
    fontFamily: 'EBGaramond-Italic',
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 8,
    paddingHorizontal: 16,
  },
  recapLine: {
    fontSize: 22,
    color: '#fff',
    fontFamily: 'EBGaramond-Regular',
    textAlign: 'center',
    lineHeight: 30,
  },
  recapWord: {
    fontSize: 28,
    color: '#fff',
    fontFamily: 'EBGaramond-Italic',
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 4,
    paddingHorizontal: 16,
  },
  recapOverlay: {
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recapTitleWrap: {
    position: 'absolute',
    bottom: 96,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  recapTitleText: {
    color: '#fff',
    fontFamily: 'EBGaramond-Italic',
    fontStyle: 'italic',
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 1.5,
    textTransform: 'lowercase',
  },
  recapContinueWrap: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  revealButton: {
    marginTop: 56,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  revealButtonWrap: {
    marginTop: 48,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  revealText: {
    fontSize: 16,
    color: '#fff',
    fontFamily: 'EBGaramond-Medium',
  },
  findingVoice: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'EBGaramond-Regular',
  },
  errorDetailInline: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'EBGaramond-Regular',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
