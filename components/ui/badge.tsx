import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'secondary';
  style?: ViewStyle;
}

export function Badge({ children, variant = 'secondary', style }: BadgeProps) {
  return (
    <View style={[styles.badge, styles[`badge_${variant}`], style]}>
      <Text style={[styles.text, styles[`text_${variant}`]]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badge_default: {
    backgroundColor: '#030213',
  },
  badge_secondary: {
    backgroundColor: '#ececf0',
  },
  text: {
    fontSize: 11,
  },
  text_default: {
    color: '#fff',
  },
  text_secondary: {
    color: '#030213',
  },
});
