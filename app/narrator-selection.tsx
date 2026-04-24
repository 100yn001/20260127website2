import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { collection, onSnapshot } from 'firebase/firestore';
import { Plus } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { Screen, TopBar } from '@/components/screen';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useMode } from '@/hooks/useMode';

type Narrator = {
  id: string;
  name: string;
  gender?: string;
  relationship?: string;
  colorA?: string;
  colorB?: string;
};

export default function NarratorSelectionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { mode } = useMode();
  const [narrators, setNarrators] = useState<Narrator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const ref = collection(db, 'users', user.uid, 'narrators');
    const unsub = onSnapshot(
      ref,
      (snap) => {
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
            };
          })
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [user?.uid]);

  const selectNarrator = (n: Narrator) => {
    router.push({
      pathname: '/narrator-story',
      params: { narratorId: n.id, narratorName: n.name, narratorData: JSON.stringify(n) },
    });
  };

  return (
    <Screen mode={mode}>
      <TopBar onBack={() => router.back()} />
      <View className="px-6 pt-2 pb-5">
        <Text className="text-[1.65rem] font-serif-medium text-foreground leading-tight">
          select narrator
        </Text>
      </View>
      {loading ? (
        <View className="py-10 items-center">
          <ActivityIndicator color="hsl(var(--foreground))" />
        </View>
      ) : narrators.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6 gap-4">
          <Text className="text-[1.1rem] font-serif text-muted-foreground text-center">
            no narrators yet
          </Text>
          <Pressable
            onPress={() => router.push('/create-narrator')}
            className="h-11 px-5 flex-row items-center gap-2 rounded-full bg-primary"
          >
            <Plus size={14} color="hsl(var(--primary-foreground))" />
            <Text className="text-sm font-serif-medium text-primary-foreground">
              create your first narrator
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40, gap: 10 }}
        >
          {narrators.map((n) => (
            <Pressable
              key={n.id}
              onPress={() => selectNarrator(n)}
              className="rounded-[var(--radius)] border border-border bg-card p-4"
            >
              <View className="flex-row items-center gap-4">
                <View className="h-14 w-14 overflow-hidden rounded-full">
                  <LinearGradient
                    colors={[n.colorA ?? '#e8d2c1', n.colorB ?? '#a37257']}
                    start={{ x: 0.3, y: 0.25 }}
                    end={{ x: 1, y: 1 }}
                    style={{ flex: 1 }}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-[1.05rem] font-serif-medium text-foreground">{n.name}</Text>
                  {n.gender && (
                    <Text className="mt-0.5 text-xs font-serif text-muted-foreground">
                      {n.gender}
                    </Text>
                  )}
                  {n.relationship && (
                    <Text
                      className="mt-1 text-sm font-serif text-muted-foreground"
                      numberOfLines={1}
                    >
                      {n.relationship}
                    </Text>
                  )}
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
