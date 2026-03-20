import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

export default function HomeScreen() {
  const router = useRouter();

  useEffect(() => {
    // This screen is hidden in tabs, but redirect just in case
    router.replace('/(tabs)/library');
  }, []);

  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
