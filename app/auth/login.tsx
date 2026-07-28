import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { AlertTriangle } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { FlowCluster, Screen, ScreenHeader, TopBar } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfile } from '@/services/user-service';

export default function LoginScreen() {
  const { signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleForgotPassword = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('enter your email first');
      return;
    }
    try {
      setLoading(true);
      await resetPassword(email);
      setInfo('check your inbox for a reset link');
    } catch (e: any) {
      setError(e.message ?? 'something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setError(null);
    setInfo(null);
    if (!email || !password) {
      setError('please fill in all fields');
      return;
    }
    try {
      setLoading(true);
      await signIn(email, password);
      await new Promise((r) => setTimeout(r, 1000));
      const { auth } = require('@/config/firebase');
      const currentUser = auth.currentUser;
      if (currentUser) {
        const profile = await getUserProfile(currentUser.uid);
        const displayName = profile?.name || 'friend';
        const profileAnswers = profile?.onboardingAnswers || {};
        await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
        await AsyncStorage.setItem('userName', displayName);
        await AsyncStorage.setItem('onboardingAnswers', JSON.stringify(profileAnswers));
      }
      router.replace('/(tabs)/library');
    } catch (e: any) {
      setError(e.message ?? 'login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen desktopBack={() => router.back()}>
      <View className="md:hidden">
        <TopBar onBack={() => router.back()} />
      </View>
      <FlowCluster>
        <ScreenHeader title="welcome back" subtitle="sign in to continue" />

        <View className="gap-3">
          <View className="gap-1.5">
            <Label>email</Label>
            <Input
              value={email}
              onChangeText={setEmail}
              placeholder="you@domain.com"
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!loading}
            />
          </View>
          <View className="gap-1.5">
            <Label>password</Label>
            <Input
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              editable={!loading}
            />
          </View>
        </View>

        {error && <InlineBanner tone="error" message={error} />}
        {info && <InlineBanner tone="info" message={info} />}

        <View className="gap-2">
          <Button size="lg" onPress={handleLogin} loading={loading} className="w-full">
            sign in
          </Button>
          <Pressable onPress={handleForgotPassword} disabled={loading} className="self-center py-2">
            <Text className="text-sm font-serif text-muted-foreground">forgot your password?</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.push('/onboarding')}
          disabled={loading}
          className="self-center py-2"
        >
          <Text className="text-sm font-serif text-muted-foreground">
            don't have an account?{' '}
            <Text className="font-serif-medium text-foreground">sign up</Text>
          </Text>
        </Pressable>
      </FlowCluster>
    </Screen>
  );
}

function InlineBanner({ tone, message }: { tone: 'error' | 'info'; message: string }) {
  const isError = tone === 'error';
  return (
    <View
      className={
        isError
          ? 'flex-row items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2'
          : 'flex-row items-center gap-2 rounded-lg border border-border bg-accent px-3 py-2'
      }
    >
      {isError && <AlertTriangle size={14} color="#ef4444" />}
      <Text className={isError ? 'text-xs text-red-400' : 'text-xs text-muted-foreground'}>
        {message}
      </Text>
    </View>
  );
}
