import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Bell,
  ChevronRight,
  LogOut,
  Moon,
  Palette,
  Pencil,
  Sun,
  Trash2,
  UserRound,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { Screen, TopBar } from '@/components/screen';
import { ThemeToggle } from '@/components/theme-toggle';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/cn';
import { getUserProfile, updateUserProfile } from '@/services/user-service';

const GUTTER = 'px-5 sm:px-8 md:px-10 lg:px-14';

const TINTS = [
  { id: 'amber', a: '#e5d6b8', b: '#8a8055' },
  { id: 'rose', a: '#e8d2c1', b: '#a37257' },
  { id: 'sky', a: '#c4d6ef', b: '#6a8fb8' },
  { id: 'sage', a: '#cde0d2', b: '#5f8d66' },
  { id: 'lilac', a: '#e5d1e8', b: '#a57aa5' },
  { id: 'slate', a: '#c7cfda', b: '#54606f' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut, deleteAccount } = useAuth() as any;
  const { theme, toggleTheme } = useTheme();

  const [name, setName] = useState('friend');
  const [editingName, setEditingName] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [tintId, setTintId] = useState('rose');
  const [storyCount, setStoryCount] = useState<number>(0);
  const [narratorCount, setNarratorCount] = useState<number>(0);
  const [bookmarkCount, setBookmarkCount] = useState<number>(0);

  useEffect(() => {
    (async () => {
      if (!user) return;
      try {
        const profile = await getUserProfile(user.uid);
        if (profile?.name) setName(profile.name);
        if (typeof (profile as any)?.artworkTint === 'string') {
          setTintId((profile as any).artworkTint);
        }
        setBookmarkCount(profile?.bookmarks?.length ?? 0);
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

  const tint = TINTS.find((t) => t.id === tintId) ?? TINTS[0];
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
                        onPress={() => setTintId(t.id)}
                        className={cn(
                          'h-5 w-5 overflow-hidden rounded-full',
                          tintId === t.id && 'border-2 border-foreground'
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
    </Screen>
  );
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
