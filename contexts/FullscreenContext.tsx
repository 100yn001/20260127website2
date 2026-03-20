import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';

interface FullscreenContextType {
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  exitFullscreen: () => void;
}

const FullscreenContext = createContext<FullscreenContextType>({
  isFullscreen: false,
  toggleFullscreen: () => {},
  exitFullscreen: () => {},
});

export function FullscreenProvider({ children }: { children: React.ReactNode }) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const enterBrowserFullscreen = useCallback(() => {
    if (Platform.OS !== 'web') return;
    try {
      const el = document.documentElement as any;
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch {}
  }, []);

  const exitBrowserFullscreen = useCallback(() => {
    if (Platform.OS !== 'web') return;
    try {
      const doc = document as any;
      if (doc.exitFullscreen) doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
    } catch {}
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      const next = !prev;
      if (next) enterBrowserFullscreen();
      else exitBrowserFullscreen();
      return next;
    });
  }, [enterBrowserFullscreen, exitBrowserFullscreen]);

  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
    exitBrowserFullscreen();
  }, [exitBrowserFullscreen]);

  // Sync state when user presses Escape to exit browser fullscreen
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = () => {
      const doc = document as any;
      if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
    };
  }, []);

  // Keyboard shortcut: F11 to toggle
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggleFullscreen]);

  return (
    <FullscreenContext.Provider value={{ isFullscreen, toggleFullscreen, exitFullscreen }}>
      {children}
    </FullscreenContext.Provider>
  );
}

export function useFullscreen() {
  return useContext(FullscreenContext);
}
