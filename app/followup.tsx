import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowUp, MessageCircleQuestion, Sparkles } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  ContinueButton,
  FlowCluster,
  Screen,
  ScreenFooter,
  TopBar,
} from '@/components/screen';
import { Button } from '@/components/ui/button';
import { useStoryQueue } from '@/contexts/StoryQueueContext';
import { useMode } from '@/hooks/useMode';
import { cn } from '@/lib/cn';

type MsgType = 'bot' | 'user';
interface Message {
  id: string;
  type: MsgType;
  content: string;
}

const FALLBACK_QUESTIONS = [
  'tell me more about the character. what makes them unique?',
  "what's the specific atmosphere or mood you're imagining?",
  'how would you like them to speak to you — tender, direct, teasing?',
  "anything else you'd like us to fold in?",
];

export default function FollowUpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { addToQueue } = useStoryQueue();
  const { mode } = useMode();

  const [showIntro, setShowIntro] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [typing, setTyping] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  const getStringParam = (key: string, fallback = '') => {
    const v = params[key];
    if (!v || v === 'undefined') return fallback;
    return String(v);
  };

  const recipeData: any = {
    character: getStringParam('character'),
    genderSelf: getStringParam('genderSelf'),
    genderOther: getStringParam('genderOther'),
    trope: getStringParam('trope'),
    location: getStringParam('location'),
    setting: getStringParam('setting'),
    features: params.features ? safeParse(params.features as string, []) : [],
    featurePreferences: params.featurePreferences
      ? safeParse(params.featurePreferences as string, {})
      : {},
    isNighttime: params.isNighttime === 'true',
    userName: getStringParam('userName'),
    duration: getStringParam('duration', '10min'),
    narrationMode: getStringParam('narrationMode', 'intermediate'),
    voiceId: getStringParam('voiceId'),
    prompt: getStringParam('prompt'),
    tags: params.tags ? safeParse(params.tags as string, []) : [],
    ambientMode: getStringParam('ambientMode', 'auto'),
    ambientCustomPrompt: getStringParam('ambientCustomPrompt'),
    ambientPrompts: params.ambientPrompts ? safeParse(params.ambientPrompts as string, []) : [],
  };
  if (params.narratorData) recipeData.narratorData = safeParse(params.narratorData as string, null);
  if (params.narratorId) recipeData.narratorId = params.narratorId as string;

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const addBot = useCallback(
    (content: string, delay = 700) => {
      setTyping(true);
      scrollToBottom();
      setTimeout(() => {
        setTyping(false);
        setMessages((prev) => [...prev, { id: `${Date.now()}-b`, type: 'bot', content }]);
        scrollToBottom();
      }, delay);
    },
    [scrollToBottom]
  );

  const loadQuestions = useCallback(async () => {
    setThinking(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { generateFollowUpQuestions } = require('@/services/audio-generation');
      const qs: string[] = await generateFollowUpQuestions(recipeData);
      const valid = (qs ?? [])
        .filter((q) => q && q.length > 5)
        .map((q) => q.toLowerCase());
      const list = valid.length > 0 ? valid : FALLBACK_QUESTIONS;
      setQuestions(list);
      setThinking(false);
      addBot(list[0], 400);
    } catch {
      setQuestions(FALLBACK_QUESTIONS);
      setThinking(false);
      addBot(FALLBACK_QUESTIONS[0], 400);
    }
  }, [recipeData, addBot]);

  useEffect(() => {
    // noop — questions load on "continue"
  }, []);

  const total = questions.length;
  const isDone = total > 0 && answers.length === total;

  const startQuestions = () => {
    setShowIntro(false);
    loadQuestions();
  };

  const handleSend = () => {
    const trimmed = currentInput.trim();
    if (!trimmed || typing || thinking) return;
    setMessages((prev) => [...prev, { id: `${Date.now()}-u`, type: 'user', content: trimmed }]);
    setAnswers((prev) => [...prev, trimmed]);
    setCurrentInput('');
    scrollToBottom();

    const nextIdx = questionIndex + 1;
    if (nextIdx < total) {
      setQuestionIndex(nextIdx);
      addBot(questions[nextIdx], 900);
    } else {
      addBot('perfect — i have everything i need. ready to generate?', 900);
    }
  };

  const handleSkipOne = () => {
    setAnswers((prev) => [...prev, '']);
    const nextIdx = questionIndex + 1;
    if (nextIdx < total) {
      setQuestionIndex(nextIdx);
      addBot(questions[nextIdx], 600);
    } else {
      addBot('perfect — i have everything i need. ready to generate?', 600);
    }
  };

  const handleGenerate = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await addToQueue(recipeData, questions, answers);
      router.replace('/(tabs)/vault');
    } catch (e: any) {
      setSubmitting(false);
      if (Platform.OS === 'web') window.alert(`could not queue: ${e?.message ?? ''}`);
      else Alert.alert('could not queue story', e?.message ?? 'please try again');
    }
  };

  /* ============================================================ INTRO */
  if (showIntro) {
    return (
      <Screen mode={mode} auraIntensity="subtle">
        <TopBar onBack={() => router.back()} />
        <FlowCluster className="items-center">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-accent self-center">
            <MessageCircleQuestion size={22} color="hsl(var(--foreground))" />
          </View>
          <View>
            <Text className="text-[1.6rem] font-serif-medium text-foreground text-center">
              personalize your story
            </Text>
            <Text className="mt-2 text-[0.95rem] font-serif text-foreground/70 text-center">
              a few quick questions to shape a more immersive experience.
            </Text>
          </View>
          <View className="gap-2 w-full max-w-[320px] self-center">
            <ContinueButton onPress={startQuestions} />
            <Pressable
              onPress={async () => {
                setSubmitting(true);
                try {
                  await addToQueue(recipeData, [], []);
                  router.replace('/(tabs)/vault');
                } catch {
                  setSubmitting(false);
                }
              }}
              className="py-2 self-center"
            >
              <Text className="text-sm font-serif text-muted-foreground">skip questions</Text>
            </Pressable>
          </View>
        </FlowCluster>
      </Screen>
    );
  }

  /* ============================================================ CHAT */
  return (
    <Screen mode={mode} auraIntensity="subtle">
      <TopBar
        onBack={() => setShowIntro(true)}
        right={
          !isDone ? (
            <Pressable onPress={handleSkipOne} className="px-2 py-1">
              <Text className="text-xs font-serif text-muted-foreground">skip</Text>
            </Pressable>
          ) : null
        }
      />

      <View className="px-6 pt-1 pb-3">
        <Text className="text-[1.2rem] font-serif-medium text-foreground">a few more details</Text>
        <View className="mt-2 flex-row items-center gap-1.5">
          {Array.from({ length: Math.max(total, 1) }).map((_, i) => {
            const active = i === questionIndex && !isDone;
            const done = isDone || i < questionIndex;
            return (
              <View
                key={i}
                className={cn(
                  'h-1.5 rounded-full',
                  active ? 'bg-primary' : done ? 'bg-primary/70' : 'bg-border'
                )}
                style={{ width: active ? 24 : 6 }}
              />
            );
          })}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 12, gap: 10 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {thinking && <BotThinking />}
          {messages.map((m) => (
            <Bubble key={m.id} type={m.type} content={m.content} />
          ))}
          {typing && <TypingBubble />}
        </ScrollView>

        <ScreenFooter>
          {isDone ? (
            <Button
              size="lg"
              className="w-full"
              onPress={handleGenerate}
              loading={submitting}
            >
              <Sparkles size={18} color="hsl(var(--primary-foreground))" />
              generate story
            </Button>
          ) : (
            <View className="flex-row items-end gap-2 rounded-[22px] border border-border bg-card px-3 py-2">
              <TextInput
                value={currentInput}
                onChangeText={(t) => setCurrentInput(t.slice(0, 500))}
                placeholder="type your answer…"
                placeholderTextColor="hsl(var(--muted-foreground))"
                multiline
                onSubmitEditing={handleSend}
                returnKeyType="send"
                blurOnSubmit
                className="flex-1 py-2 px-1 text-[0.95rem] font-serif text-foreground"
                style={{ maxHeight: 120 }}
              />
              <Pressable
                onPress={handleSend}
                disabled={!currentInput.trim() || typing}
                className={cn(
                  'h-9 w-9 items-center justify-center rounded-full',
                  currentInput.trim() && !typing ? 'bg-primary' : 'bg-muted'
                )}
              >
                <ArrowUp
                  size={16}
                  color={
                    currentInput.trim() && !typing
                      ? 'hsl(var(--primary-foreground))'
                      : 'hsl(var(--muted-foreground))'
                  }
                />
              </Pressable>
            </View>
          )}
        </ScreenFooter>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

function Bubble({ type, content }: { type: MsgType; content: string }) {
  const isUser = type === 'user';
  return (
    <View
      className={cn(
        'max-w-[82%] px-4 py-2.5 rounded-[18px]',
        isUser
          ? 'self-end bg-primary rounded-br-md'
          : 'self-start bg-card border border-border rounded-bl-md'
      )}
    >
      <Text
        className={cn(
          'text-[0.95rem] font-serif leading-relaxed',
          isUser ? 'text-primary-foreground' : 'text-foreground'
        )}
      >
        {content}
      </Text>
    </View>
  );
}

function TypingBubble() {
  return (
    <View className="self-start max-w-[82%] px-4 py-3 rounded-[18px] rounded-bl-md bg-card border border-border">
      <View className="flex-row items-center gap-1.5">
        <Dot />
        <Dot />
        <Dot />
      </View>
    </View>
  );
}

function BotThinking() {
  return (
    <View className="self-start flex-row items-center gap-2 py-1">
      <View className="flex-row items-center gap-1">
        <Dot />
        <Dot />
        <Dot />
      </View>
      <Text className="text-xs font-serif text-muted-foreground">thinking</Text>
    </View>
  );
}

function Dot() {
  return <View className="h-[7px] w-[7px] rounded-full bg-muted-foreground" />;
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
