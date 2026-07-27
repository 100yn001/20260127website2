import { useAuth } from '@/contexts/AuthContext';
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
      // Always land on sign-in. The login screen has a 'sign up' link for
      // new users; onboarding now happens after account creation rather
      // than as a cold gate to the app.
      router.replace('/auth/login');
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
