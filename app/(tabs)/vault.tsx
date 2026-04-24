import { useRouter } from 'expo-router';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { AlertTriangle, Loader, Pencil, Plus, Search, Trash2 } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { ProfileButton } from '@/components/profile-button';
import { Screen, TopBar } from '@/components/screen';
import { StoryCard, type CardStory } from '@/components/story-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup } from '@/components/ui/toggle-group';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useStoryQueue } from '@/contexts/StoryQueueContext';
import { cn } from '@/lib/cn';

type Filter = 'all' | 'day' | 'night';
const GUTTER = 'px-5 sm:px-8 md:px-10 lg:px-14';

export default function VaultScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { queue, removeFromQueue, retryStory } = useStoryQueue();

  const [loading, setLoading] = useState(true);
  const [stories, setStories] = useState<CardStory[]>([]);
  const [query_, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setStories([]);
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, 'stories'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: CardStory[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            title: data.title ?? 'untitled',
            durationMin: Math.max(1, Math.round((data.duration ?? 600) / 60)),
            cover: coverFor(data.coverColor ?? d.id),
            nighttime: !!data.isNighttime,
            narrator: data.narratorName,
          };
        });
        setStories(items);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [user?.uid]);

  const filtered = useMemo(() => {
    return stories.filter((s) => {
      if (filter === 'day' && s.nighttime) return false;
      if (filter === 'night' && !s.nighttime) return false;
      if (query_.trim()) {
        const q = query_.trim().toLowerCase();
        return s.title.toLowerCase().includes(q);
      }
      return true;
    });
  }, [stories, filter, query_]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const openStory = (id: string) => router.navigate({ pathname: '/player', params: { id } });

  const generatingCount = queue.filter((q) => q.status === 'generating' || q.status === 'pending').length;

  return (
    <Screen wide>
      <TopBar
        right={
          selectMode ? (
            <Pressable onPress={exitSelect} className="px-2 py-1">
              <Text className="text-xs font-serif text-muted-foreground">cancel</Text>
            </Pressable>
          ) : (
            <View className="flex-row items-center gap-1">
              <Pressable
                onPress={() => setSelectMode(true)}
                className="h-8 w-8 items-center justify-center rounded-full active:bg-accent"
              >
                <Pencil size={16} color="hsl(var(--foreground))" />
              </Pressable>
              <Pressable
                onPress={() => router.navigate('/(tabs)/create')}
                className="h-8 w-8 items-center justify-center rounded-full active:bg-accent"
              >
                <Plus size={16} color="hsl(var(--foreground))" />
              </Pressable>
              <ProfileButton />
            </View>
          )
        }
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: selectMode ? 110 : 110 }}
        showsVerticalScrollIndicator={false}
      >
        <View className={cn(GUTTER, 'pt-2 pb-5')}>
          <View className="flex-row items-end justify-between flex-wrap gap-6">
            <View className="min-w-0">
              <Text className="text-[1.9rem] font-serif-medium text-foreground">vault</Text>
              <Text className="mt-1 text-[0.95rem] font-serif text-muted-foreground">
                everything you've made and what's in the oven.
              </Text>
            </View>
          </View>

          {!selectMode && (
            <View className="mt-4 flex-row items-center gap-2">
              <View className="flex-1 relative">
                <View className="absolute left-3 top-0 bottom-0 justify-center z-10">
                  <Search size={14} color="hsl(var(--muted-foreground))" />
                </View>
                <Input
                  value={query_}
                  onChangeText={setQuery}
                  placeholder="search your vault"
                  className="h-10 pl-9 rounded-full"
                />
              </View>
              <ToggleGroup<Filter>
                value={filter}
                onValueChange={setFilter}
                fullWidth={false}
                options={[
                  { value: 'all', label: 'all' },
                  { value: 'day', label: 'day' },
                  { value: 'night', label: 'night' },
                ]}
              />
            </View>
          )}
        </View>

        {/* queue */}
        {queue.length > 0 && !selectMode && (
          <View className={cn(GUTTER, 'mb-8')}>
            <View className="flex-row items-baseline justify-between mb-3">
              <Text className="text-[1.05rem] font-serif-medium text-foreground">in progress</Text>
              <Text className="text-[11px] font-sans text-muted-foreground">
                {generatingCount} generating
              </Text>
            </View>
            <View className="gap-2">
              {queue.map((item) => (
                <QueueRow
                  key={item.id}
                  title={item.recipeData?.setting || item.recipeData?.prompt?.slice(0, 40) || 'new story'}
                  character={item.recipeData?.character || item.recipeData?.narratorData?.name}
                  progressPct={Math.round(item.progress * 100)}
                  status={item.status}
                  error={item.error}
                  onRetry={() => retryStory(item.id)}
                  onDismiss={() => removeFromQueue(item.id)}
                />
              ))}
            </View>
          </View>
        )}

        {loading ? (
          <View className="py-10 items-center">
            <ActivityIndicator color="hsl(var(--foreground))" />
          </View>
        ) : (
          <View className={GUTTER}>
            {!selectMode && (
              <View className="flex-row items-baseline justify-between mb-3">
                <Text className="text-[1.05rem] font-serif-medium text-foreground">
                  {query_.trim() ? 'results' : 'your stories'}
                </Text>
                <Text className="text-[11px] font-sans text-muted-foreground">{filtered.length}</Text>
              </View>
            )}
            {filtered.length === 0 ? (
              <View className="py-14 items-center">
                <Text className="text-sm font-serif text-muted-foreground">
                  {query_.trim()
                    ? `nothing matches "${query_}"`
                    : 'no stories yet — make one from the create tab.'}
                </Text>
              </View>
            ) : (
              <View className="flex-row flex-wrap -mx-1">
                {filtered.map((s) => (
                  <View key={s.id} className="w-1/2 sm:w-1/3 md:w-1/4 lg:w-1/5 px-1">
                    <StoryCard
                      story={s}
                      selected={selected.has(s.id)}
                      selectMode={selectMode}
                      onPress={() => (selectMode ? toggle(s.id) : openStory(s.id))}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {selectMode && (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: 12,
            zIndex: 20,
          }}
        >
          <View
            className="self-center flex-row items-center rounded-full border border-border bg-card px-5 py-2 gap-2"
            style={{ width: '100%', maxWidth: 520 }}
          >
            <Text className="flex-1 text-sm font-serif text-foreground">
              {selected.size === 0 ? 'select stories' : `${selected.size} selected`}
            </Text>
            <Button variant="ghost" size="sm" disabled={selected.size === 0}>
              group
            </Button>
            <Button
              size="sm"
              disabled={selected.size === 0}
              className={selected.size > 0 ? 'bg-red-500' : ''}
            >
              <Trash2 size={14} color="white" />
              delete
            </Button>
          </View>
        </View>
      )}
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

function QueueRow({
  title,
  character,
  progressPct,
  status,
  error,
  onRetry,
  onDismiss,
}: {
  title: string;
  character?: string;
  progressPct: number;
  status: 'pending' | 'generating' | 'complete' | 'error';
  error?: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const isErr = status === 'error';
  return (
    <View
      className={cn(
        'flex-row items-center gap-3 rounded-[var(--radius)] border bg-card px-4 py-3.5',
        isErr ? 'border-red-500/40' : 'border-border'
      )}
    >
      <View
        className={cn(
          'h-9 w-9 items-center justify-center rounded-full shrink-0',
          isErr ? 'bg-red-500/15' : 'bg-accent'
        )}
      >
        {isErr ? <AlertTriangle size={14} color="#ef4444" /> : <Loader size={14} color="hsl(var(--foreground))" />}
      </View>
      <View className="flex-1">
        <Text className="text-[0.95rem] font-serif-medium text-foreground" numberOfLines={1}>
          {title}
        </Text>
        {isErr ? (
          <Text className="mt-0.5 text-xs text-red-400/90" numberOfLines={1}>
            {error ?? 'something went wrong'}
          </Text>
        ) : (
          <>
            <View className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
              <View
                className="h-full bg-foreground/80"
                style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
              />
            </View>
            <View className="mt-1 flex-row items-center justify-between">
              <Text className="text-[11px] font-serif text-muted-foreground" numberOfLines={1}>
                {character ?? ''}
              </Text>
              <Text className="text-[11px] font-sans text-muted-foreground">{progressPct}%</Text>
            </View>
          </>
        )}
      </View>
      <Pressable onPress={isErr ? onRetry : onDismiss} className="px-2 py-1">
        <Text className="text-xs font-serif text-muted-foreground">{isErr ? 'retry' : 'dismiss'}</Text>
      </Pressable>
    </View>
  );
}

function coverFor(seed: string): { a: string; b: string } {
  const palettes: [string, string][] = [
    ['#c4b5a0', '#6a5238'],
    ['#9ea8cd', '#2e3964'],
    ['#b4a2c3', '#4a3766'],
    ['#b2b9c6', '#424c62'],
    ['#d5cfb1', '#7a6f3c'],
    ['#d8c0a3', '#8a5c36'],
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
