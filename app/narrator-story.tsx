import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowRight, Sparkles } from 'lucide-react-native';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup } from '@/components/ui/toggle-group';
import { useMode } from '@/hooks/useMode';

type Step = 'story' | 'narration' | 'preview';
type Duration = '5min' | '10min' | '15min';

export default function NarratorStoryScreen() {
  const router = useRouter();
  const { mode } = useMode();
  const params = useLocalSearchParams<{
    narratorId?: string;
    narratorName?: string;
    narratorData?: string;
  }>();

  const narrator = React.useMemo(() => {
    try {
      return params.narratorData ? JSON.parse(params.narratorData as string) : null;
    } catch {
      return null;
    }
  }, [params.narratorData]);

  const [step, setStep] = useState<Step>('story');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState<Duration>('10min');
  const [ratio, setRatio] = useState(5);
  const [ambientPrompts, setAmbientPrompts] = useState<string[]>([]);
  const [storedName, setStoredName] = useState('User');

  useEffect(() => {
    AsyncStorage.getItem('userName').then((v) => v && setStoredName(v));
  }, []);

  const totalSteps = 3;
  const stepIdx = step === 'story' ? 0 : step === 'narration' ? 1 : 2;

  const goBack = () => {
    if (step === 'story') router.back();
    else if (step === 'narration') setStep('story');
    else setStep('narration');
  };

  const handleSubmit = () => {
    router.push({
      pathname: '/followup',
      params: {
        userName: storedName,
        setting: prompt,
        location: '',
        character: narrator?.name ?? '',
        genderSelf: '',
        genderOther: narrator?.gender ?? '',
        trope: '',
        features: JSON.stringify([]),
        featurePreferences: JSON.stringify({}),
        isNighttime: 'false',
        duration,
        narrativeRatio: String(ratio),
        voiceId: narrator?.voiceId ?? '',
        prompt,
        tags: JSON.stringify([]),
        narratorId: params.narratorId as string,
        narratorData: params.narratorData as string,
        ambientPrompts: JSON.stringify(ambientPrompts),
      },
    });
  };

  /* ============================================================ STORY */
  if (step === 'story') {
    return (
      <Screen mode={mode}>
        <TopBar onBack={goBack} step={stepIdx + 1} total={totalSteps} />
        <FlowCluster>
          <ScreenHeader title="what should they tell you?" />
          {narrator && (
            <Card className="p-4 flex-row items-center gap-3">
              <View className="h-10 w-10 overflow-hidden rounded-full">
                <LinearGradient
                  colors={[narrator.colorA ?? '#e8d2c1', narrator.colorB ?? '#a37257']}
                  start={{ x: 0.3, y: 0.25 }}
                  end={{ x: 1, y: 1 }}
                  style={{ flex: 1 }}
                />
              </View>
              <View className="flex-1">
                <Text className="text-[0.95rem] font-serif-medium text-foreground">
                  {narrator.name}
                </Text>
                {narrator.relationship && (
                  <Text
                    className="text-xs font-serif text-muted-foreground"
                    numberOfLines={1}
                  >
                    {narrator.relationship}
                  </Text>
                )}
              </View>
            </Card>
          )}
          <View className="relative">
            <Textarea
              value={prompt}
              onChangeText={(t) => setPrompt(t.slice(0, 1000))}
              placeholder={`e.g. the drive home from dinner, ${narrator?.name ?? 'they'} talking me through a long week`}
              numberOfLines={8}
              className="min-h-[180px] pb-8"
            />
            <Text
              pointerEvents="none"
              className="absolute bottom-2.5 right-3 text-[11px] font-sans text-muted-foreground"
            >
              {prompt.length}/1000
            </Text>
          </View>
          <ContinueButton
            disabled={!prompt.trim()}
            onPress={() => setStep('narration')}
          />
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
        <TopBar onBack={goBack} step={stepIdx + 1} total={totalSteps} />
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
              <AmbientPicker
                context={{
                  prompt,
                  character: narrator?.name ?? '',
                }}
                selected={ambientPrompts}
                onChange={setAmbientPrompts}
              />
            </Card>
          </View>
          <ContinueButton onPress={() => setStep('preview')} />
        </FlowCluster>
      </Screen>
    );
  }

  /* ============================================================ PREVIEW */
  return (
    <Screen mode={mode}>
      <TopBar onBack={goBack} step={stepIdx + 1} total={totalSteps} />
      <FlowCluster className="items-center">
        {narrator && (
          <View className="h-20 w-20 overflow-hidden rounded-full self-center">
            <LinearGradient
              colors={[narrator.colorA ?? '#e8d2c1', narrator.colorB ?? '#a37257']}
              start={{ x: 0.3, y: 0.25 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1 }}
            />
          </View>
        )}
        <View>
          <Text className="text-center text-[1.6rem] font-serif-medium text-foreground">
            {narrator?.name ?? 'your narrator'} is ready
          </Text>
          <Text className="mt-2 text-center text-sm font-serif text-foreground/70">
            we'll queue this with their voice and your direction.
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2 justify-center self-center max-w-[340px]">
          <Badge>{duration}</Badge>
          <Badge>{ratio * 10}% direct</Badge>
          {narrator?.gender && <Badge variant="outline">{narrator.gender}</Badge>}
        </View>
        {prompt && (
          <Text className="text-center text-sm font-serif text-muted-foreground italic self-center max-w-[320px]">
            "{prompt.length > 140 ? prompt.slice(0, 140) + '…' : prompt}"
          </Text>
        )}
        <View className="flex-row gap-2 w-full max-w-[360px] self-center">
          <Button variant="outline" size="lg" onPress={() => setStep('story')}>
            edit
          </Button>
          <Button size="lg" className="flex-1" onPress={handleSubmit}>
            <Sparkles size={18} color="hsl(var(--primary-foreground))" />
            continue
            <ArrowRight size={18} color="hsl(var(--primary-foreground))" />
          </Button>
        </View>
      </FlowCluster>
    </Screen>
  );
}
