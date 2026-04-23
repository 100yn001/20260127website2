import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export type AmbientMode = 'auto' | 'off' | 'custom';

interface ThemeColors {
  text: string;
  textSecondary: string;
  card: string;
  background: string;
  border: string;
  buttonBackground: string;
  buttonText: string;
}

interface Props {
  mode: AmbientMode;
  onModeChange: (mode: AmbientMode) => void;
  customPrompt: string;
  onCustomPromptChange: (text: string) => void;
  colors: ThemeColors;
}

const MODES: { id: AmbientMode; label: string }[] = [
  { id: 'auto', label: 'auto' },
  { id: 'off', label: 'off' },
  { id: 'custom', label: 'custom' },
];

const MODE_HINT: Record<AmbientMode, string> = {
  auto: 'we pick ambient sound from your setting and location',
  off: 'narration only — no ambient layer',
  custom: 'describe your own ambient layer (e.g. "rain on a wooden porch")',
};

export default function AmbientSoundControl({
  mode,
  onModeChange,
  customPrompt,
  onCustomPromptChange,
  colors,
}: Props) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <Text style={[styles.label, { color: colors.text }]}>ambient sound</Text>
      <View style={styles.row}>
        {MODES.map(({ id, label }) => {
          const active = mode === id;
          return (
            <TouchableOpacity
              key={id}
              style={[
                styles.button,
                { backgroundColor: colors.background, borderColor: colors.border },
                active && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground },
              ]}
              onPress={() => onModeChange(id)}
            >
              <Text
                style={[
                  styles.buttonText,
                  { color: colors.textSecondary },
                  active && { color: colors.buttonText },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {mode === 'custom' ? (
        <TextInput
          style={[
            styles.input,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.background,
            },
          ]}
          placeholder="rain on a wooden porch, distant thunder…"
          placeholderTextColor={colors.textSecondary}
          value={customPrompt}
          onChangeText={onCustomPromptChange}
          autoCapitalize="none"
          autoCorrect
          multiline
          maxLength={140}
        />
      ) : null}
      <Text style={[styles.hint, { color: colors.textSecondary }]}>{MODE_HINT[mode]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    borderWidth: 1,
  },
  buttonText: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    minHeight: 64,
    textAlignVertical: 'top',
  },
  hint: {
    marginTop: 12,
    fontSize: 12,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
});
