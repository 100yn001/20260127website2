import AsyncStorage from '@react-native-async-storage/async-storage';
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
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { Screen, TopBar } from '@/components/screen';
import CardScene from '@/components/silver-card/CardScene';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { TINTS, useArtworkTint } from '@/hooks/useArtworkTint';
import { cn } from '@/lib/cn';
import {
  hasBakedTextures,
  isDurableCardImageUrl,
  restoreSilverCardImage,
} from '@/services/silver-card-image';
import {
  DEFAULT_ENTITLEMENTS,
  FREE_STORY_LIMIT,
  MAX_CUSTOM_VOICES,
  MONTHLY_PRICE_LABEL,
  MONTHLY_STORY_LIMIT,
  freeStoriesRemaining,
  isSubscribed,
  openBillingPortal,
  startSubscriptionCheckout,
  subscribeToEntitlements,
  subscriptionStoriesRemaining,
  type Entitlements,
} from '@/services/entitlements-service';
import { getUserProfile, updateUserProfile } from '@/services/user-service';
import { subscribeToCustomVoices } from '@/services/voice-service';

const GUTTER = 'px-5 sm:px-8 md:px-10 lg:px-14 xl:px-20';

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
  const [cardRestoring, setCardRestoring] = useState(false);
  const [cardPrepFailed, setCardPrepFailed] = useState(false);
  const cardCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [deletePrompt, setDeletePrompt] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [ent, setEnt] = useState<Entitlements>(DEFAULT_ENTITLEMENTS);
  const [voiceCount, setVoiceCount] = useState(0);
  const [billingBusy, setBillingBusy] = useState(false);
  const entIsSubscribed = isSubscribed(ent);
  const freeLeft = freeStoriesRemaining(ent);
  const subStoriesLeft = subscriptionStoriesRemaining(ent);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToEntitlements(user.uid, setEnt);
    const unsubVoices = subscribeToCustomVoices((voices) => setVoiceCount(voices.length));
    return () => {
      unsub();
      unsubVoices();
    };
  }, [user?.uid]);

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
        setBookmarkCount(profile?.bookmarkedStories?.length ?? 0);
        const sc = (profile as any)?.silverCard;
        if (sc) {
          setSilverCard(sc);
          // Older accounts stored the expiring Replicate URL and/or predate
          // the baked silver textures — bring the card up to date in the
          // background. `cardRestoring` surfaces the wait in the UI.
          prepareCard(sc);
        }
        const saved = (profile as any)?.aboutYou;
        if (typeof saved === 'string' && saved.trim().length > 0) {
          setAboutYou(saved);
        } else {
          // Seed from the silver card so the user sees something useful on first visit.
          setAboutYou(deriveAboutYou(sc, profile));
        }
      } catch (e) {
        console.warn('[profile] profile load failed', e);
      }
    })();
  }, [user?.uid]);

  // Bring the card fully up to date — regenerate expired artwork, bake and
  // persist the silver textures — and reflect progress in the UI. Safe to
  // call repeatedly; the service dedupes concurrent runs. Once the textures
  // exist this is a no-op forever.
  const prepareCard = (sc: any) => {
    if (!user || !sc) return;
    const needsPrep =
      !isDurableCardImageUrl(sc.imageUrl) ||
      (Platform.OS === 'web' && !hasBakedTextures(sc));
    if (!needsPrep) return;
    setCardPrepFailed(false);
    setCardRestoring(true);
    restoreSilverCardImage(user.uid, sc)
      .then((fixed) => {
        if (fixed) {
          setSilverCard(fixed);
          if (Platform.OS === 'web' && !hasBakedTextures(fixed)) {
            setCardPrepFailed(true);
          }
        }
      })
      .catch((e) => {
        console.warn('[profile] card prep failed', e);
        setCardPrepFailed(true);
      })
      .finally(() => setCardRestoring(false));
  };

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

  const runDelete = async (password?: string) => {
    // deleteAccount purges Firestore data then removes the auth user. A stale
    // session throws requires-recent-login → prompt for the password and retry.
    try {
      if (deleteAccount) await deleteAccount(password);
      setDeletePrompt(false);
      router.replace('/onboarding');
    } catch (e: any) {
      const code = e?.message ?? '';
      if (code.includes('requires-recent-login') || code.includes('user-token-expired')) {
        setDeletePrompt(true); // ask for password, then retry via handleConfirmDelete
        return;
      }
      if (code.includes('wrong-password') || code.includes('invalid-credential')) {
        setDeleteError('incorrect password');
        return;
      }
      setDeleteError(code || 'could not delete account');
    }
  };

  const confirmDelete = () => {
    setDeleteError(null);
    if (Platform.OS === 'web') {
      // Alert with buttons doesn't return a choice on web — open the modal,
      // which also collects the password for re-auth.
      setDeletePrompt(true);
      return;
    }
    Alert.alert('delete account?', 'this is permanent.', [
      { text: 'cancel', style: 'cancel' },
      { text: 'delete', style: 'destructive', onPress: () => runDelete() },
    ]);
  };

  const handleConfirmDelete = async () => {
    setDeleteError(null);
    setDeleting(true);
    await runDelete(deletePassword || undefined);
    setDeleting(false);
  };

  const tint = currentTint;
  const isDark = theme === 'dark';

  return (
    <Screen wide>
      <TopBar />
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

          <View className="rounded-[var(--radius)] border border-border bg-card p-5">
            <View className="flex-row items-center gap-3">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-accent">
                <BookOpen size={16} color="hsl(var(--foreground))" />
              </View>
              <View className="flex-1">
                <Text className="text-[1.05rem] font-serif-medium text-foreground">
                  story budget
                </Text>
                <Text className="mt-0.5 text-sm font-serif text-muted-foreground">
                  {entIsSubscribed
                    ? `${subStoriesLeft} of ${MONTHLY_STORY_LIMIT} stories left this month${ent.currentPeriodEnd ? ` · renews ${ent.currentPeriodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`
                    : `${freeLeft} of ${FREE_STORY_LIMIT} free stories left`}
                </Text>
                <Text className="mt-0.5 text-sm font-serif text-muted-foreground">
                  custom voices: {voiceCount}/{MAX_CUSTOM_VOICES}
                </Text>
              </View>
            </View>
            <Button
              variant={entIsSubscribed ? 'outline' : 'default'}
              className="mt-4 w-full"
              loading={billingBusy}
              onPress={async () => {
                setBillingBusy(true);
                try {
                  if (entIsSubscribed) await openBillingPortal();
                  else await startSubscriptionCheckout(user?.email ?? undefined);
                } catch (e: any) {
                  if (e?.code === 'functions/already-exists') {
                    // Server refused a duplicate subscription and re-synced
                    // entitlements — the card flips to "manage" on its own.
                  } else {
                    Alert.alert('billing error', e?.message ?? 'please try again');
                  }
                } finally {
                  setBillingBusy(false);
                }
              }}
            >
              {entIsSubscribed ? 'manage subscription' : `subscribe · ${MONTHLY_PRICE_LABEL} for ${MONTHLY_STORY_LIMIT} stories`}
            </Button>
          </View>

          <Pressable
            onPress={() => {
              if (silverCard) setShowCard(true);
              else router.push('/onboarding');
            }}
            className="rounded-[var(--radius)] border border-border bg-card p-5"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <View className="h-9 w-9 items-center justify-center rounded-full bg-accent">
                  <Sparkles size={16} color="hsl(var(--foreground))" />
                </View>
                <View>
                  <Text className="text-[1.05rem] font-serif-medium text-foreground">
                    view card
                  </Text>
                  <Text
                    className="mt-0.5 text-sm font-serif text-muted-foreground lowercase"
                    numberOfLines={1}
                  >
                    {silverCard
                      ? cardRestoring
                        ? 'summoning your card…'
                        : silverCard.archetypeTitle ?? 'silver archetype'
                      : 'finish onboarding to generate yours'}
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
        {/* Bare, full-bleed viewer: black screen, the card, nothing else.
            Tap anywhere outside the card (or the ×) to leave. */}
        <View className="flex-1 bg-black">
          <Pressable onPress={() => setShowCard(false)} className="absolute inset-0" />
          <View pointerEvents="box-none" className="flex-1 items-center justify-center px-8">
            <View style={{ width: '100%', maxWidth: 520, aspectRatio: 5 / 8 }}>
              {(Platform.OS === 'web'
                ? hasBakedTextures(silverCard)
                : !!(silverCard?.colorTexUrl || isDurableCardImageUrl(silverCard?.imageUrl))) ? (
                <CardScene
                  textures={
                    hasBakedTextures(silverCard)
                      ? { colorUrl: silverCard.colorTexUrl, bumpUrl: silverCard.bumpTexUrl }
                      : undefined
                  }
                  imageUrl={Platform.OS === 'web' ? undefined : silverCard?.imageUrl}
                  aspectRatio={5 / 8}
                  onCanvasReady={(c) => {
                    cardCanvasRef.current = c as HTMLCanvasElement;
                  }}
                />
              ) : (
                <View className="flex-1 items-center justify-center" pointerEvents="box-none">
                  {cardRestoring ? (
                    <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
                  ) : null}
                  <Text className="mt-4 text-sm font-serif text-white/60">
                    {cardRestoring
                      ? isDurableCardImageUrl(silverCard?.imageUrl)
                        ? 'polishing the silver…'
                        : 'summoning your card…'
                      : cardPrepFailed
                        ? "the silver wouldn't take"
                        : 'still being painted — check back soon'}
                  </Text>
                  {cardPrepFailed && !cardRestoring ? (
                    <Pressable onPress={() => prepareCard(silverCard)} className="mt-4">
                      <Text className="text-sm font-serif text-white/90">try again →</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
            </View>
          </View>
          <View className="absolute top-12 right-5 flex-row items-center gap-2">
            {Platform.OS === 'web' && hasBakedTextures(silverCard) ? (
              <Pressable
                onPress={downloadCardPng}
                accessibilityLabel="save as png"
                className="h-10 w-10 items-center justify-center rounded-full"
              >
                <Download size={18} color="rgba(255,255,255,0.7)" />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setShowCard(false)}
              accessibilityLabel="close"
              className="h-10 w-10 items-center justify-center rounded-full"
            >
              <X size={20} color="rgba(255,255,255,0.8)" />
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={deletePrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setDeletePrompt(false)}
      >
        <View className="flex-1 bg-black/50 items-center justify-center px-6">
          <View className="w-full max-w-[380px] rounded-[var(--radius)] border border-border bg-card p-6 gap-4">
            <Text className="text-lg font-serif-medium text-foreground">delete account?</Text>
            <Text className="text-sm font-serif text-muted-foreground">
              this permanently deletes your account and all your stories, narrators, and voices.
              enter your password to confirm.
            </Text>
            <Input
              value={deletePassword}
              onChangeText={(t) => {
                setDeletePassword(t);
                setDeleteError(null);
              }}
              placeholder="password"
              secureTextEntry
              autoCapitalize="none"
            />
            {deleteError && (
              <Text className="text-sm font-serif text-destructive">{deleteError}</Text>
            )}
            <View className="flex-row gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onPress={() => {
                  setDeletePrompt(false);
                  setDeletePassword('');
                  setDeleteError(null);
                }}
              >
                cancel
              </Button>
              <Button
                className="flex-1 bg-destructive"
                textClassName="text-destructive-foreground"
                loading={deleting}
                disabled={!deletePassword}
                onPress={handleConfirmDelete}
              >
                delete
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
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
  // archetypeTitle already carries its article ("The Regent") — no extra
  // "the". The raw subtype token ("ruler") reads as a typo, so skip it.
  if (archetype) parts.push(`your card is ${archetype}.`);
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
