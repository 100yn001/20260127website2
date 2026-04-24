import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';

export const TINTS: { id: string; a: string; b: string }[] = [
  { id: 'amber', a: '#e5d6b8', b: '#8a8055' },
  { id: 'rose', a: '#e8d2c1', b: '#a37257' },
  { id: 'sky', a: '#c4d6ef', b: '#6a8fb8' },
  { id: 'sage', a: '#cde0d2', b: '#5f8d66' },
  { id: 'lilac', a: '#e5d1e8', b: '#a57aa5' },
  { id: 'slate', a: '#c7cfda', b: '#54606f' },
];

const DEFAULT = TINTS.find((t) => t.id === 'rose') ?? TINTS[0];

/**
 * Reads the user's persisted artworkTint from Firestore and returns the
 * resolved { id, a, b } swatch. Updates live when the doc changes so the
 * avatar + story defaults refresh across the whole UI when the user picks
 * a new tint in profile.
 */
export function useArtworkTint() {
  const { user } = useAuth();
  const [tintId, setTintId] = useState<string>(DEFAULT.id);

  useEffect(() => {
    if (!user) {
      setTintId(DEFAULT.id);
      return;
    }
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      const raw = (snap.data() as any)?.artworkTint;
      if (typeof raw === 'string' && TINTS.some((t) => t.id === raw)) {
        setTintId(raw);
      }
    });
    return () => unsub();
  }, [user?.uid]);

  const tint = TINTS.find((t) => t.id === tintId) ?? DEFAULT;
  return { ...tint };
}
