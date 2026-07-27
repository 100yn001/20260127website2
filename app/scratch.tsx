import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowRight, Check, Waves } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import AmbientPicker from '@/components/AmbientPicker';
import {
  ContinueButton,
  FlowCluster,
  Screen,
  ScreenHeader,
  TopBar,
} from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup } from '@/components/ui/toggle-group';
import {
  DEFAULT_NARRATION_MODE,
  NARRATION_MODES,
  NARRATION_MODE_LABELS,
  type NarrationMode,
} from '@/constants/narration-modes';
import { useMode } from '@/hooks/useMode';
import { cn } from '@/lib/cn';

type Step = 'idea' | 'gender' | 'narration' | 'name' | 'voice';
const STEPS: Step[] = ['idea', 'gender', 'narration', 'name', 'voice'];

type Gender = 'female' | 'male' | 'custom';
type Duration = '5min' | '10min' | '15min';
type NameOpt = 'my-name' | 'custom' | 'nameless';

export default function ScratchScreen() {
  const router = useRouter();
  const { mode } = useMode();
  const routeParams = useLocalSearchParams<{ selectedVoiceId?: string }>();

  const [step, setStep] = useState<Step>('idea');
  const [idea, setIdea] = useState('');
  const [selfGender, setSelfGender] = useState<Gender | null>(null);
  const [selfCustom, setSelfCustom] = useState('');
  const [charGender, setCharGender] = useState<Gender | null>(null);
  const [charCustom, setCharCustom] = useState('');
  const [duration, setDuration] = useState<Duration>('10min');
  const [narrationMode, setNarrationMode] = useState<NarrationMode>(DEFAULT_NARRATION_MODE);
  const [ambientPrompts, setAmbientPrompts] = useState<string[]>([]);
  const [nameOpt, setNameOpt] = useState<NameOpt>('my-name');
  const [customName, setCustomName] = useState('');
  const [storedName, setStoredName] = useState('User');
  const [voiceId, setVoiceId] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('userName').then((v) => {
      if (v) setStoredName(v);
    });
  }, []);

  // Pick up voiceId returned from /voice-library
  useEffect(() => {
    if (routeParams.selectedVoiceId) {
      setVoiceId(routeParams.selectedVoiceId as string);
    }
  }, [routeParams.selectedVoiceId]);

  const resolveSelf = selfGender === 'custom' ? selfCustom.trim() : selfGender;
  const resolveChar = charGender === 'custom' ? charCustom.trim() : charGender;
  const userName =
    nameOpt === 'my-name' ? storedName : nameOpt === 'custom' ? customName || 'User' : 'you';

  const stepIndex = STEPS.indexOf(step);
  const onBack = () => {
    if (stepIndex <= 0) router.back();
    else setStep(STEPS[stepIndex - 1]);
  };

  const handleSubmit = () => {
    if (!voiceId) return;
    router.push({
      pathname: '/followup',
      params: {
        userName,
        setting: idea,
        location: '',
        character: '',
        genderSelf: resolveSelf || '',
        genderOther: resolveChar || '',
        trope: '',
        features: JSON.stringify([]),
        featurePreferences: JSON.stringify({}),
        isNighttime: String(mode === 'night'),
        duration,
        narrationMode,
        voiceId,
        prompt: idea,
        tags: JSON.stringify([]),
        ambientPrompts: JSON.stringify(ambientPrompts),
      },
    });
  };

  /* ---------- step: idea ------------------------------------------------- */
  if (step === 'idea') {
    const canContinue = idea.trim().length > 0;
    return (
      <Screen mode={mode}>
        <TopBar onBack={onBack} step={1} total={STEPS.length} />
        <FlowCluster>
          <ScreenHeader
            title="your story idea"
            subtitle="in as much or as little detail as you want"
          />
          <View className="relative">
            <Textarea
              value={idea}
              onChangeText={(t) => setIdea(t.slice(0, 1000))}
              placeholder="e.g. an old flame knocks on your door in the middle of a storm"
              numberOfLines={8}
              className="min-h-[220px] pb-8"
            />
            <Text
              pointerEvents="none"
              className="absolute bottom-2.5 right-3 text-[11px] font-sans text-muted-foreground"
            >
              {idea.length}/1000
            </Text>
          </View>
          <ContinueButton disabled={!canContinue} onPress={() => setStep('gender')} />
        </FlowCluster>
      </Screen>
    );
  }

  /* ---------- step: gender ---------------------------------------------- */
  if (step === 'gender') {
    return (
      <Screen mode={mode}>
        <TopBar onBack={onBack} step={2} total={STEPS.length} />
        <FlowCluster>
          <ScreenHeader title="pick genders" subtitle="you and your character" />
          <View className="gap-4">
            <GenderField
              label="you"
              choice={selfGender}
              setChoice={setSelfGender}
              custom={selfCustom}
              setCustom={setSelfCustom}
            />
            <GenderField
              label="character"
              choice={charGender}
              setChoice={setCharGender}
              custom={charCustom}
              setCustom={setCharCustom}
            />
          </View>
          <ContinueButton onPress={() => setStep('narration')} />
        </FlowCluster>
      </Screen>
    );
  }

  /* ---------- step: narration ------------------------------------------- */
  if (step === 'narration') {
    return (
      <Screen mode={mode}>
        <TopBar onBack={onBack} step={3} total={STEPS.length} />
        <FlowCluster>
          <ScreenHeader title="narration style" subtitle="pacing and duration" />
          <View className="gap-4">
            <Card className="p-5 gap-4">
              <Label>approximate length</Label>
              <ToggleGroup<Duration>
                value={duration}
                onValueChange={setDuration}
                options={[
                  { value: '5min', label: '5 min' },
                  { value: '10min', label: '10 min' },
                  { value: '15min', label: '15 min' },
                ]}
              />
            </Card>
            <Card className="p-5 gap-4">
              <Label>style</Label>
              <ToggleGroup<NarrationMode>
                value={narrationMode}
                onValueChange={setNarrationMode}
                options={NARRATION_MODES.map((m) => ({ value: m, label: NARRATION_MODE_LABELS[m] }))}
              />
            </Card>
            <Card className="p-5 gap-4">
              <AmbientPicker
                context={{ prompt: idea }}
                selected={ambientPrompts}
                onChange={setAmbientPrompts}
              />
            </Card>
          </View>
          <ContinueButton onPress={() => setStep('name')} />
        </FlowCluster>
      </Screen>
    );
  }

  /* ---------- step: name ------------------------------------------------- */
  if (step === 'name') {
    const options: { value: NameOpt; title: string; sub: string }[] = [
      { value: 'my-name', title: 'use my name', sub: storedName },
      { value: 'custom', title: 'use another name', sub: 'customize what the voice says' },
      { value: 'nameless', title: 'generate a nameless audio', sub: 'you\'ll be addressed as "you"' },
    ];
    return (
      <Screen mode={mode}>
        <TopBar onBack={onBack} step={4} total={STEPS.length} />
        <FlowCluster>
          <ScreenHeader title="how should we address you?" />
          <View className="gap-2.5">
            {options.map((o) => {
              const active = nameOpt === o.value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => setNameOpt(o.value)}
                  className={cn(
                    'rounded-[var(--radius)] border bg-card px-5 py-4',
                    active ? 'border-foreground/70' : 'border-border'
                  )}
                >
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="flex-1">
                      <Text className="text-base font-serif-medium text-foreground">{o.title}</Text>
                      {o.value === 'custom' && active ? (
                        <Input
                          value={customName}
                          onChangeText={setCustomName}
                          placeholder="enter a name"
                          className="mt-2 h-10"
                        />
                      ) : (
                        <Text className="mt-0.5 text-sm font-serif text-muted-foreground">
                          {o.sub}
                        </Text>
                      )}
                    </View>
                    <View
                      className={cn(
                        'h-6 w-6 items-center justify-center rounded-full border',
                        active ? 'bg-primary border-primary' : 'border-border'
                      )}
                    >
                      {active && <Check size={14} color="hsl(var(--primary-foreground))" />}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <ContinueButton onPress={() => setStep('voice')} />
        </FlowCluster>
      </Screen>
    );
  }

  /* ---------- step: voice ----------------------------------------------- */
  const openVoiceLibrary = () => {
    router.push({
      pathname: '/voice-library' as never,
      params: {
        genderHint: resolveChar || '',
        userName,
      },
    });
  };

  return (
    <Screen mode={mode}>
      <TopBar onBack={onBack} step={5} total={STEPS.length} />
      <FlowCluster>
        <ScreenHeader title="pick a voice" subtitle="choose from real voices" />
        <Pressable
          onPress={openVoiceLibrary}
          className="rounded-[var(--radius)] border border-border bg-card p-6 items-center"
        >
          <View className="h-14 w-14 items-center justify-center rounded-full bg-accent mb-3">
            <Waves size={22} color="hsl(var(--foreground))" />
          </View>
          <Text className="text-[1.05rem] font-serif-medium text-foreground">
            {voiceId ? 'voice selected' : 'open voice library'}
          </Text>
          <Text className="mt-1 text-sm font-serif text-muted-foreground text-center">
            {voiceId ? 'tap to change' : 'browse, preview, and design voices via elevenlabs'}
          </Text>
        </Pressable>
        <View className="flex-row gap-2">
          <Button variant="outline" size="lg" onPress={() => setStep('name')}>
            back
          </Button>
          <Button size="lg" disabled={!voiceId} onPress={handleSubmit} className="flex-1">
            continue
            <ArrowRight size={18} color="hsl(var(--primary-foreground))" />
          </Button>
        </View>
      </FlowCluster>
    </Screen>
  );
}

function GenderField({
  label,
  choice,
  setChoice,
  custom,
  setCustom,
}: {
  label: string;
  choice: Gender | null;
  setChoice: (g: Gender) => void;
  custom: string;
  setCustom: (v: string) => void;
}) {
  return (
    <Card className="p-5 gap-3">
      <Label>{label}</Label>
      <ToggleGroup<Gender>
        value={choice}
        onValueChange={setChoice}
        options={[
          { value: 'female', label: 'female' },
          { value: 'male', label: 'male' },
          { value: 'custom', label: 'custom' },
        ]}
      />
      {choice === 'custom' && (
        <Input
          value={custom}
          onChangeText={setCustom}
          placeholder="describe in a word or two"
        />
      )}
    </Card>
  );
}
