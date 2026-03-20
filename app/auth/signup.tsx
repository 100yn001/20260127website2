import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
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

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [secretCode, setSecretCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!email || !password || !confirmPassword || !secretCode) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    if (secretCode.toLowerCase() !== 'fern') {
      Alert.alert('Error', 'Invalid secret code');
      return;
    }

    try {
      setLoading(true);
      await signUp(email, password);
      router.replace('/(tabs)/library');
    } catch (error: any) {
      Alert.alert('Sign Up Failed', error.message);
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

          <Text style={[styles.title, { color: colors.text }]}>welcome to yn</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>sign up to get started</Text>

          <View style={styles.form}>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Email"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!loading}
            />

            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Password"
              placeholderTextColor={colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />

            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Confirm Password"
              placeholderTextColor={colors.textSecondary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!loading}
            />

            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Secret Code"
              placeholderTextColor={colors.textSecondary}
              value={secretCode}
              onChangeText={setSecretCode}
              autoCapitalize="none"
              editable={!loading}
            />

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.buttonBackground }, loading && styles.buttonDisabled]}
              onPress={handleSignUp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.buttonText} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.buttonText }]}>Sign Up</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.back()}
              disabled={loading}
            >
              <Text style={[styles.linkText, { color: colors.textSecondary }]}>
                Already have an account? <Text style={[styles.linkBold, { color: colors.text }]}>Sign In</Text>
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
    color: '#030213',
    marginBottom: 8,
    fontFamily: 'EBGaramond-Medium',
  },
  subtitle: {
    fontSize: 16,
    color: '#717182',
    marginBottom: 48,
    fontFamily: 'EBGaramond-Regular',
  },
  form: {
    gap: 16,
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
    backgroundColor: '#030213',
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
