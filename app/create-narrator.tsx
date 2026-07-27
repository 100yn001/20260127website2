import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Check, Save, Shuffle } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

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
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/cn';

type Step = 'basic' | 'details' | 'voice' | 'review';
const STEPS: Step[] = ['basic', 'details', 'voice', 'review'];

type Gender = 'female' | 'male' | 'custom';
type VoiceGender = 'female' | 'male' | 'androgynous';
type Age = 'young' | 'mid' | 'elder';

const TINTS: { id: string; a: string; b: string }[] = [
  { id: 'amber', a: '#e5d6b8', b: '#8a8055' },
  { id: 'rose', a: '#e8d2c1', b: '#a37257' },
  { id: 'sky', a: '#c4d6ef', b: '#6a8fb8' },
  { id: 'sage', a: '#cde0d2', b: '#5f8d66' },
  { id: 'lilac', a: '#e5d1e8', b: '#a57aa5' },
  { id: 'slate', a: '#c7cfda', b: '#54606f' },
];

const FEATURES = [
  'warm',
  'raspy',
  'breathy',
  'bright',
  'slow',
  'whispered',
  'gravelly',
  'musical',
];

export default function CreateNarratorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ selectedVoiceId?: string }>();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>('basic');

  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [customGender, setCustomGender] = useState('');
  const [tintId, setTintId] = useState('rose');

  const [relationship, setRelationship] = useState('');
  const [description, setDescription] = useState('');

  const [voiceGender, setVoiceGender] = useState<VoiceGender>('female');
  const [accent, setAccent] = useState('');
  const [age, setAge] = useState<Age | null>(null);
  const [features, setFeatures] = useState<string[]>([]);
  // ElevenLabs voice id, picked/designed in /voice-library (returned via
  // router.back() + setParams — same hand-off recipe.tsx uses).
  const [voiceId, setVoiceId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (params.selectedVoiceId) setVoiceId(params.selectedVoiceId as string);
  }, [params.selectedVoiceId]);

  const stepIndex = STEPS.indexOf(step);
  const total = STEPS.length;
  const tint = useMemo(() => TINTS.find((t) => t.id === tintId) ?? TINTS[0], [tintId]);

  const goBack = () => {
    if (stepIndex <= 0) router.back();
    else setStep(STEPS[stepIndex - 1]);
  };
  const goNext = () => setStep(STEPS[stepIndex + 1]);

  const canAdvance = useMemo(() => {
    if (step === 'basic') return name.trim().length > 0 && !!gender;
    if (step === 'details') return relationship.trim().length > 0;
    if (step === 'voice') return !!age;
    return true;
  }, [step, name, gender, relationship, age]);

  const toggleFeature = (f: string) => {
    setFeatures((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : prev.length >= 4 ? prev : [...prev, f]
    );
  };

  const handleSave = async () => {
    if (!user) {
      Alert.alert('sign in required', 'please sign in to save a narrator');
      return;
    }
    setSaving(true);
    try {
      const id = `${Date.now()}`;
      await setDoc(doc(db, 'users', user.uid, 'narrators', id), {
        id,
        name: name.trim(),
        gender: gender === 'custom' ? customGender.trim() : gender,
        relationship: relationship.trim(),
        description: description.trim(),
        color: tintId,
        colorA: tint.a,
        colorB: tint.b,
        voiceGender,
        accent: accent.trim(),
        age,
        features,
        ...(voiceId ? { voiceId } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      router.replace('/(tabs)/narrators');
    } catch (e: any) {
      Alert.alert('save failed', e?.message ?? 'please try again');
    } finally {
      setSaving(false);
    }
  };

  /* ============================================================ BASIC */
  if (step === 'basic') {
    return (
      <Screen>
        <TopBar onBack={goBack} step={stepIndex + 1} total={total} />
        <FlowCluster>
          <ScreenHeader title="name your narrator" subtitle="name, gender, color" />
          <AvatarBanner tint={tint} label={name || 'unnamed'} />
          <View className="gap-4">
            <Card className="p-5 gap-3">
              <Label>name</Label>
              <Input
                value={name}
                onChangeText={(t) => setName(t.slice(0, 40))}
                placeholder="e.g. marguerite"
              />
            </Card>
            <Card className="p-5 gap-3">
              <Label>gender</Label>
              <ToggleGroup<Gender>
                value={gender}
                onValueChange={setGender}
                options={[
                  { value: 'female', label: 'female' },
                  { value: 'male', label: 'male' },
                  { value: 'custom', label: 'custom' },
                ]}
              />
              {gender === 'custom' && (
                <Input
                  value={customGender}
                  onChangeText={setCustomGender}
                  placeholder="describe in a word or two"
                />
              )}
            </Card>
            <Card className="p-5 gap-3">
              <View className="flex-row items-center justify-between">
                <Label>color</Label>
                <Pressable
                  onPress={() => setTintId(TINTS[Math.floor(Math.random() * TINTS.length)].id)}
                  className="flex-row items-center gap-1"
                >
                  <Shuffle size={12} color="hsl(var(--muted-foreground))" />
                  <Text className="text-xs font-serif text-muted-foreground">random</Text>
                </Pressable>
              </View>
              <View className="flex-row items-center gap-2">
                {TINTS.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => setTintId(t.id)}
                    className={cn(
                      'h-8 w-8 overflow-hidden rounded-full',
                      tintId === t.id && 'border-2 border-foreground'
                    )}
                  >
                    <LinearGradient
                      colors={[t.a, t.b]}
                      start={{ x: 0.3, y: 0.25 }}
                      end={{ x: 1, y: 1 }}
                      style={{ flex: 1 }}
                    />
                  </Pressable>
                ))}
              </View>
            </Card>
          </View>
          <ContinueButton disabled={!canAdvance} onPress={goNext} />
        </FlowCluster>
      </Screen>
    );
  }

  /* ============================================================ DETAILS */
  if (step === 'details') {
    return (
      <Screen>
        <TopBar onBack={goBack} step={stepIndex + 1} total={total} />
        <FlowCluster>
          <ScreenHeader title="who are they, to you?" />
          <View className="gap-4">
            <Card className="p-5 gap-3">
              <Label>relationship</Label>
              <Input
                value={relationship}
                onChangeText={setRelationship}
                placeholder="e.g. the quiet one from your book club"
              />
            </Card>
            <Card className="p-5 gap-3">
              <View className="flex-row items-baseline justify-between">
                <Label>description</Label>
                <Text className="text-[11px] font-serif text-muted-foreground">optional</Text>
              </View>
              <Textarea
                value={description}
                onChangeText={(t) => setDescription(t.slice(0, 500))}
                placeholder="physical traits, quirks, habits"
                numberOfLines={5}
                className="min-h-[120px]"
              />
              <Text className="text-[11px] font-sans text-right text-muted-foreground">
                {description.length}/500
              </Text>
            </Card>
          </View>
          <ContinueButton disabled={!canAdvance} onPress={goNext} />
        </FlowCluster>
      </Screen>
    );
  }

  /* ============================================================ VOICE */
  if (step === 'voice') {
    return (
      <Screen>
        <TopBar onBack={goBack} step={stepIndex + 1} total={total} />
        <FlowCluster>
          <ScreenHeader title="how do they sound?" />
          <View className="gap-4">
            <Card className="p-5 gap-3">
              <Label>voice register</Label>
              <ToggleGroup<VoiceGender>
                value={voiceGender}
                onValueChange={setVoiceGender}
                options={[
                  { value: 'female', label: 'female' },
                  { value: 'male', label: 'male' },
                  { value: 'androgynous', label: 'androgynous' },
                ]}
              />
            </Card>
            <Card className="p-5 gap-3">
              <Label>accent</Label>
              <Input
                value={accent}
                onChangeText={setAccent}
                placeholder="e.g. southern us · british rp · irish"
              />
            </Card>
            <Card className="p-5 gap-3">
              <Label>age</Label>
              <ToggleGroup<Age>
                value={age}
                onValueChange={setAge}
                options={[
                  { value: 'young', label: 'young adult' },
                  { value: 'mid', label: 'middle-aged' },
                  { value: 'elder', label: 'elderly' },
                ]}
              />
            </Card>
            <Card className="p-5 gap-3">
              <View className="flex-row items-baseline justify-between">
                <Label>voice qualities</Label>
                <Text className="text-[11px] font-sans text-muted-foreground">
                  {features.length}/4
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {FEATURES.map((f) => {
                  const active = features.includes(f);
                  return (
                    <Pressable
                      key={f}
                      onPress={() => toggleFeature(f)}
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
            </Card>
            <Card className="p-5 gap-3">
              <View className="flex-row items-baseline justify-between">
                <Label>their voice</Label>
                <Text className="text-[11px] font-serif text-muted-foreground">
                  {voiceId ? 'selected' : 'optional'}
                </Text>
              </View>
              <Text className="text-sm font-serif text-muted-foreground">
                {voiceId
                  ? 'a voice is set for this narrator.'
                  : 'pick or design the exact voice they speak with — otherwise a default voice matching the register above is used.'}
              </Text>
              <Button
                variant="outline"
                onPress={() =>
                  router.push({
                    pathname: '/voice-library' as never,
                    params: {
                      genderHint: voiceGender === 'androgynous' ? '' : voiceGender,
                      userName: name.trim() || 'you',
                    },
                  })
                }
              >
                {voiceId ? 'change voice' : 'choose or design a voice'}
              </Button>
            </Card>
          </View>
          <ContinueButton disabled={!canAdvance} onPress={goNext} />
        </FlowCluster>
      </Screen>
    );
  }

  /* ============================================================ REVIEW */
  return (
    <Screen>
      <TopBar onBack={goBack} step={stepIndex + 1} total={total} />
      <FlowCluster>
        <ScreenHeader title="review + save" />
        <AvatarBanner tint={tint} label={name || 'unnamed'} subtitle={accent || undefined} />
        <Card className="p-5 gap-2">
          <Row label="gender" value={gender === 'custom' ? customGender : gender ?? '—'} />
          <Row label="relationship" value={relationship || '—'} />
          <Row
            label="voice"
            value={`${voiceGender}${age ? ` · ${age}` : ''}${voiceId ? ' · custom voice' : ' · default voice'}`}
          />
          {features.length > 0 && <Row label="qualities" value={features.join(', ')} />}
        </Card>
        <Button size="lg" className="w-full" onPress={handleSave} loading={saving}>
          <Save size={18} color="hsl(var(--primary-foreground))" />
          save narrator
        </Button>
      </FlowCluster>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

function AvatarBanner({
  tint,
  label,
  subtitle,
}: {
  tint: { a: string; b: string };
  label: string;
  subtitle?: string;
}) {
  return (
    <Card className="p-4 flex-row items-center gap-4">
      <View className="h-14 w-14 overflow-hidden rounded-full">
        <LinearGradient
          colors={[tint.a, tint.b]}
          start={{ x: 0.3, y: 0.25 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1 }}
        />
      </View>
      <View className="flex-1">
        <Text className="text-[1.05rem] font-serif-medium text-foreground" numberOfLines={1}>
          {label}
        </Text>
        {subtitle && (
          <Text className="mt-0.5 text-xs font-serif text-muted-foreground" numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline justify-between gap-4">
      <Text className="text-xs font-serif text-muted-foreground">{label}</Text>
      <Text className="text-sm font-serif text-foreground flex-1 text-right" numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}
