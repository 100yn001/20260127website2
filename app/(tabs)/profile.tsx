import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  BookOpen,
  Bell,
  ChevronRight,
  Download,
  LogOut,
  Moon,
  Palette,
  Pencil,
  Sun,
  Trash2,
  UserRound,
  X,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { Screen, TopBar } from '@/components/screen';
import CardScene from '@/components/silver-card/CardScene';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { TINTS, useArtworkTint } from '@/hooks/useArtworkTint';
import { cn } from '@/lib/cn';
import { getUserProfile, updateUserProfile } from '@/services/user-service';

const GUTTER = 'px-5 sm:px-8 md:px-10 lg:px-14';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut, deleteAccount } = useAuth() as any;
  const { theme, toggleTheme } = useTheme();

  const [name, setName] = useState('friend');
  const [editingName, setEditingName] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const currentTint = useArtworkTint();
  const [storyCount, setStoryCount] = useState<number>(0);
  const [narratorCount, setNarratorCount] = useState<number>(0);
  const [bookmarkCount, setBookmarkCount] = useState<number>(0);
  const [silverCard, setSilverCard] = useState<any>(null);
  const [showCard, setShowCard] = useState(false);
  const cardCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const downloadCardPng = () => {
    if (Platform.OS !== 'web') return;
    const canvas = cardCanvasRef.current;
    if (!canvas) return;
    try {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `silver-card-${stamp}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('[profile] save card png failed', e);
      Alert.alert('save failed', 'could not capture the card right now');
    }
  };
  const [aboutYou, setAboutYou] = useState<string>('');
  const [aboutEditing, setAboutEditing] = useState(false);
  const [aboutDraft, setAboutDraft] = useState('');
  const [aboutSaving, setAboutSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user) return;
      try {
        const profile = await getUserProfile(user.uid);
        if (profile?.name) setName(profile.name);
        setBookmarkCount(profile?.bookmarks?.length ?? 0);
        const sc = (profile as any)?.silverCard;
        if (sc) setSilverCard(sc);
        const saved = (profile as any)?.aboutYou;
        if (typeof saved === 'string' && saved.trim().length > 0) {
          setAboutYou(saved);
        } else {
          // Seed from the silver card so the user sees something useful on first visit.
          setAboutYou(deriveAboutYou(sc, profile));
        }
      } catch {}
    })();
  }, [user?.uid]);

  const saveName = async () => {
    setEditingName(false);
    if (!user) return;
    try {
      await updateUserProfile(user.uid, { name });
      await AsyncStorage.setItem('userName', name);
    } catch {}
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace('/auth/login');
    } catch (e: any) {
      Alert.alert('sign out failed', e.message ?? '');
    }
  };

  const confirmDelete = () => {
    Alert.alert('delete account?', 'this is permanent.', [
      { text: 'cancel', style: 'cancel' },
      {
        text: 'delete',
        style: 'destructive',
        onPress: async () => {
          try {
            if (deleteAccount) await deleteAccount();
            router.replace('/onboarding');
          } catch (e: any) {
            Alert.alert('error', e.message ?? '');
          }
        },
      },
    ]);
  };

  const tint = currentTint;
  const isDark = theme === 'dark';

  return (
    <Screen wide>
      <TopBar right={<ThemeToggle />} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
      >
        <View className={cn(GUTTER, 'pt-2 pb-6')}>
          <Text className="text-[1.9rem] font-serif-medium text-foreground">profile</Text>
          <Text className="mt-1 text-[0.95rem] font-serif text-muted-foreground">
            how the app knows you, and how it behaves.
          </Text>
        </View>

        <View className={cn(GUTTER, 'gap-3')}>
          <View className="rounded-[var(--radius)] border border-border bg-card p-5">
            <View className="flex-row items-center gap-4">
              <View className="h-16 w-16 overflow-hidden rounded-full">
                <LinearGradient
                  colors={[tint.a, tint.b]}
                  start={{ x: 0.3, y: 0.25 }}
                  end={{ x: 1, y: 1 }}
                  style={{ flex: 1 }}
                />
              </View>
              <View className="flex-1">
                {editingName ? (
                  <Input value={name} onChangeText={setName} onBlur={saveName} autoFocus />
                ) : (
                  <Pressable
                    onPress={() => setEditingName(true)}
                    className="flex-row items-center gap-2"
                  >
                    <Text className="text-[1.3rem] font-serif-medium text-foreground">{name}</Text>
                    <Pencil size={14} color="hsl(var(--muted-foreground))" />
                  </Pressable>
                )}
                <Text className="mt-0.5 text-xs font-serif text-muted-foreground">
                  {user?.email ?? '—'}
                </Text>
              </View>
            </View>
            <View className="mt-5 flex-row border-t border-border pt-5">
              <Stat value={storyCount} label="stories" />
              <Stat value={narratorCount} label="narrators" />
              <Stat value={bookmarkCount} label="bookmarks" />
            </View>
          </View>

          <Pressable
            onPress={() => {
              setAboutDraft(aboutYou);
              setAboutEditing(true);
            }}
            className="rounded-[var(--radius)] border border-border bg-card p-5"
          >
            <View className="flex-row items-start gap-3">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-accent">
                <BookOpen size={16} color="hsl(var(--foreground))" />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[1.05rem] font-serif-medium text-foreground">
                    about you
                  </Text>
                  <Pencil size={14} color="hsl(var(--muted-foreground))" />
                </View>
                <Text
                  className="mt-1.5 text-sm font-serif text-foreground/80 leading-relaxed"
                  numberOfLines={4}
                >
                  {aboutYou.trim().length > 0
                    ? aboutYou
                    : 'tap to write a short blurb about how you like your stories told.'}
                </Text>
              </View>
            </View>
          </Pressable>

          <Pressable
            onPress={() => {
              if (silverCard) setShowCard(true);
              else router.push('/onboarding');
            }}
            className="rounded-[var(--radius)] border border-border bg-card p-5"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <View
                  className="h-10 w-8 overflow-hidden rounded-md bg-muted"
                  style={silverCard?.imageUrl ? undefined : { backgroundColor: '#1f1f1f' }}
                >
                  {silverCard?.imageUrl ? (
                    <ExpoImage
                      source={{ uri: silverCard.imageUrl }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                    />
                  ) : null}
                </View>
                <View>
                  <Text className="text-[1.05rem] font-serif-medium text-foreground">
                    your card
                  </Text>
                  <Text
                    className="mt-0.5 text-sm font-serif text-muted-foreground lowercase"
                    numberOfLines={1}
                  >
                    {silverCard
                      ? silverCard.archetypeTitle ?? 'silver archetype'
                      : 'finish onboarding to generate yours'}
                  </Text>
                </View>
              </View>
              <ChevronRight size={16} color="hsl(var(--muted-foreground))" />
            </View>
          </Pressable>

          <Pressable
            onPress={() => router.navigate('/(tabs)/narrators')}
            className="rounded-[var(--radius)] border border-border bg-card p-5"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <View className="h-9 w-9 items-center justify-center rounded-full bg-accent">
                  <UserRound size={16} color="hsl(var(--foreground))" />
                </View>
                <View>
                  <Text className="text-[1.05rem] font-serif-medium text-foreground">personas</Text>
                  <Text className="mt-0.5 text-sm font-serif text-muted-foreground">
                    tune and reuse your narrators
                  </Text>
                </View>
              </View>
              <ChevronRight size={16} color="hsl(var(--muted-foreground))" />
            </View>
          </Pressable>

          <View className="rounded-[var(--radius)] border border-border bg-card p-5">
            <Text className="text-[1.05rem] font-serif-medium text-foreground">preferences</Text>
            <View className="mt-4">
              <Pref
                icon={
                  isDark ? (
                    <Moon size={16} color="hsl(var(--foreground))" />
                  ) : (
                    <Sun size={16} color="hsl(var(--foreground))" />
                  )
                }
                title="appearance"
                description={isDark ? 'dark mode' : 'light mode'}
                control={<Switch on={isDark} onToggle={toggleTheme} />}
              />
              <Pref
                icon={<Bell size={16} color="hsl(var(--foreground))" />}
                title="notifications"
                description={notifications ? 'alerts on' : 'alerts off'}
                control={
                  <Switch on={notifications} onToggle={() => setNotifications((v) => !v)} />
                }
              />
              <Pref
                icon={<Palette size={16} color="hsl(var(--foreground))" />}
                title="artwork tint"
                description="applied to new stories without covers"
                control={
                  <View className="flex-row items-center gap-1.5">
                    {TINTS.map((t) => (
                      <Pressable
                        key={t.id}
                        onPress={async () => {
                          if (user) {
                            try {
                              await updateUserProfile(user.uid, { artworkTint: t.id } as any);
                            } catch (e) {
                              console.error('[profile] tint save failed', e);
                            }
                          }
                        }}
                        className={cn(
                          'h-5 w-5 overflow-hidden rounded-full',
                          currentTint.id === t.id && 'border-2 border-foreground'
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
                }
              />
            </View>
          </View>

          <View className="rounded-[var(--radius)] border border-border bg-card p-5">
            <Text className="text-[1.05rem] font-serif-medium text-foreground">account</Text>
            <View className="mt-4 gap-2">
              <Pressable
                onPress={handleSignOut}
                className="h-10 flex-row items-center justify-center gap-2 rounded-full border border-border active:bg-accent"
              >
                <LogOut size={14} color="hsl(var(--foreground))" />
                <Text className="text-sm font-serif-medium text-foreground">sign out</Text>
              </Pressable>
              <Pressable
                onPress={confirmDelete}
                className="h-10 flex-row items-center justify-center gap-2 rounded-full"
              >
                <Trash2 size={14} color="#ef4444" />
                <Text className="text-sm font-serif-medium text-red-400">delete account</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={aboutEditing}
        transparent
        animationType="fade"
        onRequestClose={() => setAboutEditing(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/70 px-6">
          <View className="w-full max-w-[420px] rounded-[var(--radius)] border border-border bg-card p-5">
            <View className="flex-row items-center justify-between">
              <Text className="text-[1.05rem] font-serif-medium text-foreground">about you</Text>
              <Pressable
                onPress={() => setAboutEditing(false)}
                className="h-8 w-8 items-center justify-center rounded-full"
              >
                <X size={16} color="hsl(var(--foreground))" />
              </Pressable>
            </View>
            <Text className="mt-1 text-xs font-serif text-muted-foreground">
              we use this to shape the voice of your stories.
            </Text>
            <Textarea
              value={aboutDraft}
              onChangeText={(t) => setAboutDraft(t.slice(0, 800))}
              placeholder="e.g. i like slow openings, lots of physical detail, and characters who take their time getting to the point."
              numberOfLines={7}
              className="mt-3 min-h-[180px]"
            />
            <Text className="mt-1 text-[11px] font-sans text-right text-muted-foreground">
              {aboutDraft.length}/800
            </Text>
            <View className="mt-3 flex-row gap-2">
              <Button
                variant="outline"
                size="default"
                className="flex-1"
                onPress={() => setAboutEditing(false)}
              >
                cancel
              </Button>
              <Button
                size="default"
                className="flex-1"
                loading={aboutSaving}
                onPress={async () => {
                  if (!user) {
                    setAboutEditing(false);
                    return;
                  }
                  const value = aboutDraft.trim();
                  setAboutSaving(true);
                  try {
                    await updateUserProfile(user.uid, { aboutYou: value } as any);
                    setAboutYou(value);
                    setAboutEditing(false);
                  } catch (e: any) {
                    Alert.alert('save failed', e?.message ?? 'please try again');
                  } finally {
                    setAboutSaving(false);
                  }
                }}
              >
                save
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCard}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCard(false)}
      >
        <Pressable
          onPress={() => setShowCard(false)}
          className="flex-1 items-center justify-center bg-black/80 px-6"
        >
          <Pressable className="w-full max-w-[360px] rounded-[var(--radius)] border border-border bg-card overflow-hidden">
            <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
              <View className="flex-1">
                <Text className="text-[11px] font-serif text-muted-foreground">your card</Text>
                <Text
                  className="text-base font-serif-medium text-foreground lowercase"
                  numberOfLines={1}
                >
                  {silverCard?.archetypeTitle ?? 'silver archetype'}
                </Text>
              </View>
              {Platform.OS === 'web' && silverCard?.imageUrl ? (
                <Pressable
                  onPress={downloadCardPng}
                  accessibilityLabel="save as png"
                  className="h-8 w-8 items-center justify-center rounded-full active:bg-accent"
                >
                  <Download size={16} color="hsl(var(--foreground))" />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => setShowCard(false)}
                className="h-8 w-8 items-center justify-center rounded-full"
              >
                <X size={16} color="hsl(var(--foreground))" />
              </Pressable>
            </View>
            {silverCard?.imageUrl && (
              <View className="aspect-[5/8]" style={{ backgroundColor: '#000' }}>
                <CardScene
                  imageUrl={silverCard.imageUrl}
                  aspectRatio={5 / 8}
                  onCanvasReady={(c) => {
                    cardCanvasRef.current = c as HTMLCanvasElement;
                  }}
                />
              </View>
            )}
            {(silverCard?.heroSub || silverCard?.museSub || silverCard?.shadowSub) && (
              <View className="p-5 gap-2">
                {silverCard?.heroSub && (
                  <CardLine label="hero" value={silverCard.heroSub} />
                )}
                {silverCard?.museSub && <CardLine label="muse" value={silverCard.museSub} />}
                {silverCard?.shadowSub && (
                  <CardLine label="shadow" value={silverCard.shadowSub} />
                )}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function CardLine({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline gap-3">
      <Text className="text-[11px] font-serif text-muted-foreground w-14">{label}</Text>
      <Text className="flex-1 text-sm font-serif text-foreground">{value}</Text>
    </View>
  );
}

/**
 * Build a first-draft "about you" blurb from whatever onboarding artifacts
 * are already saved to the user doc. Users are expected to edit this —
 * this is just to avoid an empty card for returning users.
 */
function deriveAboutYou(silverCard: any, profile: any): string {
  if (!silverCard && !profile?.onboardingAnswers) return '';
  const words = silverCard?.storytellingWords?.trim();
  const archetype = silverCard?.archetypeTitle?.trim();
  const hero = silverCard?.heroSub?.trim();
  const parts: string[] = [];
  if (words) parts.push(`you like stories that feel ${words}.`);
  if (archetype) parts.push(`your card is the ${archetype}.`);
  if (hero) parts.push(hero);
  const ob = profile?.onboardingAnswers as any;
  if (ob?.descriptors?.length || ob?.descriptors2?.length) {
    const descs = [
      ...(ob.descriptors ?? []),
      ...(ob.descriptors2 ?? []),
    ].slice(0, 4);
    if (descs.length > 0) {
      parts.push(`you tend to read as ${descs.join(', ')}.`);
    }
  }
  return parts.join(' ');
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-[1.4rem] font-sans font-semibold text-foreground">{value}</Text>
      <Text className="mt-0.5 text-xs font-serif text-muted-foreground">{label}</Text>
    </View>
  );
}

function Pref({
  icon,
  title,
  description,
  control,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  control: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-4 py-4 border-t border-border first:border-t-0">
      <View className="h-9 w-9 items-center justify-center rounded-full bg-accent">{icon}</View>
      <View className="flex-1">
        <Text className="text-[0.95rem] font-serif-medium text-foreground">{title}</Text>
        {description ? (
          <Text className="mt-0.5 text-xs font-serif text-muted-foreground">{description}</Text>
        ) : null}
      </View>
      {control}
    </View>
  );
}

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      className={cn('h-6 w-11 rounded-full', on ? 'bg-foreground' : 'bg-border')}
    >
      <View
        className="h-5 w-5 rounded-full bg-background"
        style={{ marginTop: 2, marginLeft: on ? 22 : 2 }}
      />
    </Pressable>
  );
}
