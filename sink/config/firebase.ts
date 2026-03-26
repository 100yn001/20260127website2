import Constants from 'expo-constants';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: Constants.expoConfig?.extra?.FIREBASE_API_KEY || '',
  authDomain: Constants.expoConfig?.extra?.FIREBASE_AUTH_DOMAIN || '',
  projectId: Constants.expoConfig?.extra?.FIREBASE_PROJECT_ID || '',
  storageBucket: Constants.expoConfig?.extra?.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: Constants.expoConfig?.extra?.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: Constants.expoConfig?.extra?.FIREBASE_APP_ID || '',
};

// Debug: log whether config values are present (not the values themselves)
console.log('[synk-firebase] config check:', {
  apiKey: firebaseConfig.apiKey ? 'SET' : 'EMPTY',
  projectId: firebaseConfig.projectId ? 'SET' : 'EMPTY',
  authDomain: firebaseConfig.authDomain ? 'SET' : 'EMPTY',
  storageBucket: firebaseConfig.storageBucket ? 'SET' : 'EMPTY',
});

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
