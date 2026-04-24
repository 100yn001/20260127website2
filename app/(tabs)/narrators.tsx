import { useRouter } from 'expo-router';
import { collection, onSnapshot } from 'firebase/firestore';
import { Globe, Plus } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { NarratorAvatar } from '@/components/narrator-avatar';
import { ProfileButton } from '@/components/profile-button';
import { Screen, TopBar } from '@/components/screen';
import { Badge } from '@/components/ui/badge';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/cn';

const GUTTER = 'px-5 sm:px-8 md:px-10 lg:px-14';

type Narrator = {
  id: string;
  name: string;
  gender: string;
  relationship?: string;
  colorA: string;
  colorB: string;
  isPublic?: boolean;
};

export default function NarratorsTab() {
  const router = useRouter();
  const { user } = useAuth();
  const [narrators, setNarrators] = useState<Narrator[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!user) {
      setNarrators([]);
      setLoading(false);
      return;
    }
    const ref = collection(db, 'users', user.uid, 'narrators');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const items: Narrator[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: data.name ?? 'unnamed',
            gender: data.gender ?? 'custom',
            relationship: data.relationship,
            colorA: pickColor(data.color ?? d.id).a,
            colorB: pickColor(data.color ?? d.id).b,
            isPublic: data.isPublic,
          };
        });
        setNarrators(items);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [user?.uid]);

  const selected = narrators[Math.min(active, narrators.length - 1)];

  return (
    <Screen wide>
      <TopBar
        right={
          <View className="flex-row items-center gap-1">
            <Pressable
              onPress={() => router.navigate('/narrators/public')}
              className="h-8 px-3 flex-row items-center gap-1.5 rounded-full border border-border active:bg-accent"
            >
              <Globe size={14} color="hsl(var(--foreground))" />
              <Text className="text-xs font-serif text-foreground">browse public</Text>
            </Pressable>
            <Pressable
              onPress={() => router.navigate('/create-narrator')}
              className="h-8 w-8 items-center justify-center rounded-full bg-foreground"
            >
              <Plus size={16} color="hsl(var(--background))" />
            </Pressable>
            <ProfileButton />
          </View>
        }
      />

      <View className={cn(GUTTER, 'pt-2 pb-6')}>
        <Text className="text-[1.9rem] font-serif-medium text-foreground">narrators</Text>
        <Text className="mt-1 text-[0.95rem] font-serif text-muted-foreground">
          your saved personas; voice, tone, and relationship to you persist across stories.
        </Text>
      </View>

      {loading ? (
        <View className="py-10 items-center">
          <ActivityIndicator color="hsl(var(--foreground))" />
        </View>
      ) : narrators.length === 0 ? (
        <View className={cn(GUTTER, 'py-10 items-center')}>
          <Text className="text-sm font-serif text-muted-foreground text-center">
            no narrators yet — create your first persona.
          </Text>
          <Pressable
            onPress={() => router.navigate('/create-narrator')}
            className="mt-4 h-11 px-5 flex-row items-center gap-2 rounded-full bg-primary"
          >
            <Plus size={14} color="hsl(var(--primary-foreground))" />
            <Text className="text-sm font-serif-medium text-primary-foreground">
              create your first narrator
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
        >
          {/* wheel */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, gap: 16, alignItems: 'center' }}
          >
            {narrators.map((n, i) => {
              const isActive = i === active;
              const size = isActive ? 180 : 110;
              return (
                <Pressable
                  key={n.id}
                  onPress={() => setActive(i)}
                  style={{ opacity: isActive ? 1 : 0.5, transform: [{ scale: isActive ? 1 : 0.9 }] }}
                >
                  <NarratorAvatar a={n.colorA} b={n.colorB} size={size} />
                </Pressable>
              );
            })}
          </ScrollView>

          {/* dots */}
          <View className="flex-row items-center justify-center gap-1.5 mt-5">
            {narrators.map((_, i) => (
              <View
                key={i}
                className={cn(
                  'rounded-full',
                  i === active ? 'bg-foreground' : 'bg-border'
                )}
                style={{ width: i === active ? 16 : 6, height: 6 }}
              />
            ))}
          </View>

          {/* detail */}
          {selected && (
            <View className={cn(GUTTER, 'mt-6')}>
              <View className="rounded-[var(--radius)] border border-border bg-card p-5">
                <View className="flex-row items-center gap-2">
                  <Text className="text-[1.4rem] font-serif-medium text-foreground">
                    {selected.name}
                  </Text>
                  {selected.isPublic && <Badge variant="outline">public</Badge>}
                </View>
                <Text className="mt-0.5 text-xs font-serif text-muted-foreground">
                  {selected.gender}
                </Text>
                {selected.relationship && (
                  <Text className="mt-2 text-sm font-serif text-muted-foreground leading-relaxed">
                    {selected.relationship}
                  </Text>
                )}
                <View className="mt-4 flex-row gap-2">
                  <Pressable
                    onPress={() =>
                      router.navigate({
                        pathname: '/narrator-story',
                        params: { narratorId: selected.id, narratorName: selected.name },
                      })
                    }
                    className="flex-1 h-10 items-center justify-center rounded-full border border-border"
                  >
                    <Text className="text-sm font-serif-medium text-foreground">use in story</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      router.navigate({ pathname: '/narrator-stories', params: { narratorId: selected.id } })
                    }
                    className="flex-1 h-10 items-center justify-center rounded-full bg-foreground"
                  >
                    <Text className="text-sm font-serif-medium text-background">view stories</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

function pickColor(seed: string): { a: string; b: string } {
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

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}
