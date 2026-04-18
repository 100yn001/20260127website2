import { auth, db } from '@/config/firebase';
import { personalityInitial, personalityReally } from '@/constants/personality-sets';
import { useAuth } from '@/contexts/AuthContext';
import {
    describeLandscapeFromStyle,
    describeStorytellerArchetype,
    describeStorytellingStyle,
} from '@/services/claude-service';
import { generateTarotCard } from '@/services/replicate-service';
import { saveSilverCard, saveUserProfile } from '@/services/user-service';
import CardScene from '@/components/silver-card/CardScene';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, where } from 'firebase/firestore';
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
  | 'secretcode'
  | 'signup';

type Pipeline = {
  words?: string;
  archetype?: string;
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [secretCode, setSecretCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(false);
  const [showExistingAccountModal, setShowExistingAccountModal] = useState(false);
  const [pipeline, setPipeline] = useState<Pipeline>({});
  const pipelineStarted = useRef(false);
  const [cardPainted, setCardPainted] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [overlayMounted, setOverlayMounted] = useState(true);
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
        const words = await describeStorytellingStyle(answers);
        setPipeline((p) => ({ ...p, words }));

        const [archetype, landscape] = await Promise.all([
          describeStorytellerArchetype(words),
          describeLandscapeFromStyle(words),
        ]);
        setPipeline((p) => ({ ...p, archetype, landscape }));

        const { dataUrl, remoteUrl } = await generateTarotCard(landscape);
        setPipeline((p) => ({ ...p, imageUrl: dataUrl, remoteUrl }));

        if (Platform.OS === 'web') {
          const { vectorizeImage } = await import('@/services/vectorize');
          const { svg, width, height } = await vectorizeImage(dataUrl);
          setPipeline((p) => ({ ...p, svg, dims: { width, height } }));
        } else {
          const dims = await new Promise<{ width: number; height: number }>((resolve) => {
            Image.getSize(
              dataUrl,
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

    opacity.value = withTiming(0, { duration: 500 });
    setTimeout(() => {
      setStep('storyteller-recap');
      opacity.value = withTiming(1, { duration: 700 });
    }, 550);
  };

  const handleSecretCodeSubmit = async () => {
    if (!secretCode.trim()) {
      Alert.alert('Error', 'Please enter a secret code');
      return;
    }

    setIsLoading(true);
    try {
      const betaPasswordsRef = collection(db, 'betapasswords');
      const q = query(betaPasswordsRef, where('password', '==', secretCode.toLowerCase().trim()));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        Alert.alert('Error', 'Invalid secret code');
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      opacity.value = withTiming(0, { duration: 500 });
      setTimeout(() => {
        setStep('signup');
        opacity.value = withTiming(1, { duration: 700 });
      }, 550);
    } catch (error) {
      console.error('Error validating secret code:', error);
      Alert.alert('Error', 'Could not verify secret code. Please try again.');
      setIsLoading(false);
    }
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

      // Save user profile with onboarding answers to Firestore
      await saveUserProfile(currentUser.uid, email, nameInput, {
        personalityInitial: initialAnswers,
        personalityReally: reallyAnswers,
        object: selectedObject || undefined,
        animal: selectedAnimal || undefined,
        descriptors: selectedDescriptors,
        descriptors2: selectedDescriptors2,
      } as any);

      // Persist the silver card alongside the user profile
      if (pipeline.words && pipeline.landscape) {
        await saveSilverCard(currentUser.uid, {
          storytellingWords: pipeline.words,
          landscapePrompt: pipeline.landscape,
          imageUrl: pipeline.remoteUrl,
          archetypeTitle: pipeline.archetype,
        }).catch((err) => console.warn('saveSilverCard failed:', err));
      }

      // Also save to AsyncStorage for offline access
      await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
      await AsyncStorage.setItem('userName', nameInput);
      await AsyncStorage.setItem('onboardingAnswers', JSON.stringify(answers));

      setIsLoading(false);
      router.replace('/(tabs)/library');
      
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
  const cardTitleStyle = useAnimatedStyle(() => ({ opacity: cardTitleOpacity.value }));
  const cardContinueStyle = useAnimatedStyle(() => ({ opacity: cardContinueOpacity.value }));

  const handleWelcomeContinue = () => {
    // Fade out welcome screen elements
    buttonOpacity.value = withTiming(0, { duration: 800 });
    welcomeOpacity.value = withTiming(0, { duration: 900 });
    toOpacity.value = withTiming(0, { duration: 900 });
    ynOpacity.value = withTiming(0, { duration: 900 });
    setTimeout(() => {
      setStep('intro-audio');
      opacity.value = withTiming(1, { duration: 900 });
    }, 1000);
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
        <Animated.View style={[styles.fullScreen, animatedStyle]}>
          {/* 3D card: mounts as soon as we have the svg so it paints while
              the user is still looking at the storyteller description. */}
          {sceneReady ? (
            <View
              style={StyleSheet.absoluteFill}
              pointerEvents={reveal && !overlayMounted ? 'auto' : 'none'}
            >
              <CardScene
                svgString={pipeline.svg ?? ''}
                aspectRatio={aspectRatio}
                onReady={() => setCardPainted(true)}
              />
            </View>
          ) : null}

          {/* Archetype title + continue button: fade in once reveal pressed. */}
          {reveal && pipeline.archetype ? (
            <Animated.View style={[styles.recapTitleWrap, cardTitleStyle]} pointerEvents="none">
              <Text style={styles.recapTitleText}>{pipeline.archetype}</Text>
            </Animated.View>
          ) : null}
          {reveal ? (
            <Animated.View style={[styles.recapContinueWrap, cardContinueStyle]}>
              <TouchableOpacity onPress={() => advanceStepWithFade('secretcode')}>
                <Text style={styles.continueText}>continue →</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : null}

          {/* Opaque overlay on top: spinner until pipeline ready, then the
              staggered storyteller sentence. Fades out on reveal. */}
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
                    <Animated.Text style={[styles.recapLine, recapLeadStyle]}>
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
                      <Animated.Text style={[styles.recapWord, recapWord3Style]}>
                        {words[2]}
                      </Animated.Text>
                    ) : null}
                    <Animated.Text style={[styles.recapLine, recapTailStyle]}>
                      kind of storyteller
                    </Animated.Text>
                    <Animated.View style={[styles.revealButtonWrap, recapButtonStyle]}>
                      <TouchableOpacity onPress={handleReveal}>
                        <Text style={styles.revealText}>reveal →</Text>
                      </TouchableOpacity>
                    </Animated.View>
                  </>
                )}
              </View>
            </Animated.View>
          ) : null}
        </Animated.View>
      </View>
    );
  }

  if (step === 'secretcode') {
    return (
      <View style={styles.container}>
        <Animated.View style={[styles.fullScreen, animatedStyle]}>
          <View style={styles.centered}>
            <Text style={styles.subtitle}>
              enter the <Text style={styles.bracket}>secret code</Text>
            </Text>
            <TextInput
              style={styles.nameInput}
              value={secretCode}
              onChangeText={setSecretCode}
              placeholder=""
              placeholderTextColor="#666"
              autoFocus
              autoCapitalize="none"
            />
            {secretCode.trim() && (
              <TouchableOpacity
                style={[styles.continueButton, isLoading && { opacity: 0.5 }]}
                onPress={handleSecretCodeSubmit}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.continueText}>continue →</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </View>
    );
  }

  if (step === 'signup') {
    return (
      <View style={styles.container}>
        <Animated.View style={[styles.fullScreen, animatedStyle]}>
          <View style={styles.centered}>
            <Text style={styles.subtitle}>
              <Text style={styles.italic}>create your account</Text>
            </Text>
            <TextInput
              style={styles.nameInput}
              value={email}
              onChangeText={setEmail}
              placeholder="email"
              placeholderTextColor="#666"
              autoCapitalize="none"
              keyboardType="email-address"
              autoFocus
              editable={!isLoading}
            />
            <TextInput
              style={styles.nameInput}
              value={password}
              onChangeText={setPassword}
              placeholder="password"
              placeholderTextColor="#666"
              secureTextEntry
              editable={!isLoading}
            />
            <TextInput
              style={styles.nameInput}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="confirm password"
              placeholderTextColor="#666"
              secureTextEntry
              editable={!isLoading}
            />
            {email.trim() && password.trim() && confirmPassword.trim() && (
              <TouchableOpacity
                style={[styles.signupButton, isLoading && { opacity: 0.5 }]}
                onPress={handleSignUpSubmit}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.continueText}>create account →</Text>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.signInLink}
              onPress={() => router.push('/auth/login')}
              disabled={isLoading}
            >
              <Text style={styles.signInText}>already have an account? sign in</Text>
            </TouchableOpacity>
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
    fontSize: 18,
    color: '#fff',
    fontFamily: 'EBGaramond-Regular',
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
