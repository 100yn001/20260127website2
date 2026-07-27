import { useRouter } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import { Search, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { ProfileButton } from '@/components/profile-button';
import { Screen, TopBar } from '@/components/screen';
import { ContinueCard, ShelfCard, type CardStory } from '@/components/story-card';
import { Input } from '@/components/ui/input';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/cn';
import { coverFromColor } from '@/lib/cover';

type Row = { name: string; stories: CardStory[] };

const GUTTER = 'px-5 sm:px-8 md:px-10 lg:px-14 xl:px-20';

export default function LibraryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [keepListening, setKeepListening] = useState<CardStory[]>([]);
  const [collections, setCollections] = useState<Row[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [queryText, setQueryText] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'publicStories'));
        const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        const all: (CardStory & { collection?: string | null })[] = docs.map((d) => ({
          id: d.id,
          title: cleanTitle(d.title),
          narrator: d.narratorName,
          durationMin: parseDurationMin(d.duration),
          // Each public story shows its own published color; falls back to a
          // deterministic gradient keyed by story id when none is saved, so
          // the color is stable across sessions even without a coverColor.
          cover: coverFromColor(d.coverColor, d.id),
          nighttime: !!d.isNighttime,
          tags: Array.isArray(d.tags)
            ? d.tags.filter((t: unknown): t is string => typeof t === 'string' && !!t.trim())
            : undefined,
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

  const trimmedQuery = queryText.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!trimmedQuery) return collections;
    return collections
      .map((row) => ({
        ...row,
        stories: row.stories.filter(
          (s) =>
            s.title.toLowerCase().includes(trimmedQuery) ||
            (s.narrator && s.narrator.toLowerCase().includes(trimmedQuery)) ||
            (s.tags && s.tags.some((t) => t.toLowerCase().includes(trimmedQuery)))
        ),
      }))
      .filter((row) => row.stories.length > 0);
  }, [collections, trimmedQuery]);
  const matchCount = useMemo(
    () => filtered.reduce((sum, r) => sum + r.stories.length, 0),
    [filtered]
  );

  return (
    <Screen wide>
      <TopBar
        right={
          <View className="flex-row items-center gap-1">
            <Pressable
              onPress={() => {
                setSearchOpen((prev) => {
                  if (prev) setQueryText('');
                  return !prev;
                });
              }}
              accessibilityLabel={searchOpen ? 'close search' : 'open search'}
              className="h-8 w-8 items-center justify-center rounded-full active:bg-accent"
            >
              {searchOpen ? (
                <X size={16} color="hsl(var(--foreground))" />
              ) : (
                <Search size={16} color="hsl(var(--foreground))" />
              )}
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
            stories we think you'll like
          </Text>
          {searchOpen && (
            <View className="mt-4 relative">
              <View className="absolute left-3 top-0 bottom-0 justify-center z-10">
                <Search size={14} color="hsl(var(--muted-foreground))" />
              </View>
              <Input
                value={queryText}
                onChangeText={setQueryText}
                placeholder="search by title, narrator, or tag"
                autoCapitalize="none"
                autoFocus
                className="h-10 pl-9 rounded-full"
              />
            </View>
          )}
        </View>

        {loading ? (
          <View className="py-10 items-center">
            <ActivityIndicator color="hsl(var(--foreground))" />
          </View>
        ) : trimmedQuery ? (
          matchCount === 0 ? (
            <View className={cn(GUTTER, 'py-10')}>
              <Text className="text-sm font-serif text-muted-foreground">
                no stories match &quot;{queryText.trim()}&quot;
              </Text>
            </View>
          ) : (
            <>
              <View className={cn(GUTTER, 'pb-3')}>
                <Text className="text-[11px] font-sans text-muted-foreground">
                  {matchCount} {matchCount === 1 ? 'result' : 'results'}
                </Text>
              </View>
              {filtered.map((row) => (
                <Shelf key={row.name} title={row.name}>
                  {row.stories.map((s) => (
                    <ShelfCard key={s.id} story={s} onPress={() => openStory(s.id)} />
                  ))}
                </Shelf>
              ))}
            </>
          )
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
            {collections.length === 0 && (
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

// Strip surrounding straight or curly quotes that some published stories
// were saved with, and fall back to 'untitled' when blank.
function cleanTitle(raw: unknown): string {
  if (typeof raw !== 'string') return 'untitled';
  const trimmed = raw.trim().replace(/^["'‘’“”]+|["'‘’“”]+$/g, '').trim();
  return trimmed || 'untitled';
}

// Stories are saved with `duration` as either the bucket string
// '5min' / '10min' / '15min' or a legacy numeric (seconds) value.
function parseDurationMin(raw: unknown): number {
  if (typeof raw === 'string') {
    const m = raw.match(/(\d+)/);
    if (m) return Math.max(1, parseInt(m[1], 10));
  }
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw > 60 ? Math.max(1, Math.round(raw / 60)) : Math.max(1, Math.round(raw));
  }
  return 10;
}

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
