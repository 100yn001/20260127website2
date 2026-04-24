import { useRouter } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import { Search } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { ProfileButton } from '@/components/profile-button';
import { Screen, TopBar } from '@/components/screen';
import { ContinueCard, ShelfCard, type CardStory } from '@/components/story-card';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/cn';

type Row = { name: string; stories: CardStory[] };

const GUTTER = 'px-5 sm:px-8 md:px-10 lg:px-14';

export default function LibraryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [keepListening, setKeepListening] = useState<CardStory[]>([]);
  const [collections, setCollections] = useState<Row[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'publicStories'));
        const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        const all: (CardStory & { collection?: string | null })[] = docs.map((d) => ({
          id: d.id,
          title: d.title ?? 'untitled',
          narrator: d.narratorName,
          durationMin: Math.max(1, Math.round((d.duration ?? 600) / 60)),
          cover: coverFor(d.coverColor ?? d.id),
          nighttime: !!d.isNighttime,
          collection: (typeof d.collection === 'string' && d.collection.trim()) || null,
        }));

        const grouped: Record<string, CardStory[]> = {};
        const rest: CardStory[] = [];
        for (const s of all) {
          const key = s.collection;
          if (key) (grouped[key] ??= []).push(s);
          else rest.push(s);
        }
        const rows: Row[] = Object.entries(grouped).map(([name, stories]) => ({ name, stories }));
        if (rest.length) rows.push({ name: 'explore', stories: rest });

        if (!cancelled) {
          setCollections(rows);
          setKeepListening([]);
        }
      } catch (e) {
        console.error('[library] failed to load', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const openStory = (id: string) => router.navigate({ pathname: '/player', params: { id } });

  return (
    <Screen wide>
      <TopBar
        right={
          <View className="flex-row items-center gap-1">
            <Pressable className="h-8 w-8 items-center justify-center rounded-full active:bg-accent">
              <Search size={16} color="hsl(var(--foreground))" />
            </Pressable>
            <ProfileButton />
          </View>
        }
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
      >
        <View className={cn(GUTTER, 'pt-2 pb-6')}>
          <Text className="text-[1.9rem] font-serif-medium text-foreground">library</Text>
          <Text className="mt-1 text-[0.95rem] font-serif text-muted-foreground">
            curated stories and what's still unfinished.
          </Text>
        </View>

        {loading ? (
          <View className="py-10 items-center">
            <ActivityIndicator color="hsl(var(--foreground))" />
          </View>
        ) : (
          <>
            {keepListening.length > 0 && (
              <Shelf title="keep listening">
                {keepListening.map((s) => (
                  <ContinueCard key={s.id} story={s} onPress={() => openStory(s.id)} />
                ))}
              </Shelf>
            )}
            {collections.map((row) => (
              <Shelf key={row.name} title={row.name}>
                {row.stories.map((s) => (
                  <ShelfCard key={s.id} story={s} onPress={() => openStory(s.id)} />
                ))}
              </Shelf>
            ))}
            {collections.length === 0 && !loading && (
              <View className={cn(GUTTER, 'py-10')}>
                <Text className="text-sm font-serif text-muted-foreground">
                  no stories yet — make one from the create tab.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

function Shelf({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-8">
      <View className={cn(GUTTER, 'flex-row items-baseline justify-between mb-3')}>
        <Text className="text-[1.05rem] font-serif-medium text-foreground">{title}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className={cn(GUTTER, 'flex-row items-start gap-3')}>{children}</View>
      </ScrollView>
    </View>
  );
}

function coverFor(seed: string): { a: string; b: string } {
  const palettes: [string, string][] = [
    ['#d6c2a8', '#8a6c47'],
    ['#a6b3d5', '#3b4a7a'],
    ['#cddacb', '#5c7a63'],
    ['#e5d6b8', '#8a8055'],
    ['#e8d2c1', '#a37257'],
    ['#d7e0e8', '#6d8aa0'],
    ['#c4a8d8', '#593c77'],
  ];
  const idx = Math.abs(hashStr(seed)) % palettes.length;
  const [a, b] = palettes[idx];
  return { a, b };
}

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}
