import { auth } from '@/config/firebase';
import { deleteUserData } from '@/services/user-service';
import {
    EmailAuthProvider,
    User,
    createUserWithEmailAndPassword,
    deleteUser,
    linkWithCredential,
    reauthenticateWithCredential,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    signInAnonymously,
    signInWithEmailAndPassword,
} from 'firebase/auth';
import React, { createContext, useContext, useEffect, useState } from 'react';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  deleteAccount: (password?: string) => Promise<void>;
  /** Sign in anonymously (reusing any existing session) so pre-signup
   * onboarding steps can call authenticated Cloud Functions. */
  ensureAnonymousSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const ensureAnonymousSession = async () => {
    // Reuse whatever session exists (anonymous OR real) — never mint a fresh
    // anon uid per onboarding visit, that would orphan first-story data.
    if (auth.currentUser) return;
    try {
      await signInAnonymously(auth);
    } catch (error: any) {
      throw new Error(error.code ?? error.message);
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const current = auth.currentUser;
      if (current?.isAnonymous) {
        // Upgrade the anonymous account in place — the uid (and everything
        // hanging off it: first story, entitlements) carries over.
        const credential = EmailAuthProvider.credential(email, password);
        await linkWithCredential(current, credential);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      // error.code (e.g. auth/email-already-in-use) survives for callers that
      // string-match; fall back to message for non-Firebase errors.
      throw new Error(error.code ?? error.message);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setUser(null);
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  const deleteAccount = async (password?: string) => {
    const current = auth.currentUser;
    if (!current) return;
    const uid = current.uid;
    try {
      // Recent-login requirement: re-authenticate with the password if given.
      if (password && current.email) {
        const credential = EmailAuthProvider.credential(current.email, password);
        await reauthenticateWithCredential(current, credential);
      }
      // Purge Firestore data FIRST (owner rules require the user still exists),
      // then remove the auth account.
      await deleteUserData(uid);
      await deleteUser(current);
      setUser(null);
    } catch (error: any) {
      throw new Error(error.code ?? error.message);
    }
  };

  const value = {
    user,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    deleteAccount,
    ensureAnonymousSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
