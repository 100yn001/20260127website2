import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import { Globe, Plus } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { Screen, TopBar } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/cn';
import { clonePublicNarratorToUser } from '@/services/public-narrator-service';

const GUTTER = 'px-5 sm:px-8 md:px-10 lg:px-14';

type PublicNarrator = {
  id: string;
  name: string;
  gender?: string;
  relationship?: string;
  colorA?: string;
  colorB?: string;
  storyCount?: number;
  accent?: string;
};

export default function PublicNarratorsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [narrators, setNarrators] = useState<PublicNarrator[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);

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
              colorA: data.colorA ?? '#e8d2c1',
              colorB: data.colorB ?? '#a37257',
              storyCount: data.storyCount ?? 0,
              accent: data.accent,
            };
          })
        );
      } catch (e) {
        console.error('[public-narrators] load failed', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveToLibrary = async (n: PublicNarrator) => {
    if (!user) {
      Alert.alert('sign in required', 'please sign in to save narrators');
      return;
    }
    setAdding(n.id);
    try {
      await clonePublicNarratorToUser(n.id, user.uid);
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
      <View className={cn(GUTTER, 'pt-2 pb-6')}>
        <View className="flex-row items-center gap-2 mb-1">
          <Globe size={18} color="hsl(var(--foreground))" />
          <Text className="text-[1.9rem] font-serif-medium text-foreground">public narrators</Text>
        </View>
        <Text className="mt-1 text-[0.95rem] font-serif text-muted-foreground">
          discover personas shared by the community.
        </Text>
      </View>

      {loading ? (
        <View className="py-10 items-center">
          <ActivityIndicator color="hsl(var(--foreground))" />
        </View>
      ) : narrators.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm font-serif text-muted-foreground text-center">
            no public narrators yet — check back soon.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
          <View className={cn(GUTTER, 'flex-row flex-wrap gap-3')}>
            {narrators.map((n) => (
              <View
                key={n.id}
                className="rounded-[var(--radius)] border border-border bg-card p-5"
                style={{ flexBasis: 320, flexGrow: 1 }}
              >
                <View className="flex-row items-start gap-4">
                  <View className="h-16 w-16 overflow-hidden rounded-full shrink-0">
                    <LinearGradient
                      colors={[n.colorA ?? '#e8d2c1', n.colorB ?? '#a37257']}
                      start={{ x: 0.3, y: 0.25 }}
                      end={{ x: 1, y: 1 }}
                      style={{ flex: 1 }}
                    />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-[1.1rem] font-serif-medium text-foreground">
                      {n.name}
                    </Text>
                    <Text className="mt-0.5 text-xs font-serif text-muted-foreground">
                      {n.gender ?? ''}
                      {n.accent ? <>  ·  {n.accent}</> : null}
                    </Text>
                    {n.relationship && (
                      <Text
                        className="mt-1.5 text-sm font-serif text-muted-foreground leading-relaxed"
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
            ))}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}
