import { StorySubmittedModal } from '@/components/StorySubmittedModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useStoryQueue } from '@/contexts/StoryQueueContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, {
    FadeIn,
    FadeInDown,
    FadeInUp,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

interface Message {
  id: string;
  type: 'bot' | 'user';
  content: string;
}

// Animated typing indicator with three pulsing dots
const TypingIndicator = ({ color }: { color: string }) => {
  const dot1 = useSharedValue(0.3);
  const dot2 = useSharedValue(0.3);
  const dot3 = useSharedValue(0.3);

  useEffect(() => {
    dot1.value = withRepeat(
      withSequence(withTiming(1, { duration: 400 }), withTiming(0.3, { duration: 400 })),
      -1, false
    );
    dot2.value = withDelay(150,
      withRepeat(
        withSequence(withTiming(1, { duration: 400 }), withTiming(0.3, { duration: 400 })),
        -1, false
      )
    );
    dot3.value = withDelay(300,
      withRepeat(
        withSequence(withTiming(1, { duration: 400 }), withTiming(0.3, { duration: 400 })),
        -1, false
      )
    );
  }, []);

  const style1 = useAnimatedStyle(() => ({ opacity: dot1.value }));
  const style2 = useAnimatedStyle(() => ({ opacity: dot2.value }));
  const style3 = useAnimatedStyle(() => ({ opacity: dot3.value }));

  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.typingContainer}>
      <Animated.View style={[styles.typingDot, { backgroundColor: color }, style1]} />
      <Animated.View style={[styles.typingDot, { backgroundColor: color }, style2]} />
      <Animated.View style={[styles.typingDot, { backgroundColor: color }, style3]} />
    </Animated.View>
  );
};

// Animated message bubble
const MessageBubble = ({
  message,
  botBg,
  userBg,
  botTextColor,
  userTextColor,
  index,
}: {
  message: Message;
  botBg: string;
  userBg: string;
  botTextColor: string;
  userTextColor: string;
  index: number;
}) => {
  const isUser = message.type === 'user';

  return (
    <Animated.View
      entering={
        isUser
          ? FadeInDown.duration(300).springify().damping(28).stiffness(120)
          : FadeInUp.duration(350).springify().damping(28).stiffness(120).delay(80)
      }
      style={[
        styles.messageBubble,
        isUser
          ? [styles.userBubble, { backgroundColor: userBg }]
          : [styles.botBubble, { backgroundColor: botBg }],
      ]}
    >
      <Text
        style={[
          styles.messageText,
          { color: isUser ? userTextColor : botTextColor },
        ]}
      >
        {message.content || ''}
      </Text>
    </Animated.View>
  );
};

// Progress dots showing question position
const ProgressDots = ({
  total,
  current,
  activeColor,
  inactiveColor,
}: {
  total: number;
  current: number;
  activeColor: string;
  inactiveColor: string;
}) => {
  if (total <= 0) return null;
  return (
    <View style={styles.progressDots}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.progressDot,
            {
              backgroundColor: i <= current ? activeColor : inactiveColor,
              width: i === current ? 18 : 6,
            },
          ]}
        />
      ))}
    </View>
  );
};

export default function FollowUpScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [showIntro, setShowIntro] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTypingIndicator, setShowTypingIndicator] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const { addToQueue } = useStoryQueue();

  // Helper to safely get string param (avoid "undefined" string)
  const getStringParam = (key: string, fallback: string = ''): string => {
    const value = params[key];
    if (value === undefined || value === null || value === 'undefined') return fallback;
    return String(value);
  };

  // Parse recipe data from params
  const recipeData: any = {
    character: getStringParam('character'),
    genderSelf: getStringParam('genderSelf'),
    genderOther: getStringParam('genderOther'),
    trope: getStringParam('trope'),
    location: getStringParam('location'),
    setting: getStringParam('setting'),
    features: params.features ? JSON.parse(params.features as string) : [],
    featurePreferences: params.featurePreferences ? JSON.parse(params.featurePreferences as string) : {},
    isNighttime: params.isNighttime === 'true',
    userName: getStringParam('userName'),
    duration: getStringParam('duration', '10min'),
    narrativeRatio: params.narrativeRatio ? parseInt(params.narrativeRatio as string) : 5,
    voiceId: getStringParam('voiceId'),
    prompt: getStringParam('prompt'),
    tags: params.tags ? JSON.parse(params.tags as string) : [],
    ambientMode: (getStringParam('ambientMode', 'auto') as 'auto' | 'off' | 'custom'),
    ambientCustomPrompt: getStringParam('ambientCustomPrompt'),
  };
  
  // Only add narrator fields if they exist (avoid undefined)
  if (params.narratorData) {
    recipeData.narratorData = JSON.parse(params.narratorData as string);
  }
  if (params.narratorId && params.narratorId !== '') {
    recipeData.narratorId = params.narratorId as string;
  }

  // Debug: Log when component mounts
  useEffect(() => {
    console.log('=== FollowUpScreen mounted ===');
  }, []);

  const safeValue = (value?: string, fallback: string = '') =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  // Show typing indicator, then add a bot message after a delay
  const addBotMessageWithTyping = useCallback((content: string, delay = 800) => {
    setShowTypingIndicator(true);
    scrollToBottom();
    setTimeout(() => {
      setShowTypingIndicator(false);
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), type: 'bot', content },
      ]);
      scrollToBottom();
    }, delay);
  }, [scrollToBottom]);

  const generateFollowUpQuestions = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('Starting to generate follow-up questions...');
      console.log('Recipe data:', recipeData);
      
      // Import the service
      const { generateFollowUpQuestions: generateQuestions } = require('@/services/audio-generation');
      
      // Call directly - no backend needed!
      const questions = await generateQuestions(recipeData);

      console.log('Generated questions:', questions);

      if (!questions || questions.length === 0) {
        throw new Error('No questions generated');
      }

      // Questions are already clean from the API - use directly
      const validQuestions = questions.filter((q: string) => q && q.length > 5);
      
      if (validQuestions.length === 0) {
        throw new Error('No valid questions generated');
      }
      
      console.log('Valid questions to display:', validQuestions);
      
      setFollowUpQuestions(validQuestions);
      setIsLoading(false);
      
      // Add first question with typing animation
      addBotMessageWithTyping(validQuestions[0], 600);
    } catch (error) {
      console.error('Error generating follow-up questions:', error);
      
      // Use fallback questions
      const characterLabel = safeValue(recipeData.character, 'this narrator');
      const locationLabel = safeValue(recipeData.location, 'this setting');
      const toneLabel = safeValue(recipeData.trope, 'this story');

      const fallbackQuestions = [
        `Tell me more about ${characterLabel}. What makes them unique?`,
        `What's the specific atmosphere or mood you're imagining for ${locationLabel}?`,
        `How would you like the character to speak to you during ${toneLabel || 'this story'}?`,
        `Is there anything else you'd like to add to help create your perfect experience?`,
      ];
      
      console.log('Using fallback questions:', fallbackQuestions);
      
      setFollowUpQuestions(fallbackQuestions);
      setIsLoading(false);
      
      addBotMessageWithTyping(fallbackQuestions[0], 600);
      setError('Using default questions (API unavailable)');
    }
  };

  const handleSendMessage = () => {
    if (!currentInput.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: currentInput.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    scrollToBottom();
    
    // Store answer
    const newAnswers = [...answers, currentInput.trim()];
    setAnswers(newAnswers);

    setCurrentInput('');

    // Check if we have more questions
    if (currentQuestionIndex < followUpQuestions.length - 1) {
      const nextQuestion = followUpQuestions[currentQuestionIndex + 1];
      if (nextQuestion) {
        addBotMessageWithTyping(nextQuestion, 900);
        setCurrentQuestionIndex(currentQuestionIndex + 1);
      }
    } else {
      addBotMessageWithTyping(
        "perfect — i have everything i need. ready to generate your story?",
        900
      );
    }
  };

  const handleStartQuestions = async () => {
    setShowIntro(false);
    await generateFollowUpQuestions();
  };

  const handleSkipAllQuestions = async () => {
    // Prevent duplicate submissions
    if (isSubmitting) {
      console.log('⚠️ Submission already in progress, ignoring duplicate tap');
      return;
    }

    setIsSubmitting(true);
    try {
      // Skip directly to generation - don't change showIntro to avoid flash
      await addToQueue(recipeData, [], []);
      setShowModal(true);
    } catch (error: any) {
      console.error('Error adding to queue:', error);
      surfaceQueueError(error);
      setIsSubmitting(false); // Reset on error so user can retry
    }
  };

  const handleSkipCurrentQuestion = () => {
    // Store empty answer for current question
    const newAnswers = [...answers, ''];
    setAnswers(newAnswers);

    // Check if we have more questions
    if (currentQuestionIndex < followUpQuestions.length - 1) {
      const nextQuestion = followUpQuestions[currentQuestionIndex + 1];
      if (nextQuestion && typeof nextQuestion === 'string' && nextQuestion.trim().length > 0) {
        addBotMessageWithTyping(nextQuestion, 700);
        setCurrentQuestionIndex(currentQuestionIndex + 1);
      }
    } else {
      addBotMessageWithTyping(
        "perfect — i have everything i need. ready to generate your story?",
        700
      );
    }
  };

  const surfaceQueueError = (error: any) => {
    const msg = error?.message || 'something went wrong queueing your story — please try again';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // eslint-disable-next-line no-alert
      window.alert(`could not queue story:\n\n${msg}`);
    } else {
      Alert.alert('could not queue story', msg);
    }
  };

  const handleGenerateStory = async () => {
    // Prevent duplicate submissions
    if (isSubmitting) {
      console.log('⚠️ Submission already in progress, ignoring duplicate tap');
      return;
    }

    setIsSubmitting(true);
    try {
      // Add to queue instead of navigating to loading
      await addToQueue(recipeData, followUpQuestions, answers);

      // Show modal
      setShowModal(true);
    } catch (error: any) {
      console.error('Error adding to queue:', error);
      surfaceQueueError(error);
      setIsSubmitting(false); // Reset on error so user can retry
    }
    // Note: Don't reset isSubmitting on success - modal will navigate away
  };
  
  const handleKeepCreating = () => {
    setShowModal(false);
    router.push('/(tabs)/create');
  };
  
  const handleBuildProfile = () => {
    setShowModal(false);
    router.push('/character-quiz');
  };

  const isAllQuestionsAnswered = answers.length === followUpQuestions.length;

  // Intro screen
  if (showIntro) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.introContainer}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol name="chevron.left" size={24} color={colors.text} />
          </TouchableOpacity>
          
          <Animated.View entering={FadeInDown.duration(350).delay(0)} style={styles.introContent}>
            <View style={[styles.introIconWrap, { backgroundColor: colors.card }]}>
              <IconSymbol name="questionmark.bubble" size={32} color={colors.text} />
            </View>
            <Text style={[styles.introTitle, { color: colors.text }]}>personalize your story</Text>
            <Text style={[styles.introDescription, { color: colors.textSecondary }]}>
              answer a few quick questions to help craft a more immersive experience, just for you
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(300).delay(150)} style={styles.introButtons}>
            <TouchableOpacity style={[styles.continueButton, { backgroundColor: colors.buttonBackground }]} onPress={handleStartQuestions}>
              <Text style={[styles.continueButtonText, { color: colors.buttonText }]}>continue</Text>
              <IconSymbol name="arrow.right" size={18} color={colors.buttonText} />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.skipButton, isSubmitting && { opacity: 0.5 }]} 
              onPress={handleSkipAllQuestions}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Text style={[styles.skipButtonText, { color: colors.textSecondary }]}>skip questions</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>
        
        <StorySubmittedModal
          visible={showModal}
          onKeepCreating={handleKeepCreating}
          onBuildProfile={handleBuildProfile}
          onGoToStories={() => {
            setShowModal(false);
            router.replace('/(tabs)/mystories');
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.avoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <IconSymbol name="chevron.left" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>a few more details</Text>
            <ProgressDots
              total={followUpQuestions.length}
              current={currentQuestionIndex}
              activeColor={colors.text}
              inactiveColor={colors.border}
            />
          </View>
          {!isAllQuestionsAnswered && (
            <TouchableOpacity onPress={handleSkipCurrentQuestion} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={[styles.headerSkipText, { color: colors.textSecondary }]}>skip</Text>
            </TouchableOpacity>
          )}
          {isAllQuestionsAnswered && <View style={{ width: 22 }} />}
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToBottom}
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <TypingIndicator color={colors.textSecondary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                thinking...
              </Text>
            </View>
          ) : (
            <>
              {error && (
                <Animated.View entering={FadeIn.duration(300)} style={[styles.errorBanner, { backgroundColor: 'rgba(255,149,0,0.1)' }]}>
                  <IconSymbol name="exclamationmark.triangle" size={14} color="#ff9500" />
                  <Text style={[styles.errorText, { color: '#ff9500' }]}>{error}</Text>
                </Animated.View>
              )}
              {messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  index={index}
                  botBg={colors.card}
                  userBg={colors.buttonBackground}
                  botTextColor={colors.text}
                  userTextColor={colors.buttonText}
                />
              ))}
              {showTypingIndicator && (
                <View style={[styles.messageBubble, styles.botBubble, { backgroundColor: colors.card }]}>
                  <TypingIndicator color={colors.textSecondary} />
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* Input Area */}
        {!isLoading && (
          <View style={[styles.inputContainer, { backgroundColor: colors.background }]}>
            {isAllQuestionsAnswered ? (
              <Animated.View entering={FadeInDown.duration(400).springify()}>
                <TouchableOpacity 
                  onPress={handleGenerateStory} 
                  style={[styles.generateButton, { backgroundColor: colors.buttonBackground }, isSubmitting && styles.generateButtonDisabled]}
                  disabled={isSubmitting}
                  activeOpacity={0.8}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color={colors.buttonText} />
                  ) : (
                    <IconSymbol name="sparkles" size={16} color={colors.buttonText} />
                  )}
                  <Text style={[styles.generateButtonText, { color: colors.buttonText }]}>
                    {isSubmitting ? 'adding to queue...' : 'generate story'}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            ) : (
              <>
                <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <TextInput
                    ref={inputRef}
                    style={[styles.textInput, { color: colors.text }, Platform.OS === 'web' && { outlineStyle: 'none' } as any]}
                    value={currentInput}
                    onChangeText={setCurrentInput}
                    placeholder="type your answer..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    maxLength={500}
                    autoCorrect={true}
                    autoCapitalize="sentences"
                    returnKeyType="send"
                    blurOnSubmit={false}
                    onSubmitEditing={handleSendMessage}
                  />
                  <TouchableOpacity
                    style={[styles.sendButton, !currentInput.trim() && styles.sendButtonDisabled]}
                    onPress={handleSendMessage}
                    disabled={!currentInput.trim()}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <View style={[styles.sendButtonInner, { backgroundColor: currentInput.trim() ? colors.text : 'transparent' }]}>
                      <IconSymbol
                        name="arrow.up"
                        size={16}
                        color={currentInput.trim() ? colors.background : colors.textSecondary}
                      />
                    </View>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
      
      <StorySubmittedModal
        visible={showModal}
        onKeepCreating={handleKeepCreating}
        onBuildProfile={handleBuildProfile}
        onGoToStories={() => {
          setShowModal(false);
          router.replace('/(tabs)/mystories');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  avoidingView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCenter: {
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '500',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  // Progress dots
  progressDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  progressDot: {
    height: 6,
    borderRadius: 3,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 6,
  },
  loadingContainer: {
    minHeight: 300,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 15,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 13,
    fontFamily: 'EBGaramond-Regular',
  },
  messageBubble: {
    maxWidth: '82%',
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginVertical: 3,
  },
  botBubble: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    borderTopLeftRadius: 6,
  },
  userBubble: {
    alignSelf: 'flex-end',
    borderRadius: 20,
    borderTopRightRadius: 6,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 23,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  // Typing indicator
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  // Input area
  inputContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 8 : 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 24,
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  textInput: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 16,
    maxHeight: 100,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
    textAlignVertical: 'center',
  },
  sendButton: {
    padding: 2,
    marginBottom: 2,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateButton: {
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  generateButtonDisabled: {
    opacity: 0.6,
  },
  generateButtonText: {
    fontSize: 16,
    fontWeight: '500',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  // Intro screen styles
  introContainer: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 24,
    paddingTop: 80,
    paddingBottom: 40,
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 24,
    zIndex: 10,
    padding: 8,
  },
  introContent: {
    alignItems: 'center',
    gap: 20,
    flex: 1,
    justifyContent: 'center',
  },
  introIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  introTitle: {
    fontSize: 28,
    fontWeight: '500',
    textAlign: 'center',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  introDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 24,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  introButtons: {
    gap: 12,
    width: '100%',
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 999,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '500',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  skipButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 14,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  headerSkipText: {
    fontSize: 14,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
});
