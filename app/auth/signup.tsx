import { router } from 'expo-router';
import { AlertTriangle } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { FlowCluster, Screen, ScreenHeader, TopBar } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [secretCode, setSecretCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async () => {
    setError(null);
    if (!email || !password || !confirmPassword || !secretCode) {
      setError('please fill in all fields');
      return;
    }
    if (password !== confirmPassword) {
      setError('passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('password must be at least 6 characters');
      return;
    }
    if (secretCode.toLowerCase() !== 'fern') {
      setError('invalid secret code');
      return;
    }
    try {
      setLoading(true);
      await signUp(email, password);
      router.replace('/(tabs)/library');
    } catch (e: any) {
      setError(e.message ?? 'sign up failed');
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
        <ScreenHeader title="welcome to yn" subtitle="sign up to get started" />

        <View className="gap-3">
          <Field label="email">
            <Input
              value={email}
              onChangeText={setEmail}
              placeholder="you@domain.com"
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!loading}
            />
          </Field>
          <Field label="password">
            <Input
              value={password}
              onChangeText={setPassword}
              placeholder="at least 6 characters"
              secureTextEntry
              editable={!loading}
            />
          </Field>
          <Field label="confirm password">
            <Input
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="type it again"
              secureTextEntry
              editable={!loading}
            />
          </Field>
          <Field label="secret code">
            <Input
              value={secretCode}
              onChangeText={setSecretCode}
              placeholder="a quiet word"
              autoCapitalize="none"
              editable={!loading}
            />
          </Field>
        </View>

        {error && (
          <View className="flex-row items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2">
            <AlertTriangle size={14} color="#ef4444" />
            <Text className="text-xs text-red-400">{error}</Text>
          </View>
        )}

        <Button size="lg" onPress={handleSignUp} loading={loading} className="w-full">
          create account
        </Button>

        <Pressable
          onPress={() => router.push('/auth/login')}
          disabled={loading}
          className="self-center py-2"
        >
          <Text className="text-sm font-serif text-muted-foreground">
            already have an account?{' '}
            <Text className="font-serif-medium text-foreground">sign in</Text>
          </Text>
        </Pressable>
      </FlowCluster>
    </Screen>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-1.5">
      <Label>{label}</Label>
      {children}
    </View>
  );
}
