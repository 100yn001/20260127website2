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

  const checkRoute = async () => {
    if (user) {
      // User is signed in, go to main app
      router.replace('/(tabs)/library');
    } else {
      // User is not signed in - check if they've completed onboarding
      const hasCompletedOnboarding = await AsyncStorage.getItem('hasCompletedOnboarding');

      if (hasCompletedOnboarding === 'true') {
        // Returning user - go to login
        router.replace('/auth/login');
      } else {
        // New user - go to onboarding
        router.replace('/onboarding');
      }
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
