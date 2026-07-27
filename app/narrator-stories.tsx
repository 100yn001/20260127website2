import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { Screen, TopBar } from '@/components/screen';
import { StoryCard, type CardStory } from '@/components/story-card';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';

export default function NarratorStoriesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ narratorId?: string; narratorName?: string }>();
  const [stories, setStories] = useState<CardStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !params.narratorId) {
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, 'stories'),
      where('userId', '==', user.uid),
      where('narratorId', '==', params.narratorId),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setStories(
          snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              title: data.title ?? 'untitled',
              durationMin: Math.max(1, Math.round((data.duration ?? 600) / 60)),
              cover: { a: '#c4b5a0', b: '#6a5238' },
              nighttime: !!data.isNighttime,
            };
          })
        );
        setLoading(false);
      },
      (err) => {
        // Most likely a missing composite index (failed-precondition) — surface
        // it instead of silently rendering an empty "no stories yet" state.
        console.warn('[narrator-stories] query failed', err?.code, err?.message);
        setLoadError(
          err?.code === 'failed-precondition'
            ? "couldn't load these stories (index building) — try again shortly"
            : "couldn't load these stories"
        );
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user?.uid, params.narratorId]);

  return (
    <Screen wide>
      <TopBar onBack={() => router.back()} />
      <View className="px-6 pt-2 pb-5">
        <Text className="text-[1.65rem] font-serif-medium text-foreground">
          {params.narratorName ?? 'narrator'}'s stories
        </Text>
        <Text className="mt-1 text-sm font-serif text-muted-foreground">
          every story told by this narrator
        </Text>
      </View>
      {loading ? (
        <View className="py-10 items-center">
          <ActivityIndicator color="hsl(var(--foreground))" />
        </View>
      ) : loadError ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm font-serif text-muted-foreground text-center">
            {loadError}
          </Text>
        </View>
      ) : stories.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm font-serif text-muted-foreground text-center">
            no stories yet from this narrator.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}>
          <View className="flex-row flex-wrap -mx-1">
            {stories.map((s) => (
              <View key={s.id} className="w-1/2 sm:w-1/3 md:w-1/4 lg:w-1/5 px-1">
                <StoryCard
                  story={s}
                  onPress={() => router.push({ pathname: '/player', params: { id: s.id } })}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}
