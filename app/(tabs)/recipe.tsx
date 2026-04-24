import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Shuffle,
  Sparkles,
  Volume2,
  Waves,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  ContinueButton,
  FlowCluster,
  Screen,
  ScreenHeader,
  TopBar,
} from '@/components/screen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup } from '@/components/ui/toggle-group';
import { useMode } from '@/hooks/useMode';
import { cn } from '@/lib/cn';

type Step =
  | 'ingredients'
  | 'gender'
  | 'features'
  | 'narration'
  | 'name'
  | 'voice'
  | 'preview';
type Gender = 'female' | 'male' | 'custom';
type Duration = '5min' | '10min' | '15min';
type NameOpt = 'my-name' | 'custom' | 'nameless';

const settings = ['victorian', 'medieval', 'cyberpunk', 'small town', 'fantasy', 'modern'];
const locations = ['bedroom', 'dungeon', 'nightclub', 'office', 'hotel', 'beach'];
const characters = ['boss', 'professor', 'student', 'artist', 'neighbor', 'stranger'];
const tropes = [
  'enemies to lovers',
  'friends to lovers',
  'second chance romance',
  'fake relationship',
];
const featureList = [
  'bondage',
  'spanking',
  'blindfolds',
  'exhibitionism',
  'orgasm control',
  'edging',
  'body worship',
  'praise',
  'aftercare',
  'toys',
  'biting',
  'cuddling',
];

const voices = [
  { id: 'v1', name: 'ember', accent: 'southern us', mood: 'warm, lived-in' },
  { id: 'v2', name: 'wren', accent: 'british rp', mood: 'measured, gentle' },
  { id: 'v3', name: 'iris', accent: 'neutral us', mood: 'bright, close-miked' },
  { id: 'v4', name: 'atlas', accent: 'irish', mood: 'low, contemplative' },
];

export default function RecipeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; selectedVoiceId?: string }>();
  const { mode } = useMode();
  const isNighttime = mode === 'night';

  const [step, setStep] = useState<Step>('ingredients');

  const [settingIdx, setSettingIdx] = useState(0);
  const [locationIdx, setLocationIdx] = useState(0);
  const [characterIdx, setCharacterIdx] = useState(0);
  const [tropeIdx, setTropeIdx] = useState(0);
  const [settingSel, setSettingSel] = useState<string | null>(null);
  const [locationSel, setLocationSel] = useState<string | null>(null);
  const [characterSel, setCharacterSel] = useState<string | null>(null);
  const [tropeSel, setTropeSel] = useState<string | null>(null);

  const [selfGender, setSelfGender] = useState<Gender | null>(null);
  const [charGender, setCharGender] = useState<Gender | null>(null);
  const [selfCustom, setSelfCustom] = useState('');
  const [charCustom, setCharCustom] = useState('');

  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  const [duration, setDuration] = useState<Duration>('10min');
  const [ratio, setRatio] = useState(5);
  const [ambient, setAmbient] = useState<'auto' | 'off' | 'custom'>('auto');
  const [ambientPrompt, setAmbientPrompt] = useState('');

  const [nameOpt, setNameOpt] = useState<NameOpt>('my-name');
  const [customName, setCustomName] = useState('');
  const [storedName, setStoredName] = useState('User');

  const [voiceId, setVoiceId] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('userName').then((v) => v && setStoredName(v));
  }, []);

  useEffect(() => {
    if (params.selectedVoiceId) setVoiceId(params.selectedVoiceId as string);
  }, [params.selectedVoiceId]);

  const orderedSteps: Step[] = [
    'ingredients',
    'gender',
    ...((isNighttime ? ['features'] : []) as Step[]),
    'narration',
    'name',
    'voice',
    'preview',
  ];
  const stepIndex = orderedSteps.indexOf(step);
  const progress = stepIndex + 1;
  const total = orderedSteps.length;

  const goBack = () => {
    if (step === 'ingredients') router.back();
    else {
      const prev = orderedSteps[stepIndex - 1];
      if (prev) setStep(prev);
    }
  };
  const goNext = () => {
    const next = orderedSteps[stepIndex + 1];
    if (next) setStep(next);
  };

  const userName =
    nameOpt === 'my-name' ? storedName : nameOpt === 'custom' ? customName || 'User' : 'you';
  const resolveSelf = selfGender === 'custom' ? selfCustom.trim() : selfGender;
  const resolveChar = charGender === 'custom' ? charCustom.trim() : charGender;

  const chips = [settingSel, locationSel, characterSel, tropeSel, ...selectedFeatures].filter(
    Boolean
  ) as string[];

  const handleSubmit = () => {
    router.push({
      pathname: '/followup',
      params: {
        userName,
        setting: settingSel ?? '',
        location: locationSel ?? '',
        character: characterSel ?? '',
        genderSelf: resolveSelf || '',
        genderOther: resolveChar || '',
        trope: tropeSel ?? '',
        features: JSON.stringify(selectedFeatures),
        featurePreferences: JSON.stringify({}),
        isNighttime: String(isNighttime),
        duration,
        narrativeRatio: String(ratio),
        voiceId: voiceId ?? '',
        prompt: '',
        tags: JSON.stringify(chips),
        ambientMode: ambient,
        ambientCustomPrompt: ambientPrompt,
      },
    });
  };

  /* ============================================================ INGREDIENTS */
  if (step === 'ingredients') {
    const ready = settingSel && locationSel && characterSel && tropeSel;
    return (
      <Screen mode={mode}>
        <TopBar onBack={goBack} step={progress} total={total} />
        <FlowCluster>
          <ScreenHeader title="pick your ingredients" subtitle="mix and match" />
          <View className="gap-3">
            <Picker
              label="setting"
              options={settings}
              index={settingIdx}
              setIndex={setSettingIdx}
              selected={settingSel}
              setSelected={setSettingSel}
            />
            <Picker
              label="location"
              options={locations}
              index={locationIdx}
              setIndex={setLocationIdx}
              selected={locationSel}
              setSelected={setLocationSel}
            />
            <Picker
              label="character"
              options={characters}
              index={characterIdx}
              setIndex={setCharacterIdx}
              selected={characterSel}
              setSelected={setCharacterSel}
            />
            <Picker
              label="trope"
              options={tropes}
              index={tropeIdx}
              setIndex={setTropeIdx}
              selected={tropeSel}
              setSelected={setTropeSel}
            />
          </View>
          <ContinueButton disabled={!ready} onPress={goNext} />
        </FlowCluster>
      </Screen>
    );
  }

  /* ============================================================ GENDER */
  if (step === 'gender') {
    return (
      <Screen mode={mode}>
        <TopBar onBack={goBack} step={progress} total={total} />
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
          <ContinueButton
            disabled={!selfGender || !charGender}
            onPress={goNext}
          />
        </FlowCluster>
      </Screen>
    );
  }

  /* ============================================================ FEATURES */
  if (step === 'features') {
    const toggle = (f: string) =>
      setSelectedFeatures((prev) =>
        prev.includes(f)
          ? prev.filter((x) => x !== f)
          : prev.length >= 3
          ? prev
          : [...prev, f]
      );
    return (
      <Screen mode={mode}>
        <TopBar onBack={goBack} step={progress} total={total} />
        <FlowCluster>
          <ScreenHeader title="highlight a few elements" subtitle="up to three" />
          <View>
            <View className="flex-row flex-wrap gap-2">
              {featureList.map((f) => {
                const active = selectedFeatures.includes(f);
                return (
                  <Pressable
                    key={f}
                    onPress={() => toggle(f)}
                    className={cn(
                      'rounded-full border px-3.5 py-2',
                      active
                        ? 'bg-primary border-primary'
                        : 'bg-card border-border'
                    )}
                  >
                    <Text
                      className={cn(
                        'text-sm font-serif',
                        active ? 'text-primary-foreground' : 'text-foreground'
                      )}
                    >
                      {f}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text className="mt-4 text-xs font-serif text-muted-foreground">
              {selectedFeatures.length}/3 selected
            </Text>
          </View>
          <ContinueButton disabled={selectedFeatures.length === 0} onPress={goNext} />
        </FlowCluster>
      </Screen>
    );
  }

  /* ============================================================ NARRATION */
  if (step === 'narration') {
    const descriptivePct = (10 - ratio) * 10;
    const directPct = ratio * 10;
    return (
      <Screen mode={mode}>
        <TopBar onBack={goBack} step={progress} total={total} />
        <FlowCluster>
          <ScreenHeader title="narration style" subtitle="pacing and duration" />
          <View className="gap-4">
            <Card className="p-5 gap-4">
              <Label>duration</Label>
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
              <View className="flex-row items-baseline justify-between">
                <Label>descriptive · direct</Label>
                <Text className="text-xs font-sans text-muted-foreground">
                  {descriptivePct}% · {directPct}%
                </Text>
              </View>
              <Slider value={ratio} onValueChange={setRatio} min={0} max={10} step={1} />
            </Card>
            <Card className="p-5 gap-4">
              <View className="flex-row items-baseline justify-between">
                <Label>ambient sound</Label>
                <Text className="text-[11px] font-serif text-muted-foreground">
                  background layer
                </Text>
              </View>
              <ToggleGroup<'auto' | 'off' | 'custom'>
                value={ambient}
                onValueChange={setAmbient}
                options={[
                  { value: 'auto', label: 'auto' },
                  { value: 'off', label: 'off' },
                  { value: 'custom', label: 'custom' },
                ]}
              />
              {ambient === 'custom' && (
                <Input
                  value={ambientPrompt}
                  onChangeText={setAmbientPrompt}
                  placeholder="e.g. soft rain on a tin roof, distant thunder"
                />
              )}
              <Text className="text-xs font-serif text-muted-foreground">
                {ambient === 'auto' && "we'll pick ambient that fits the scene."}
                {ambient === 'off' && 'voice only, no background layer.'}
                {ambient === 'custom' &&
                  'describe the soundscape you want underneath.'}
              </Text>
            </Card>
          </View>
          <ContinueButton onPress={goNext} />
        </FlowCluster>
      </Screen>
    );
  }

  /* ============================================================ NAME */
  if (step === 'name') {
    const options: { value: NameOpt; title: string; sub: string }[] = [
      { value: 'my-name', title: 'use my name', sub: storedName },
      { value: 'custom', title: 'use another name', sub: 'customize what the voice says' },
      { value: 'nameless', title: 'generate a nameless audio', sub: 'you\'ll be addressed as "you"' },
    ];
    return (
      <Screen mode={mode}>
        <TopBar onBack={goBack} step={progress} total={total} />
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
                      <Text className="text-base font-serif-medium text-foreground">
                        {o.title}
                      </Text>
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
          <ContinueButton onPress={goNext} />
        </FlowCluster>
      </Screen>
    );
  }

  /* ============================================================ VOICE */
  if (step === 'voice') {
    return (
      <Screen mode={mode}>
        <TopBar onBack={goBack} step={progress} total={total} />
        <FlowCluster>
          <ScreenHeader title="pick a voice" subtitle="preview each one" />
          <View className="flex-row flex-wrap gap-2.5">
            {voices.map((v) => {
              const active = voiceId === v.id;
              return (
                <Pressable
                  key={v.id}
                  onPress={() => setVoiceId(v.id)}
                  style={{ width: '48%' }}
                  className={cn(
                    'aspect-square rounded-[var(--radius)] border bg-card p-4',
                    active ? 'border-foreground' : 'border-border'
                  )}
                >
                  <View className="flex-1 justify-between">
                    <View>
                      <Text className="text-[1.05rem] font-serif-medium text-foreground">
                        {v.name}
                      </Text>
                      <Text className="mt-0.5 text-[11px] font-serif text-muted-foreground uppercase tracking-wide">
                        {v.accent}
                      </Text>
                      <Text className="mt-2 text-xs font-serif text-muted-foreground leading-relaxed">
                        {v.mood}
                      </Text>
                    </View>
                    <View className="flex-row items-center justify-between">
                      <Waves size={14} color="hsl(var(--muted-foreground))" />
                      <View
                        className={cn(
                          'h-8 w-8 items-center justify-center rounded-full border',
                          active ? 'bg-primary border-primary' : 'border-border'
                        )}
                      >
                        <Volume2
                          size={14}
                          color={
                            active ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))'
                          }
                        />
                      </View>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <ContinueButton disabled={!voiceId} onPress={goNext} />
        </FlowCluster>
      </Screen>
    );
  }

  /* ============================================================ PREVIEW */
  return (
    <Screen mode={mode}>
      <TopBar onBack={goBack} step={progress} total={total} />
      <FlowCluster className="items-center">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-accent self-center">
          <Sparkles size={18} color="hsl(var(--foreground))" />
        </View>
        <View>
          <Text className="text-center text-[1.6rem] font-serif-medium text-foreground">
            your recipe is ready
          </Text>
          <Text className="mt-2 text-center text-sm font-serif text-foreground/70">
            here's what we'll pour into this one.
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2 justify-center self-center max-w-[360px]">
          {chips.map((c) => (
            <Badge key={c}>{c}</Badge>
          ))}
        </View>
        <Text className="text-center text-xs font-sans text-muted-foreground">
          {duration} · {ratio * 10}% direct · {isNighttime ? 'nighttime' : 'daytime'}
        </Text>
        <View className="flex-row gap-2 self-center w-full max-w-[360px]">
          <Button variant="outline" size="lg" onPress={() => setStep('ingredients')}>
            <ArrowLeft size={18} color="hsl(var(--foreground))" />
            edit
          </Button>
          <Button size="lg" className="flex-1" onPress={handleSubmit}>
            <Sparkles size={18} color="hsl(var(--primary-foreground))" />
            let's hear it
            <ArrowRight size={18} color="hsl(var(--primary-foreground))" />
          </Button>
        </View>
      </FlowCluster>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

function Picker({
  label,
  options,
  index,
  setIndex,
  selected,
  setSelected,
}: {
  label: string;
  options: string[];
  index: number;
  setIndex: (n: number) => void;
  selected: string | null;
  setSelected: (v: string | null) => void;
}) {
  const [custom, setCustom] = useState('');
  const [localMode, setLocalMode] = useState<'pick' | 'custom'>('pick');
  const current = options[index];
  const isSelected =
    (localMode === 'pick' && selected === current) ||
    (localMode === 'custom' && selected === custom && custom.trim().length > 0);

  const commit = () => {
    if (localMode === 'pick') setSelected(current);
    else if (custom.trim()) setSelected(custom.trim());
  };

  return (
    <Card className="p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <Label>{label}</Label>
        <View className="flex-row items-center gap-1 rounded-full border border-border bg-muted p-0.5">
          <Pressable
            onPress={() => setLocalMode('pick')}
            className={cn('px-2.5 py-1 rounded-full', localMode === 'pick' && 'bg-card')}
          >
            <Text className="text-[11px] font-serif text-foreground">browse</Text>
          </Pressable>
          <Pressable
            onPress={() => setLocalMode('custom')}
            className={cn('px-2.5 py-1 rounded-full', localMode === 'custom' && 'bg-card')}
          >
            <Text className="text-[11px] font-serif text-foreground">custom</Text>
          </Pressable>
        </View>
      </View>

      {localMode === 'pick' ? (
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => setIndex((index - 1 + options.length) % options.length)}
            className="h-10 w-10 items-center justify-center rounded-full border border-border"
          >
            <ChevronLeft size={14} color="hsl(var(--foreground))" />
          </Pressable>
          <Pressable
            onPress={commit}
            className={cn(
              'flex-1 h-12 items-center justify-center rounded-full',
              selected === current
                ? 'bg-primary'
                : 'bg-card border border-border'
            )}
          >
            <Text
              className={cn(
                'text-base font-serif',
                selected === current ? 'text-primary-foreground' : 'text-foreground'
              )}
            >
              {current}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setIndex((index + 1) % options.length)}
            className="h-10 w-10 items-center justify-center rounded-full border border-border"
          >
            <ChevronRight size={14} color="hsl(var(--foreground))" />
          </Pressable>
          <Pressable
            onPress={() => setIndex(Math.floor(Math.random() * options.length))}
            className="h-10 w-10 items-center justify-center rounded-full border border-border"
          >
            <Shuffle size={14} color="hsl(var(--foreground))" />
          </Pressable>
        </View>
      ) : (
        <View className="flex-row items-center gap-2">
          <Input
            value={custom}
            onChangeText={setCustom}
            onBlur={commit}
            placeholder={`enter custom ${label}`}
            className="flex-1"
          />
          <Pressable
            onPress={commit}
            disabled={!custom.trim()}
            className={cn(
              'h-11 px-4 rounded-full items-center justify-center',
              custom.trim() ? 'bg-primary' : 'bg-muted'
            )}
          >
            <Text
              className={cn(
                'text-sm font-serif',
                custom.trim() ? 'text-primary-foreground' : 'text-muted-foreground'
              )}
            >
              use
            </Text>
          </Pressable>
        </View>
      )}

      {isSelected && (
        <View className="mt-2.5 flex-row items-center gap-1">
          <Check size={12} color="hsl(var(--muted-foreground))" />
          <Text className="text-[11px] font-serif text-muted-foreground">added to recipe</Text>
        </View>
      )}
    </Card>
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
        <Input value={custom} onChangeText={setCustom} placeholder="describe in a word or two" />
      )}
    </Card>
  );
}
