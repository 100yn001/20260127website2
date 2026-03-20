import { IconSymbol } from '@/components/ui/icon-symbol';
import { useFullscreen } from '@/contexts/FullscreenContext';
import { useTheme } from '@/contexts/ThemeContext';
import React from 'react';
import { Platform, StyleSheet, TouchableOpacity } from 'react-native';

export default function FullscreenToggle() {
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const { colors } = useTheme();

  if (Platform.OS !== 'web') return null;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: isFullscreen ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.35)',
          bottom: isFullscreen ? 16 : 76,
        },
      ]}
      onPress={toggleFullscreen}
      activeOpacity={0.7}
    >
      <IconSymbol
        name={isFullscreen ? 'arrow.down.right.and.arrow.up.left' : 'arrow.up.left.and.arrow.down.right'}
        size={16}
        color="#fff"
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
});
