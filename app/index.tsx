import { useAuth } from '@/contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function IndexScreen() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!loading) {
      checkRoute();
    }
  }, [loading, user]);

  // Safety valve: if Firebase auth hasn't reported in after 4s, assume
  // it's not going to and fall through to the signed-out flow. Without
  // this, a hung auth init leaves the user staring at an endless spinner.
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      if (loading) checkRoute();
    }, 4000);
    return () => clearTimeout(t);
  }, [loading]);

  const checkRoute = async () => {
    if (user && user.isAnonymous) {
      // Mid-onboarding anonymous session (kill-app-and-relaunch case): send
      // them back to onboarding, never into the app shell with no profile.
      router.replace('/onboarding');
    } else if (user) {
      // User is signed in, go to main app
      router.replace('/(tabs)/library');
    } else {
      // Signed out. A device that has held a real account before goes to
      // sign-in; a fresh visitor gets the onboarding welcome (the de-facto
      // landing page — yourname.media redirects here).
      const returning = await AsyncStorage.getItem('hasSignedInBefore').catch(() => null);
      router.replace(returning === 'true' ? '/auth/login' : '/onboarding');
    }
    setChecking(false);
  };

  if (loading || checking) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return <View style={{ flex: 1, backgroundColor: '#000' }} />;
}
