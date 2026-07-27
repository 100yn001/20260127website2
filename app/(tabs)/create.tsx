import { useRouter } from 'expo-router';
import { ArrowUpRight, BookOpenText, Check, MicVocal, Moon, Sparkles, Sun } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  ContinueButton,
  FlowCluster,
  Screen,
  ScreenHeader,
  TopBar,
} from '@/components/screen';
import { cn } from '@/lib/cn';

type Mode = 'night' | 'day';
type Stage = 'mode' | 'pick';

const options: {
  slug: 'scratch' | 'recipe' | 'narrator';
  title: string;
  description: string;
  Icon: typeof Sparkles;
}[] = [
  {
    slug: 'scratch',
    title: 'from scratch',
    description: "describe your own story idea and we'll bring it to life",
    Icon: Sparkles,
  },
  {
    slug: 'recipe',
    title: 'from recipe',
    description: 'choose from curated settings, characters, and storylines',
    Icon: BookOpenText,
  },
  {
    slug: 'narrator',
    title: 'from narrator',
    description: 'create with one of your saved narrator personas',
    Icon: MicVocal,
  },
];

export default function CreateScreen() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('mode');
  const [mode, setMode] = useState<Mode>('night');

  if (stage === 'mode') {
    return (
      <Screen mode={mode} auraIntensity="full">
        <TopBar />
        <FlowCluster>
          <ScreenHeader title="what's the mood?" subtitle="pick a mode" />
          <View className="gap-3">
            <ModeChoice
              active={mode === 'day'}
              title="daytime"
              description="bedtime stories, nature, quiet comfort audios."
              Icon={Sun}
              onPress={() => setMode('day')}
            />
            <ModeChoice
              active={mode === 'night'}
              title="nighttime"
              description="romantic encounters and adult themes."
              Icon={Moon}
              onPress={() => setMode('night')}
            />
          </View>
          <ContinueButton onPress={() => setStage('pick')} />
        </FlowCluster>
      </Screen>
    );
  }

  // stage === 'pick'
  return (
    <Screen mode={mode} auraIntensity="subtle">
      <TopBar onBack={() => setStage('mode')} />
      <FlowCluster>
        <ScreenHeader title="how should we start?" subtitle="pick a starting point" />
        <View className="gap-2.5">
          {options.map((opt) => (
            <Pressable
              key={opt.slug}
              onPress={() =>
                // 'narrator' has no standalone screen — the narrators tab is
                // where "use in story" lives.
                opt.slug === 'narrator'
                  ? router.navigate('/(tabs)/narrators')
                  : router.navigate({ pathname: `/${opt.slug}` as never, params: { mode } })
              }
              className="overflow-hidden rounded-[var(--radius)] border border-border bg-card px-5 py-5"
            >
              <View className="flex-row items-start gap-4">
                <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
                  <opt.Icon size={18} color="hsl(var(--foreground))" />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[1.05rem] font-serif-medium text-foreground">
                      {opt.title}
                    </Text>
                    <ArrowUpRight size={16} color="hsl(var(--muted-foreground))" />
                  </View>
                  <Text className="mt-1 text-sm font-serif text-muted-foreground leading-relaxed">
                    {opt.description}
                  </Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </FlowCluster>
    </Screen>
  );
}

function ModeChoice({
  active,
  title,
  description,
  Icon,
  onPress,
}: {
  active: boolean;
  title: string;
  description: string;
  Icon: typeof Sparkles;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'relative overflow-hidden rounded-[var(--radius)] bg-card p-5',
        active && 'bg-card'
      )}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-accent">
            <Icon size={16} color="hsl(var(--foreground))" />
          </View>
          <View>
            <Text className="text-[1.05rem] font-serif-medium text-foreground">{title}</Text>
            <Text className="mt-0.5 text-sm font-serif text-muted-foreground">
              {description}
            </Text>
          </View>
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
}
