declare module 'firebase/auth/react-native' {
  import type { Persistence } from 'firebase/auth';

  interface StorageLike {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  }

  export function getReactNativePersistence(storage: StorageLike): Persistence;
}
