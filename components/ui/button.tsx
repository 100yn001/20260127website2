import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';

interface ButtonProps {
  onPress?: () => void;
  children: React.ReactNode;
  variant?: 'default' | 'outline' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function Button({ 
  onPress, 
  children, 
  variant = 'default',
  disabled = false,
  loading = false,
  style,
}: ButtonProps) {
  const buttonStyles = [
    styles.button,
    styles[`button_${variant}`],
    disabled && styles.buttonDisabled,
    style,
  ];

  const textStyles = [
    styles.text,
    styles[`text_${variant}`],
  ];

  return (
    <TouchableOpacity 
      onPress={onPress} 
      style={buttonStyles}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'default' ? '#fff' : '#030213'} />
      ) : (
        <Text style={textStyles}>{children}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  button_default: {
    backgroundColor: '#030213',
  },
  button_outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  button_ghost: {
    backgroundColor: 'transparent',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
  },
  text_default: {
    color: '#fff',
  },
  text_outline: {
    color: '#030213',
  },
  text_ghost: {
    color: '#030213',
  },
});
