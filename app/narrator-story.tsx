import AmbientSoundControl, { type AmbientMode } from '@/components/AmbientSoundControl';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FontSizes } from '@/constants/typography';
import { useTheme } from '@/contexts/ThemeContext';
import { Narrator } from '@/types/narrator';
import Slider from '@react-native-community/slider';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Keyboard,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

type Step = 'location' | 'features' | 'narration';

export default function NarratorStoryScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useTheme();
  const [currentStep, setCurrentStep] = useState<Step>('location');

  // Parse narrator data
  const narratorData: Narrator = params.narratorData ? JSON.parse(params.narratorData as string) : null;
  const narratorName = params.narratorName as string;

  // Location
  const [location, _setLocation] = useState('');
  const [customLocation, setCustomLocation] = useState('');
  const [additionalDetails, setAdditionalDetails] = useState('');

  // Features (nighttime only - simplified for now)
  const [isNighttime, setIsNighttime] = useState(false);
  const [selectedFeatures, _setSelectedFeatures] = useState<string[]>([]);

  // Narration
  const [duration, setDuration] = useState<'5min' | '10min' | '15min'>('10min');
  const [narrativeRatio, setNarrativeRatio] = useState(5);
  const [ambientMode, setAmbientMode] = useState<AmbientMode>('auto');
  const [ambientCustomPrompt, setAmbientCustomPrompt] = useState('');

  const handleContinue = () => {
    if (currentStep === 'location') {
      setCurrentStep('narration');
    } else if (currentStep === 'narration') {
      // Navigate to followup with narrator data
      router.push({
        pathname: '/followup',
        params: {
          userName: narratorData.userNameWithNarrator,
          setting: '',
          location: customLocation || location,
          character: narratorData.name,
          genderSelf: narratorData.userGenderWithNarrator,
          genderOther: narratorData.gender,
          trope: '',
          features: JSON.stringify(selectedFeatures),
          featurePreferences: JSON.stringify({}),
          isNighttime: isNighttime.toString(),
          duration,
          narrativeRatio: narrativeRatio.toString(),
          voiceId: narratorData.voiceId,
          prompt: additionalDetails,
          tags: JSON.stringify([]),
          narratorData: JSON.stringify(narratorData),
          narratorId: narratorData?.id || '',
          ambientMode,
          ambientCustomPrompt,
        },
      });
    }
  };

  // Location step
  if (currentStep === 'location') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>story with {narratorName}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>where does this take place?</Text>
          </View>

          <View style={styles.inputSection}>
            <Text style={[styles.label, { color: colors.text }]}>location</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, color: colors.text }]}
              value={customLocation}
              onChangeText={setCustomLocation}
              placeholder="e.g., cozy coffee shop, quiet park, your bedroom..."
              placeholderTextColor={colors.textSecondary}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              autoCorrect={true}
            />
          </View>

          <View style={[styles.modeCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modeLabel, { color: colors.text }]}>mode</Text>
            <View style={styles.modeToggleRow}>
              <TouchableOpacity
                style={[styles.modeToggle, { backgroundColor: colors.background, borderColor: colors.border }, !isNighttime && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground }]}
                onPress={() => setIsNighttime(false)}
              >
                <IconSymbol name="sun.max.fill" size={20} color={!isNighttime ? colors.buttonText : colors.textSecondary} />
                <View style={styles.modeToggleTextContainer}>
                  <Text style={[styles.modeToggleText, { color: colors.textSecondary }, !isNighttime && { color: colors.buttonText }]}>daytime</Text>
                  <Text style={[styles.nsfwLabel, { color: colors.textSecondary }, !isNighttime && { color: colors.buttonText }]}>sfw</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeToggle, { backgroundColor: colors.background, borderColor: colors.border }, isNighttime && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground }]}
                onPress={() => setIsNighttime(true)}
              >
                <IconSymbol name="moon.stars.fill" size={20} color={isNighttime ? colors.buttonText : colors.textSecondary} />
                <View style={styles.modeToggleTextContainer}>
                  <Text style={[styles.modeToggleText, { color: colors.textSecondary }, isNighttime && { color: colors.buttonText }]}>nighttime</Text>
                  <Text style={[styles.nsfwLabel, { color: colors.textSecondary }, isNighttime && { color: colors.buttonText }]}>nsfw</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputSection}>
            <Text style={[styles.label, { color: colors.text }]}>additional details (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.card, color: colors.text }]}
              value={additionalDetails}
              onChangeText={setAdditionalDetails}
              placeholder="any other details to include in the story..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={3}
              returnKeyType="done"
              blurOnSubmit={true}
              onSubmitEditing={Keyboard.dismiss}
              autoCorrect={true}
            />
          </View>
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.continueButton, { backgroundColor: colors.buttonBackground }, !customLocation.trim() && styles.continueButtonDisabled]}
            onPress={handleContinue}
            disabled={!customLocation.trim()}
          >
            <Text style={[styles.continueButtonText, { color: colors.buttonText }]}>continue</Text>
            <IconSymbol name="arrow.right" size={20} color={colors.buttonText} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Narration step
  if (currentStep === 'narration') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => setCurrentStep('location')}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>story details</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>customize your experience</Text>
          </View>

          <View style={[styles.durationCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.durationLabel, { color: colors.text }]}>approx duration</Text>
            <View style={styles.durationRow}>
              {(['5min', '10min', '15min'] as const).map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.durationButton, { backgroundColor: colors.background, borderColor: colors.border }, duration === d && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground }]}
                  onPress={() => setDuration(d)}
                >
                  <Text style={[styles.durationButtonText, { color: colors.textSecondary }, duration === d && { color: colors.buttonText }]}>
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[styles.sliderCard, { backgroundColor: colors.card }]}>
            <View style={styles.sliderHeader}>
              <Text style={[styles.sliderLabel, { color: colors.text }]}>narrative style</Text>
            </View>
            <View style={styles.sliderLabels}>
              <Text style={[styles.sliderLabelText, { color: colors.textSecondary }]}>descriptive ({((10 - narrativeRatio) * 10)}%)</Text>
              <Text style={[styles.sliderLabelText, { color: colors.textSecondary }]}>direct ({narrativeRatio * 10}%)</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={10}
              step={1}
              value={narrativeRatio}
              onValueChange={setNarrativeRatio}
              minimumTrackTintColor={colors.buttonBackground}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.buttonBackground}
            />
            <Text style={[styles.sliderHint, { color: colors.textSecondary }]}>slide to adjust descriptive vs. direct content</Text>
          </View>

          <AmbientSoundControl
            mode={ambientMode}
            onModeChange={setAmbientMode}
            customPrompt={ambientCustomPrompt}
            onCustomPromptChange={setAmbientCustomPrompt}
            colors={colors}
          />
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity style={[styles.continueButton, { backgroundColor: colors.buttonBackground }]} onPress={handleContinue}>
            <Text style={[styles.continueButtonText, { color: colors.buttonText }]}>let&apos;s hear it</Text>
            <IconSymbol name="sparkles" size={20} color={colors.buttonText} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  backButton: {
    position: 'absolute',
    top: 48,
    left: 16,
    zIndex: 10,
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingTop: 100,
    paddingBottom: 120,
    ...(Platform.OS === 'web' ? { maxWidth: '70%', alignSelf: 'center', width: '100%' } : {}),
  } as any,
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: FontSizes.title,
    fontWeight: '500',
    color: '#030213',
    marginBottom: 4,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  subtitle: {
    fontSize: FontSizes.body,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  inputSection: {
    marginBottom: 24,
  },
  label: {
    fontSize: FontSizes.subtitle,
    fontWeight: '500',
    color: '#030213',
    marginBottom: 12,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  input: {
    backgroundColor: '#f7f7f8',
    borderRadius: 12,
    padding: 16,
    fontSize: FontSizes.body,
    color: '#030213',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modeCard: {
    backgroundColor: '#f7f7f8',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  modeLabel: {
    fontSize: FontSizes.subtitle,
    fontWeight: '500',
    color: '#030213',
    marginBottom: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  modeToggleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modeToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  modeToggleActive: {
    backgroundColor: '#030213',
    borderColor: '#030213',
  },
  modeToggleTextContainer: {
    alignItems: 'center',
  },
  modeToggleText: {
    fontSize: FontSizes.body,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  modeToggleTextActive: {
    color: '#fff',
  },
  nsfwLabel: {
    fontSize: 9,
    color: '#999',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    marginTop: 2,
  },
  nsfwLabelActive: {
    color: '#ccc',
  },
  durationCard: {
    backgroundColor: '#f7f7f8',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  durationLabel: {
    fontSize: FontSizes.subtitle,
    fontWeight: '500',
    color: '#030213',
    marginBottom: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  durationRow: {
    flexDirection: 'row',
    gap: 12,
  },
  durationButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  durationButtonActive: {
    backgroundColor: '#030213',
    borderColor: '#030213',
  },
  durationButtonText: {
    fontSize: FontSizes.body,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  durationButtonTextActive: {
    color: '#fff',
  },
  sliderCard: {
    backgroundColor: '#f7f7f8',
    borderRadius: 20,
    padding: 20,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sliderLabel: {
    fontSize: FontSizes.subtitle,
    fontWeight: '500',
    color: '#030213',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  sliderValue: {
    fontSize: FontSizes.subtitle,
    fontWeight: '500',
    color: '#717182',
    fontFamily: 'EBGaramond-Medium',
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sliderLabelText: {
    fontSize: FontSizes.body,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#6B6B7B',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 999,
    width: '100%',
  },
  continueButtonDisabled: {
    opacity: 0.3,
  },
  continueButtonText: {
    fontSize: FontSizes.subtitle,
    fontWeight: '500',
    color: '#fff',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
});
