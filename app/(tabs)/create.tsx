import { createShadow } from '@/utils/shadow';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Keyboard,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Card } from '@/components/ui/card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/ThemeContext';

type Step = 'selection' | 'idea' | 'gender' | 'narration' | 'name';

export default function CreateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors } = useTheme();
  const { width: vw } = useWindowDimensions();
  const storyCols = Platform.OS === 'web' ? (vw >= 1024 ? 5 : vw >= 600 ? 4 : 3) : 3;
  const tileWidth = (vw - 48 - 12 * (storyCols - 1)) / storyCols;

  const [currentStep, setCurrentStep] = useState<Step>('selection');
  const [ideaInput, setIdeaInput] = useState('');

  const [selfGenderChoice, setSelfGenderChoice] = useState<'female' | 'male' | 'custom' | null>(null);
  const [selfGenderCustom, setSelfGenderCustom] = useState('');
  const [characterGenderChoice, setCharacterGenderChoice] = useState<'female' | 'male' | 'custom' | null>(null);
  const [characterGenderCustom, setCharacterGenderCustom] = useState('');

  const [duration, setDuration] = useState<'5min' | '10min' | '15min'>('10min');
  const [narrativeRatio, setNarrativeRatio] = useState(5);

  const [nameOption, setNameOption] = useState<'my-name' | 'custom' | 'nameless'>('my-name');
  const [customNameInput, setCustomNameInput] = useState('');
  const [storedUserName, setStoredUserName] = useState('User');

  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);

  const resolvedSelfGender = selfGenderChoice === 'custom' ? selfGenderCustom.trim() : selfGenderChoice;
  const resolvedCharacterGender = characterGenderChoice === 'custom' ? characterGenderCustom.trim() : characterGenderChoice;

  const userName = nameOption === 'my-name' ? storedUserName :
    nameOption === 'custom' ? (customNameInput || 'User') :
    'you';

  useEffect(() => {
    const loadName = async () => {
      const saved = await AsyncStorage.getItem('userName');
      if (saved) {
        setStoredUserName(saved);
      }
    };
    loadName();
  }, []);

  // Receive voice selection back from voice-library
  useEffect(() => {
    const voiceId = params.selectedVoiceId as string | undefined;
    if (voiceId) {
      setSelectedVoice(voiceId);
    }
  }, [params.selectedVoiceId]);

  const handleIdeaContinue = () => {
    if (!ideaInput.trim()) return;
    setCurrentStep('gender');
  };

  const openVoiceLibrary = () => {
    router.push({
      pathname: '/voice-library' as any,
      params: {
        genderHint: resolvedCharacterGender || '',
        userName,
      },
    });
  };

  const handleSubmit = () => {
    if (!selectedVoice) return;

    router.push({
      pathname: '/followup',
      params: {
        userName,
        setting: ideaInput,
        location: '',
        character: '',
        genderSelf: resolvedSelfGender || '',
        genderOther: resolvedCharacterGender || '',
        trope: '',
        features: JSON.stringify([]),
        featurePreferences: JSON.stringify({}),
        isNighttime: 'false',
        duration,
        narrativeRatio: narrativeRatio.toString(),
        voiceId: selectedVoice,
        prompt: ideaInput,
        tags: JSON.stringify([]),
      },
    });
  };

  let content: React.ReactNode = null;

  if (currentStep === 'selection') {
    content = (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Animated.View entering={FadeIn.duration(250)} style={styles.selectionContainer}>
          <View style={styles.selectionHeader}>
            <Text style={[styles.selectionTitle, { color: colors.text }]}>create</Text>
            <Text style={[styles.selectionSubtitle, { color: colors.textSecondary }]}>choose how you&apos;d like to create your story</Text>
          </View>

          <View style={[styles.selectionOptions, { maxWidth: Platform.OS === 'web' && vw >= 600 ? tileWidth * 2 + 12 : vw - 48, alignSelf: 'center' as const, width: '100%' as const }]}>
            <Animated.View entering={FadeInDown.duration(300).delay(50)}>
              <Pressable
                style={({ pressed }) => [
                  styles.selectionCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  pressed && styles.selectionCardPressed,
                ]}
                onPress={() => setCurrentStep('idea')}
              >
                <IconSymbol name="wand.and.stars" size={32} color={colors.text} />
                <Text style={[styles.selectionCardTitle, { color: colors.text }]}>from scratch</Text>
                <Text style={[styles.selectionCardDescription, { color: colors.textSecondary }]}>
                  describe your own story idea and we&apos;ll bring it to life
                </Text>
              </Pressable>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(300).delay(120)}>
              <Pressable
                style={({ pressed }) => [
                  styles.selectionCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  pressed && styles.selectionCardPressed,
                ]}
                onPress={() => router.push('/(tabs)/recipe')}
              >
                <IconSymbol name="book.closed" size={32} color={colors.text} />
                <Text style={[styles.selectionCardTitle, { color: colors.text }]}>from recipe</Text>
                <Text style={[styles.selectionCardDescription, { color: colors.textSecondary }]}>
                  choose from curated settings, characters, and storylines
                </Text>
              </Pressable>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(300).delay(190)}>
              <Pressable
                style={({ pressed }) => [
                  styles.selectionCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  pressed && styles.selectionCardPressed,
                ]}
                onPress={() => router.push('/narrator-selection')}
              >
                <IconSymbol name="person.wave.2" size={32} color={colors.text} />
                <Text style={[styles.selectionCardTitle, { color: colors.text }]}>from narrator</Text>
                <Text style={[styles.selectionCardDescription, { color: colors.textSecondary }]}>
                  create with one of your saved narrator personas
                </Text>
              </Pressable>
            </Animated.View>
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  } else if (currentStep === 'idea') {
    content = (
      <Animated.View entering={FadeIn.duration(250)} style={{ flex: 1 }}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header with back button */}
        <View style={styles.ideaHeader}>
          <TouchableOpacity 
            style={styles.ideaBackButton} 
            onPress={() => setCurrentStep('selection')}
          >
            <IconSymbol name="chevron.left" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.ideaBody}>
          <Card style={StyleSheet.flatten([styles.ideaCard, { backgroundColor: colors.card }])}>
            <View style={styles.cardHeader}>
              <IconSymbol name="wand.and.stars" size={20} color={colors.textSecondary} />
              <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>your story idea</Text>
            </View>
            <TextInput
              style={[styles.ideaTextArea, { color: colors.text }]}
              value={ideaInput}
              onChangeText={(text) => {
                if (text.length <= 1000) {
                  setIdeaInput(text);
                }
              }}
              placeholder={`describe your story idea...\n\ne.g., 'a mysterious librarian discovers a book that writes itself'\n\nor 'tell me a story about redemption set in a coffee shop'`}
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
              returnKeyType="done"
              blurOnSubmit={true}
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
              <Text style={[styles.charCount, { color: colors.textSecondary }]}>{ideaInput.length} / 1000</Text>
            </View>
          </Card>
        </View>

        <View style={styles.ideaFooter}>
          <TouchableOpacity
            style={[styles.continueButtonRowDark, !ideaInput.trim() && { opacity: 0.3 }]}
            onPress={handleIdeaContinue}
            disabled={!ideaInput.trim()}
          >
            <Text style={styles.continueTextWhite}>continue</Text>
            <IconSymbol name="arrow.right" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      </Animated.View>
    );
  } else if (currentStep === 'gender') {
    content = (
      <Animated.View entering={FadeIn.duration(250)} style={{ flex: 1 }}>
      <SafeAreaView style={[styles.darkContainer, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => setCurrentStep('idea')}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.darkHeader}>
          <Text style={[styles.darkTitle, { color: colors.text }]}>specify genders</Text>
          <Text style={[styles.darkSubtitle, { color: colors.textSecondary }]}>add details for yourself and your character</Text>
        </View>
        <ScrollView contentContainerStyle={styles.darkContent}>
          <View style={[styles.genderCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.genderCardLabel, { color: colors.text }]}>your gender</Text>
            <View style={styles.genderPillsRow}>
              {['female', 'male'].map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.genderPill,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    selfGenderChoice === option && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground },
                  ]}
                  onPress={() => setSelfGenderChoice(option as 'female' | 'male')}
                >
                  <Text style={[
                    styles.genderPillText,
                    { color: colors.textSecondary },
                    selfGenderChoice === option && { color: colors.buttonText },
                  ]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              style={[
                styles.genderPill,
                { backgroundColor: colors.background, borderColor: colors.border },
                selfGenderChoice === 'custom' && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground },
                { marginTop: 12 },
              ]}
              onPress={() => {
                if (selfGenderChoice !== 'custom') {
                  setSelfGenderChoice('custom');
                }
              }}
            >
              <TextInput
                style={[styles.genderPillInput, {
                  color: selfGenderChoice === 'custom' ? colors.buttonText : colors.textSecondary,
                }]}
                value={selfGenderCustom}
                onChangeText={setSelfGenderCustom}
                placeholder="enter custom gender"
                placeholderTextColor={selfGenderChoice === 'custom' ? colors.buttonText + '80' : colors.textSecondary}
                editable={selfGenderChoice === 'custom'}
                pointerEvents={selfGenderChoice === 'custom' ? 'auto' : 'none'}
              />
            </TouchableOpacity>
          </View>

          <View style={[styles.genderCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.genderCardLabel, { color: colors.text }]}>character gender</Text>
            <View style={styles.genderPillsRow}>
              {['female', 'male'].map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.genderPill,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    characterGenderChoice === option && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground },
                  ]}
                  onPress={() => setCharacterGenderChoice(option as 'female' | 'male')}
                >
                  <Text style={[
                    styles.genderPillText,
                    { color: colors.textSecondary },
                    characterGenderChoice === option && { color: colors.buttonText },
                  ]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              style={[
                styles.genderPill,
                { backgroundColor: colors.background, borderColor: colors.border },
                characterGenderChoice === 'custom' && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground },
                { marginTop: 12 },
              ]}
              onPress={() => {
                if (characterGenderChoice !== 'custom') {
                  setCharacterGenderChoice('custom');
                }
              }}
            >
              <TextInput
                style={[styles.genderPillInput, {
                  color: characterGenderChoice === 'custom' ? colors.buttonText : colors.textSecondary,
                }]}
                value={characterGenderCustom}
                onChangeText={setCharacterGenderCustom}
                placeholder="enter custom gender"
                placeholderTextColor={characterGenderChoice === 'custom' ? colors.buttonText + '80' : colors.textSecondary}
                editable={characterGenderChoice === 'custom'}
                pointerEvents={characterGenderChoice === 'custom' ? 'auto' : 'none'}
              />
            </TouchableOpacity>
          </View>
        </ScrollView>
        <View style={styles.darkFooter}>
          <TouchableOpacity style={styles.continueButtonRowDark} onPress={() => setCurrentStep('narration')}>
            <Text style={styles.continueTextWhite}>continue</Text>
            <IconSymbol name="arrow.right" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      </Animated.View>
    );
  } else if (currentStep === 'narration') {
    content = (
      <Animated.View entering={FadeIn.duration(250)} style={{ flex: 1 }}>
      <SafeAreaView style={[styles.darkContainer, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => setCurrentStep('gender')}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.darkHeader}>
          <Text style={[styles.darkTitle, { color: colors.text }]}>narration details</Text>
          <Text style={[styles.darkSubtitle, { color: colors.textSecondary }]}>set pacing and duration for your story</Text>
        </View>
        <ScrollView contentContainerStyle={styles.darkContent}>
          <View style={[styles.durationCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.durationLabel, { color: colors.text }]}>approx duration</Text>
            <View style={styles.durationRow}>
              {(['5min', '10min', '15min'] as const).map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[styles.durationButton, { backgroundColor: colors.background, borderColor: colors.border }, duration === option && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground }]}
                  onPress={() => setDuration(option)}
                >
                  <Text style={[styles.durationButtonText, { color: colors.textSecondary }, duration === option && { color: colors.buttonText }]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[styles.sliderCard, { backgroundColor: colors.card }]}>
            <View style={styles.sliderHeader}>
              <Text style={[styles.durationLabel, { color: colors.text }]}>narrative style</Text>
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
              minimumTrackTintColor={colors.buttonBackground}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.buttonBackground}
              value={narrativeRatio}
              onValueChange={(val) => setNarrativeRatio(val)}
            />
            <Text style={[styles.sliderHint, { color: colors.textSecondary }]}>slide to adjust descriptive vs. direct content</Text>
          </View>
        </ScrollView>
        <View style={styles.darkFooter}>
          <TouchableOpacity style={styles.continueButtonRowDark} onPress={() => setCurrentStep('name')}>
            <Text style={styles.continueTextWhite}>continue</Text>
            <IconSymbol name="arrow.right" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      </Animated.View>
    );
  } else if (currentStep === 'name') {
    content = (
      <Animated.View entering={FadeIn.duration(250)} style={{ flex: 1 }}>
      <SafeAreaView style={[styles.darkContainer, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => setCurrentStep('narration')}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.darkHeader}>
          <Text style={[styles.darkTitle, { color: colors.text }]}>how should we address you?</Text>
          <Text style={[styles.darkSubtitle, { color: colors.textSecondary }]}>choose the name for your narration</Text>
        </View>
        <ScrollView contentContainerStyle={styles.darkContent}>
          <View style={styles.nameOptionsContainer}>
            <TouchableOpacity
              style={[styles.nameOption, { backgroundColor: colors.card, borderColor: colors.border }, nameOption === 'my-name' && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground }]}
              onPress={() => setNameOption('my-name')}
            >
              <View>
                <Text style={[styles.nameOptionTitle, { color: colors.text }, nameOption === 'my-name' && { color: colors.buttonText }]}>use my name</Text>
                <Text style={[styles.nameOptionSubtitle, { color: colors.textSecondary }, nameOption === 'my-name' && styles.nameOptionSubtitleActive]}>
                  {storedUserName}
                </Text>
              </View>
              {nameOption === 'my-name' && <IconSymbol name="checkmark.circle.fill" size={24} color={colors.buttonText} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.nameOption, { backgroundColor: colors.card, borderColor: colors.border }, nameOption === 'custom' && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground }]}
              onPress={() => setNameOption('custom')}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.nameOptionTitle, { color: colors.text }, nameOption === 'custom' && { color: colors.buttonText }]}>use another name</Text>
                {nameOption === 'custom' ? (
                  <TextInput
                    style={[styles.nameCustomInput, { backgroundColor: colors.background, color: colors.buttonText }]}
                    value={customNameInput}
                    onChangeText={setCustomNameInput}
                    placeholder="enter name"
                    placeholderTextColor={colors.textSecondary}
                  />
                ) : (
                  <Text style={[styles.nameOptionSubtitle, { color: colors.textSecondary }]}>customize what the voice says</Text>
                )}
              </View>
              {nameOption === 'custom' && customNameInput && (
                <IconSymbol name="checkmark.circle.fill" size={24} color={colors.buttonText} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.nameOption, { backgroundColor: colors.card, borderColor: colors.border }, nameOption === 'nameless' && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground }]}
              onPress={() => setNameOption('nameless')}
            >
              <View>
                <Text style={[styles.nameOptionTitle, { color: colors.text }, nameOption === 'nameless' && { color: colors.buttonText }]}>generate a nameless audio</Text>
                <Text style={[styles.nameOptionSubtitle, { color: colors.textSecondary }, nameOption === 'nameless' && styles.nameOptionSubtitleActive]}>
                  you&apos;ll be addressed as &quot;you&quot;
                </Text>
              </View>
              {nameOption === 'nameless' && <IconSymbol name="checkmark.circle.fill" size={24} color={colors.buttonText} />}
            </TouchableOpacity>
          </View>
        </ScrollView>
        <View style={styles.darkFooter}>
          {selectedVoice ? (
            <View style={styles.voiceSelectedRow}>
              <TouchableOpacity style={[styles.changeVoiceButton, { borderColor: colors.border }]} onPress={openVoiceLibrary}>
                <IconSymbol name="waveform" size={16} color={colors.text} />
                <Text style={[styles.changeVoiceText, { color: colors.text }]}>change voice</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.continueButtonRowDark, { flex: 1 }]} onPress={handleSubmit}>
                <Text style={styles.continueTextWhite}>continue</Text>
                <IconSymbol name="arrow.right" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.continueButtonRowDark} onPress={openVoiceLibrary}>
              <IconSymbol name="waveform" size={18} color="#fff" />
              <Text style={styles.continueTextWhite}>select voice</Text>
              <IconSymbol name="arrow.right" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
      </Animated.View>
    );
  }

  return (
    <View key={currentStep} style={[styles.container, { backgroundColor: colors.background }]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  selectionContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  selectionHeader: {
    marginBottom: 28,
    alignItems: 'center',
  },
  selectionTitle: {
    fontSize: 32,
    fontWeight: '500',
    color: '#030213',
    marginBottom: 8,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  selectionSubtitle: {
    fontSize: 14,
    color: '#717182',
    textAlign: 'center',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  selectionOptions: {
    gap: 16,
  },
  selectionCard: {
    backgroundColor: '#f9f9fb',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    ...createShadow('#000', 0, 6, 12, 0.08, 4),
  },
  selectionCardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },
  selectionCardTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: '#030213',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  selectionCardDescription: {
    fontSize: 14,
    color: '#717182',
    textAlign: 'center',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
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
    padding: 16,
    paddingBottom: 100,
    gap: 20,
  },
  // Idea screen styles
  ideaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  ideaBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ideaHeaderText: {
    flex: 1,
    alignItems: 'center',
  },
  ideaTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: '#030213',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
    textAlign: 'center',
  },
  ideaSubtitle: {
    fontSize: 13,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    marginTop: 2,
    textAlign: 'center',
  },
  ideaBody: {
    flex: 1,
    paddingHorizontal: 16,
  },
  ideaCard: {
    flex: 1,
    borderRadius: 16,
  },
  ideaTextArea: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'EBGaramond-Regular',
    textAlignVertical: 'top',
    paddingTop: 0,
  },
  ideaFooter: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 16,
    alignItems: 'center',
  },
  header: {
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '500',
    color: '#030213',
    marginBottom: 4,
    fontFamily: 'EBGaramond-Medium',
  },
  subtitle: {
    fontSize: 14,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
  },
  inputCard: {
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 13,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
  },
  textArea: {
    fontSize: 16,
    color: '#030213',
    minHeight: 220,
    marginBottom: 12,
    fontFamily: 'EBGaramond-Regular',
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    paddingTop: 12,
  },
  charCount: {
    fontSize: 12,
    color: '#717182',
    textAlign: 'right',
    fontFamily: 'EBGaramond-Regular',
  },
  generateButton: {
    paddingVertical: 16,
    width: '100%',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  // Dark flow styles
  darkContainer: {
    flex: 1,
    backgroundColor: '#000',
    paddingBottom: 24,
  },
  darkHeader: {
    marginTop: 80,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  darkTitle: {
    fontSize: 24,
    color: '#fff',
    fontWeight: '500',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  darkSubtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    fontFamily: 'EBGaramond-Regular',
  },
  darkContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 120,
    gap: 24,
  },
  darkFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 16,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  continueButtonRowDark: {
    backgroundColor: '#6B6B7B',
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  continueTextWhite: {
    color: '#fff',
    fontSize: 16,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  hideKeyboardButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#030213',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    ...createShadow('#000', 0, 2, 6, 0.2, 4),
  },
  hideKeyboardText: {
    color: '#fff',
    fontSize: 13,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  genderCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  genderCardLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 16,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  genderPillsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  genderPill: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
  },
  genderPillText: {
    fontSize: 14,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  genderPillInput: {
    width: '100%',
    backgroundColor: 'transparent',
    fontSize: 14,
    textAlign: 'center',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  durationCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  durationLabel: {
    fontSize: 16,
    fontWeight: '500',
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
    borderWidth: 1,
  },
  durationButtonText: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  sliderCard: {
    borderRadius: 20,
    padding: 20,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderHint: {
    fontSize: 12,
    textAlign: 'center',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
    marginTop: 8,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sliderLabelText: {
    fontSize: 14,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  nameOptionsContainer: {
    gap: 16,
  },
  nameOption: {
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
  },
  nameOptionActive: {
    backgroundColor: '#030213',
    borderColor: '#030213',
  },
  nameOptionTitle: {
    fontSize: 18,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  nameOptionTitleActive: {
    color: '#fff',
  },
  nameOptionSubtitle: {
    fontSize: 14,
    textTransform: 'lowercase',
    marginTop: 4,
    fontFamily: 'EBGaramond-Regular',
  },
  nameOptionSubtitleActive: {
    color: '#ccc',
  },
  nameCustomInput: {
    marginTop: 8,
    borderRadius: 12,
    padding: 12,
    fontFamily: 'EBGaramond-Regular',
  },
  voiceGenderTabs: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    marginTop: 32,
    marginBottom: 20,
  },
  voiceGenderTab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#666',
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceGenderTabActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  voiceGenderTabText: {
    fontSize: 14,
    color: '#999',
    textTransform: 'lowercase',
    fontWeight: '500',
    fontFamily: 'EBGaramond-Medium',
  },
  voiceGenderTabTextActive: {
    color: '#000',
  },
  voiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 140,
  },
  voiceCard: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 24,
    backgroundColor: '#2a2a2a',
    padding: 16,
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: '#2a2a2a',
  },
  voiceCardActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  voiceCardContent: {
    flex: 1,
    justifyContent: 'center',
  },
  voiceAccent: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'lowercase',
    marginBottom: 8,
    fontFamily: 'EBGaramond-SemiBold',
  },
  voiceAccentActive: {
    color: '#000',
  },
  voiceDescriptors: {
    fontSize: 13,
    color: '#999',
    textTransform: 'lowercase',
    lineHeight: 18,
    fontFamily: 'EBGaramond-Regular',
  },
  voiceDescriptorsActive: {
    color: '#666',
  },
  voicePlayButton: {
    alignSelf: 'flex-end',
    padding: 4,
  },
  voiceSelectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  changeVoiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
  },
  changeVoiceText: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
});
