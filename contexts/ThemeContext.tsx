import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme as nwColorScheme } from 'nativewind';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';

type Theme = 'light' | 'dark';

interface ThemeColors {
  background: string;
  card: string;
  cardActive: string;
  text: string;
  textSecondary: string;
  border: string;
  buttonBackground: string;
  buttonText: string;
  tabBackground: string;
  tabActiveBackground: string;
  tabText: string;
  tabActiveText: string;
}

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  colors: ThemeColors;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
}

const lightColors: ThemeColors = {
  background: '#fff',
  card: '#f7f7f8',
  cardActive: '#030213',
  text: '#030213',
  textSecondary: '#717182',
  border: '#E5E5E7',
  buttonBackground: '#030213',
  buttonText: '#fff',
  tabBackground: '#f7f7f8',
  tabActiveBackground: '#030213',
  tabText: '#717182',
  tabActiveText: '#fff',
};

const darkColors: ThemeColors = {
  background: '#050507',
  card: '#1a1a1f',
  cardActive: '#f5f5f5',
  text: '#f8f8fb',
  textSecondary: '#9da0ad',
  border: '#26262e',
  buttonBackground: '#f5f5f5',
  buttonText: '#050507',
  tabBackground: '#0e0e13',
  tabActiveBackground: '#f5f5f5',
  tabText: '#9da0ad',
  tabActiveText: '#050507',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      const next = !prev;
      if (Platform.OS === 'web') {
        try {
          if (next) {
            const el = document.documentElement as any;
            if (el.requestFullscreen) el.requestFullscreen();
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
          } else {
            const doc = document as any;
            if (doc.exitFullscreen) doc.exitFullscreen();
            else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
          }
        } catch {}
      }
      return next;
    });
  }, []);

  // Sync when user presses Escape to exit browser fullscreen
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

  useEffect(() => {
    loadTheme();
  }, []);

  // Sync nativewind colorScheme whenever theme changes.
  useEffect(() => {
    nwColorScheme.set(theme);
  }, [theme]);

  const loadTheme = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('appTheme');
      if (savedTheme === 'dark' || savedTheme === 'light') {
        setTheme(savedTheme);
      }
    } catch (error) {
      console.error('Error loading theme:', error);
    } finally {
      setThemeLoaded(true);
    }
  };

  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    try {
      await AsyncStorage.setItem('appTheme', newTheme);
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  const colors = theme === 'light' ? lightColors : darkColors;

  if (!themeLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, colors, isFullscreen, toggleFullscreen }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
