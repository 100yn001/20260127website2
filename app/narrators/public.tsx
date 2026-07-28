import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Pause, Play, Plus, Search } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { CoverRelief } from '@/components/cover-relief';
import { Screen, TopBar } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { db, functions } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/cn';
import { clonePublicNarratorToUser } from '@/services/public-narrator-service';

const GUTTER = 'px-5 sm:px-8 md:px-10 lg:px-14 xl:px-20';

type PublicNarrator = {
  id: string;
  name: string;
  gender?: string;
  relationship?: string;
  color?: string;
  username?: string;
  usernameLowercase?: string;
  storyCount?: number;
  accent?: string;
  raw: any;
};

export default function PublicNarratorsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [narrators, setNarrators] = useState<PublicNarrator[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [userName, setUserName] = useState('friend');
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('userName').then((v) => v && setUserName(v.split(' ')[0]));
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const playGreeting = async (n: PublicNarrator) => {
    const voiceId = (n.raw?.voiceId as string) || '';
    if (!voiceId) {
      Alert.alert('preview unavailable', 'this narrator has no voice yet');
      return;
    }
    try {
      // Toggle off if same one is playing
      if (soundRef.current) {
        await soundRef.current.stopAsync().catch(() => {});
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      if (playingId === n.id) { setPlayingId(null); return; }

      setPlayingId(n.id);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      // Trailing ellipsis gives ElevenLabs enough silence after the greeting
      // that the final syllable doesn't get clipped on playback. TTS runs
      // server-side (previewVoiceTts callable) — no key in the client.
      const preview = httpsCallable<{ voiceId: string; text: string }, { audioBase64: string }>(
        functions,
        'previewVoiceTts',
      );
      const { audioBase64 } = (await preview({ voiceId, text: `hello, ${userName}…` })).data;
      const dataUri = `data:audio/mpeg;base64,${audioBase64}`;
      const { sound } = await Audio.Sound.createAsync(
        { uri: dataUri },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded && status.didJustFinish) setPlayingId(null);
        },
      );
      soundRef.current = sound;
    } catch (err) {
      console.error('[public-narrators] greeting failed', err);
      setPlayingId(null);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'publicNarrators'));
        setNarrators(
          snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              name: data.name ?? 'unnamed',
              gender: data.gender,
              relationship: data.relationship,
              color: data.color,
              username: data.username,
              usernameLowercase: data.usernameLowercase,
              storyCount: data.storyCount ?? 0,
              accent: data.accent,
              raw: data,
            };
          })
        );
      } catch (e) {
        console.error('[public-narrators] load failed', e);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return narrators;
    return narrators.filter(
      (n) =>
        n.username?.toLowerCase().includes(term) ||
        n.usernameLowercase?.includes(term) ||
        n.name.toLowerCase().includes(term)
    );
  }, [q, narrators]);

  const saveToLibrary = async (n: PublicNarrator) => {
    if (!user) {
      Alert.alert('sign in required', 'please sign in to save narrators');
      return;
    }
    setAdding(n.id);
    try {
      await clonePublicNarratorToUser({ id: n.id, ...n.raw } as any, user.uid);
      router.replace('/(tabs)/narrators');
    } catch (e: any) {
      Alert.alert('save failed', e?.message ?? 'please try again');
    } finally {
      setAdding(null);
    }
  };

  return (
    <Screen wide>
      <TopBar onBack={() => router.back()} />
      <View className={cn(GUTTER, 'pt-2 pb-4')}>
        <Text className="text-[1.9rem] font-serif-medium text-foreground mb-1">
          public narrators
        </Text>
        <Text className="mt-1 text-[0.95rem] font-serif text-muted-foreground">
          discover personas shared by the community.
        </Text>

        <View className="mt-4 relative">
          <View className="absolute left-3 top-0 bottom-0 justify-center z-10">
            <Search size={14} color="hsl(var(--muted-foreground))" />
          </View>
          <Input
            value={q}
            onChangeText={setQ}
            placeholder="search by username or name"
            autoCapitalize="none"
            className="h-10 pl-9 rounded-full"
          />
        </View>
      </View>

      {loading ? (
        <View className="py-10 items-center">
          <ActivityIndicator color="hsl(var(--foreground))" />
        </View>
      ) : loadError ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm font-serif text-muted-foreground text-center">
            couldn&apos;t load public narrators. check your connection and try again.
          </Text>
        </View>
      ) : filtered.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm font-serif text-muted-foreground text-center">
            {q.trim()
              ? `no matches for "${q}"`
              : 'no public narrators yet — check back soon.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
          <View className={cn(GUTTER, 'flex-row flex-wrap -mx-1.5')}>
            {filtered.map((n) => {
              const cover = narratorCover(n.color ?? n.id);
              return (
                <View key={n.id} className="w-1/3 px-1.5 mb-3">
                  <View className="rounded-[var(--radius)] border border-border bg-card p-5">
                    <View className="flex-row items-start gap-4">
                      <Pressable
                        onPress={() => playGreeting(n)}
                        accessibilityLabel="hear a hello from this narrator"
                        className="h-16 w-16 shrink-0 overflow-hidden rounded-full relative"
                      >
                        <LinearGradient
                          colors={[cover.a, cover.b]}
                          start={{ x: 0.3, y: 0.25 }}
                          end={{ x: 1, y: 1 }}
                          style={{ flex: 1 }}
                        />
                        <CoverRelief cover={cover} seed={n.id} />
                        <View className="absolute inset-0 items-center justify-center bg-black/25">
                          {playingId === n.id ? (
                            <Pause size={18} color="#fff" fill="#fff" />
                          ) : (
                            <Play size={18} color="#fff" fill="#fff" />
                          )}
                        </View>
                      </Pressable>
                      <View className="flex-1 min-w-0">
                        <View className="flex-row items-center gap-2 flex-wrap">
                          <Text className="text-[1.1rem] font-serif-medium text-foreground lowercase">
                            {n.name}
                          </Text>
                          {n.username && (
                            <Text className="text-xs font-serif text-muted-foreground">
                              @{n.username.toLowerCase()}
                            </Text>
                          )}
                        </View>
                        <Text className="mt-0.5 text-xs font-serif text-muted-foreground">
                          {(n.gender ?? '').toLowerCase()}
                          {n.accent ? <>  ·  {n.accent.toLowerCase()}</> : null}
                        </Text>
                        {n.relationship && (
                          <Text
                            className="mt-1.5 text-sm font-serif text-muted-foreground leading-relaxed lowercase"
                            numberOfLines={2}
                          >
                            {n.relationship}
                          </Text>
                        )}
                        {typeof n.storyCount === 'number' && n.storyCount > 0 && (
                          <Text className="mt-2 text-[11px] font-sans text-muted-foreground">
                            {n.storyCount} {n.storyCount === 1 ? 'story' : 'stories'}
                          </Text>
                        )}
                      </View>
                    </View>
                    <Button
                      size="sm"
                      className="mt-4 w-full"
                      loading={adding === n.id}
                      onPress={() => saveToLibrary(n)}
                    >
                      <Plus size={14} color="hsl(var(--primary-foreground))" />
                      save to my library
                    </Button>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

function narratorCover(seed: string): { a: string; b: string } {
  // If seed is already a hex color, derive a darker variant; else hash-pick.
  if (/^#?[0-9a-f]{6}$/i.test(seed.replace('#', ''))) {
    const hex = seed.startsWith('#') ? seed : `#${seed}`;
    return { a: lighten(hex, 0.35), b: hex };
  }
  const palettes: [string, string][] = [
    ['#f4c67a', '#d98b5f'],
    ['#c2d7ef', '#6a8fb8'],
    ['#e5d1e8', '#a57aa5'],
    ['#cfe2cd', '#5f8d66'],
    ['#e6cba3', '#8a5b2f'],
    ['#e4c0cd', '#93547c'],
  ];
  const idx = Math.abs(hashStr(seed)) % palettes.length;
  const [a, b] = palettes[idx];
  return { a, b };
}

function lighten(hex: string, pct: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) + 255 * pct));
  const g = Math.min(255, Math.round(((n >> 8) & 0xff) + 255 * pct));
  const b = Math.min(255, Math.round((n & 0xff) + 255 * pct));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}
