import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getUserProfile } from '@/services/user-service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const { signIn, resetPassword } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('enter email', 'please enter your email address first');
      return;
    }

    try {
      setLoading(true);
      await resetPassword(email);
      Alert.alert('email sent', 'check your inbox for a password reset link');
    } catch (error: any) {
      Alert.alert('error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('error', 'please fill in all fields');
      return;
    }

    try {
      setLoading(true);
      
      // Sign in with Firebase (this updates the user in AuthContext)
      await signIn(email, password);
      
      // Wait a moment for auth state to update
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Use Firebase auth directly since context may not update immediately
      const { auth } = require('@/config/firebase');
      const currentUser = auth.currentUser;
      
      if (currentUser) {
        // Fetch user profile from Firestore
        const profile = await getUserProfile(currentUser.uid);
        const displayName = profile?.name || 'friend';
        const profileAnswers = profile?.onboardingAnswers || {};
        
        // Save to AsyncStorage for offline access and persistence
        await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
        await AsyncStorage.setItem('userName', displayName);
        await AsyncStorage.setItem('onboardingAnswers', JSON.stringify(profileAnswers));
      }
      
      // Navigate to main app
      router.replace('/(tabs)/library');
    } catch (error: any) {
      Alert.alert('login failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <IconSymbol name="chevron.left" size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={[styles.title, { color: colors.text }]}>welcome back</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>sign in to continue</Text>

          <View style={styles.form}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
              placeholder="email"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!loading}
            />

            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
              placeholder="password"
              placeholderTextColor={colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>sign in</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleForgotPassword}
              disabled={loading}
              style={{ marginTop: 16 }}
            >
              <Text style={[styles.linkText, { color: colors.textSecondary }]}>
                forgot your password?
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/onboarding')}
              disabled={loading}
              style={{ marginTop: 8 }}
            >
              <Text style={[styles.linkText, { color: colors.textSecondary }]}>
                don&apos;t have an account? <Text style={[styles.linkBold, { color: colors.text }]}>sign up</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  backButton: {
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    marginBottom: 8,
    fontFamily: 'EBGaramond-Medium',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 48,
    fontFamily: 'EBGaramond-Regular',
    textAlign: 'center',
  },
  form: {
    gap: 16,
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E5E7',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#fff',
    fontFamily: 'EBGaramond-Regular',
  },
  button: {
    backgroundColor: '#2b2b34',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'EBGaramond-Medium',
  },
  linkText: {
    textAlign: 'center',
    color: '#717182',
    fontSize: 14,
    marginTop: 8,
    fontFamily: 'EBGaramond-Regular',
  },
  linkBold: {
    color: '#030213',
    fontWeight: '600',
    fontFamily: 'EBGaramond-Medium',
  },
});
