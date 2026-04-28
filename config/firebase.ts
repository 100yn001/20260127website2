import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

// Get Firebase config from Expo environment variables
const firebaseConfig = {
  apiKey: Constants.expoConfig?.extra?.FIREBASE_API_KEY || "",
  authDomain: Constants.expoConfig?.extra?.FIREBASE_AUTH_DOMAIN || "",
  projectId: Constants.expoConfig?.extra?.FIREBASE_PROJECT_ID || "",
  storageBucket: Constants.expoConfig?.extra?.FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: Constants.expoConfig?.extra?.FIREBASE_MESSAGING_SENDER_ID || "",
  appId: Constants.expoConfig?.extra?.FIREBASE_APP_ID || "",
};

// Debug logging (remove in production)
console.log('🔥 Firebase Config:', {
  apiKey: firebaseConfig.apiKey ? '✓ (exists)' : '✗ (missing)',
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
});

if (!firebaseConfig.apiKey) {
  console.warn('⚠️ Firebase API key not found in environment');
}

// Initialize Firebase app (guard against re-initialization in dev/hmr)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth with persistent storage
// Use a flag to track if we've already initialized auth in this module
const isNewApp = getApps().length === 1; // If we just created the app, it's new

let authInstance;
if (isNewApp && Platform.OS !== 'web') {
  // First initialization on native - use AsyncStorage persistence
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getReactNativePersistence } = require('firebase/auth');
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
  console.log('✅ Auth initialized with AsyncStorage persistence');
} else {
  // HMR reload or web - get existing auth instance
  authInstance = getAuth(app);
}

export const auth = authInstance;
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

console.log('✅ Firebase initialized successfully');

export default app;
