import AmbientPicker from '@/components/AmbientPicker';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { db } from '@/config/firebase';
import { useStoryQueue } from '@/contexts/StoryQueueContext';
import { useTheme } from '@/contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Keyboard,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

type RegenerateStep = 'options' | 'content' | 'name' | 'voice' | 'narration';

export default function RegenerateScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useTheme();
  
  const { addToQueue } = useStoryQueue();

  // Source of the original story so we can clone its recipe
  const storyId = (params.storyId as string) || '';
  const isPublic = params.isPublic === 'true';

  const [currentStep, setCurrentStep] = useState<RegenerateStep>('options');
  const [changeContent, setChangeContent] = useState(false);
  const [changeName, setChangeName] = useState(false);
  const [changeVoice, setChangeVoice] = useState(false);
  // Public-story-only: swap the publisher's name for the listener's
  const [useMyName, setUseMyName] = useState(isPublic);

  // Content changes
  const [contentChanges, setContentChanges] = useState('');

  // Name changes
  const [newName, setNewName] = useState('');

  // Voice changes
  const [newVoiceId, setNewVoiceId] = useState<string | null>(null);

  // Narration details
  const [duration, setDuration] = useState<'5min' | '10min' | '15min'>('10min');
  const [narrativeRatio, _setNarrativeRatio] = useState(5);
  const [ambientPrompts, setAmbientPrompts] = useState<string[]>([]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [storedUserName, setStoredUserName] = useState('You');
  const [originalRecipe, setOriginalRecipe] = useState<any | null>(null);

  // Hydrate the stored name once so 'use my name' has something to swap in.
  useEffect(() => {
    AsyncStorage.getItem('userName').then((v) => {
      if (v) setStoredUserName(v);
    });
  }, []);

  // Pull the source story so the regenerate flow has the original recipe to
  // mutate. Try the user's stories first, then publicStories.
  useEffect(() => {
    if (!storyId) return;
    let cancelled = false;
    (async () => {
      try {
        const [userSnap, pubSnap] = await Promise.all([
          getDoc(doc(db, 'stories', storyId)).catch(() => null),
          getDoc(doc(db, 'publicStories', storyId)).catch(() => null),
        ]);
        const snap = userSnap?.exists() ? userSnap : pubSnap?.exists() ? pubSnap : null;
        if (!snap || cancelled) return;
        const data = snap.data() as any;
        setOriginalRecipe(data);
        // Pre-fill the controls so the user only edits what they want.
        if (typeof data.duration === 'string' && /^(5|10|15)min$/.test(data.duration)) {
          setDuration(data.duration);
        }
        if (typeof data.narrativeRatio === 'number') _setNarrativeRatio(data.narrativeRatio);
        if (typeof data.userName === 'string') setNewName(data.userName);
        if (typeof data.voiceId === 'string') setNewVoiceId(data.voiceId);
        if (Array.isArray(data.ambientPrompts)) setAmbientPrompts(data.ambientPrompts);
      } catch (e) {
        console.warn('[regenerate] could not load source story', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  // Whether the action button can submit. Need at least the source recipe.
  const canRegenerate = useMemo(() => !!originalRecipe, [originalRecipe]);

  // Receive voice selection back from voice-library
  useEffect(() => {
    const voiceId = params.selectedVoiceId as string | undefined;
    if (voiceId) {
      setNewVoiceId(voiceId);
      setCurrentStep('narration');
    }
  }, [params.selectedVoiceId]);

  const openVoiceLibrary = () => {
    router.push({
      pathname: '/voice-library' as any,
      params: {
        genderHint: '',
        userName: newName || 'you',
      },
    });
  };

  const handleOptionsSubmit = () => {
    if (changeContent) {
      setCurrentStep('content');
    } else if (changeName) {
      setCurrentStep('name');
    } else if (changeVoice) {
      openVoiceLibrary();
    } else {
      setCurrentStep('narration');
    }
  };

  const handleContentSubmit = () => {
    if (changeName) {
      setCurrentStep('name');
    } else if (changeVoice) {
      openVoiceLibrary();
    } else {
      setCurrentStep('narration');
    }
  };

  const handleNameSubmit = () => {
    if (changeVoice) {
      openVoiceLibrary();
    } else {
      setCurrentStep('narration');
    }
  };

  const handleRegenerate = async () => {
    if (!originalRecipe) {
      Alert.alert('still loading', 'wait a moment for the original story to load.');
      return;
    }
    setIsProcessing(true);
    try {
      // Clone the original recipe and apply the user's edits. Keep undefined
      // off the wire — Firestore rejects undefined values when the queue doc
      // is written.
      const resolvedName = changeName && newName.trim()
        ? newName.trim()
        : isPublic && useMyName
          ? storedUserName
          : (originalRecipe.userName || storedUserName);

      const additionalPrompt = changeContent && contentChanges.trim()
        ? `${(originalRecipe.prompt || '').trim()}\n\nuser-requested changes: ${contentChanges.trim()}`.trim()
        : (originalRecipe.prompt || '');

      const recipe: any = {
        setting: originalRecipe.setting || '',
        location: originalRecipe.location || '',
        character: originalRecipe.character || '',
        genderSelf: originalRecipe.genderSelf || '',
        genderOther: originalRecipe.genderOther || '',
        trope: originalRecipe.trope || '',
        features: Array.isArray(originalRecipe.features) ? originalRecipe.features : [],
        featurePreferences: originalRecipe.featurePreferences || {},
        isNighttime: !!originalRecipe.isNighttime,
        userName: resolvedName,
        duration,
        narrativeRatio,
        voiceId: changeVoice && newVoiceId ? newVoiceId : (originalRecipe.voiceId || ''),
        prompt: additionalPrompt,
        tags: Array.isArray(originalRecipe.tags) ? originalRecipe.tags : [],
        coverColor: originalRecipe.coverColor || '',
        ambientPrompts,
      };
      if (originalRecipe.narratorId) recipe.narratorId = originalRecipe.narratorId;
      if (originalRecipe.narratorData) recipe.narratorData = originalRecipe.narratorData;

      await addToQueue(recipe, [], []);
      router.replace('/(tabs)/vault');
    } catch (e: any) {
      console.error('[regenerate] failed', e);
      Alert.alert('regenerate failed', e?.message || 'please try again');
    } finally {
      setIsProcessing(false);
    }
  };

  if (currentStep === 'options') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>regenerate story</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>choose what you&apos;d like to change</Text>
          </View>

          {isPublic && (
            <TouchableOpacity
              style={[
                styles.optionCard,
                { backgroundColor: colors.card, borderColor: colors.border },
                useMyName && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground },
              ]}
              onPress={() => setUseMyName(!useMyName)}
            >
              <View style={styles.optionContent}>
                <IconSymbol name="person.crop.circle" size={24} color={useMyName ? colors.buttonText : colors.textSecondary} />
                <View style={styles.optionText}>
                  <Text style={[styles.optionTitle, { color: colors.text }, useMyName && { color: colors.buttonText }]}>
                    use my name
                  </Text>
                  <Text style={[styles.optionSubtitle, { color: colors.textSecondary }, useMyName && { color: colors.buttonText, opacity: 0.7 }]}>
                    swap in &ldquo;{storedUserName}&rdquo; in place of the original listener&apos;s name
                  </Text>
                </View>
              </View>
              {useMyName && <IconSymbol name="checkmark.circle.fill" size={24} color={colors.buttonText} />}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.optionCard, { backgroundColor: colors.card, borderColor: colors.border }, changeContent && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground }]}
            onPress={() => setChangeContent(!changeContent)}
          >
            <View style={styles.optionContent}>
              <IconSymbol name="wand.and.stars" size={24} color={changeContent ? colors.buttonText : colors.textSecondary} />
              <View style={styles.optionText}>
                <Text style={[styles.optionTitle, { color: colors.text }, changeContent && { color: colors.buttonText }]}>
                  change content
                </Text>
                <Text style={[styles.optionSubtitle, { color: colors.textSecondary }, changeContent && { color: colors.buttonText, opacity: 0.7 }]}>
                  modify setting, atmosphere, or story details
                </Text>
              </View>
            </View>
            {changeContent && <IconSymbol name="checkmark.circle.fill" size={24} color={colors.buttonText} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionCard, { backgroundColor: colors.card, borderColor: colors.border }, changeName && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground }]}
            onPress={() => setChangeName(!changeName)}
          >
            <View style={styles.optionContent}>
              <IconSymbol name="person.fill" size={24} color={changeName ? colors.buttonText : colors.textSecondary} />
              <View style={styles.optionText}>
                <Text style={[styles.optionTitle, { color: colors.text }, changeName && { color: colors.buttonText }]}>
                  change my name
                </Text>
                <Text style={[styles.optionSubtitle, { color: colors.textSecondary }, changeName && { color: colors.buttonText, opacity: 0.7 }]}>
                  update how you&apos;re addressed in the audio
                </Text>
              </View>
            </View>
            {changeName && <IconSymbol name="checkmark.circle.fill" size={24} color={colors.buttonText} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionCard, { backgroundColor: colors.card, borderColor: colors.border }, changeVoice && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground }]}
            onPress={() => setChangeVoice(!changeVoice)}
          >
            <View style={styles.optionContent}>
              <IconSymbol name="waveform" size={24} color={changeVoice ? colors.buttonText : colors.textSecondary} />
              <View style={styles.optionText}>
                <Text style={[styles.optionTitle, { color: colors.text }, changeVoice && { color: colors.buttonText }]}>
                  change voice
                </Text>
                <Text style={[styles.optionSubtitle, { color: colors.textSecondary }, changeVoice && { color: colors.buttonText, opacity: 0.7 }]}>
                  select a different narrator voice
                </Text>
              </View>
            </View>
            {changeVoice && <IconSymbol name="checkmark.circle.fill" size={24} color={colors.buttonText} />}
          </TouchableOpacity>
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[
              styles.continueButton,
              { backgroundColor: colors.buttonBackground },
              !(changeContent || changeName || changeVoice || useMyName) && styles.continueButtonDisabled,
            ]}
            onPress={handleOptionsSubmit}
            disabled={!(changeContent || changeName || changeVoice || useMyName)}
          >
            <Text style={[styles.continueButtonText, { color: colors.buttonText }]}>continue</Text>
            <IconSymbol name="arrow.right" size={20} color={colors.buttonText} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (currentStep === 'content') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => setCurrentStep('options')}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>describe your changes</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>tell us what you&apos;d like to change</Text>
          </View>

          <TextInput
            style={[styles.textArea, { backgroundColor: colors.card, color: colors.text }]}
            placeholder="e.g., make it more romantic, change the setting to a beach, add more tension..."
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={8}
            value={contentChanges}
            onChangeText={setContentChanges}
            textAlignVertical="top"
            blurOnSubmit
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity 
            style={[styles.continueButton, { backgroundColor: colors.buttonBackground }, !contentChanges.trim() && styles.continueButtonDisabled]}
            onPress={handleContentSubmit}
            disabled={!contentChanges.trim()}
          >
            <Text style={[styles.continueButtonText, { color: colors.buttonText }]}>continue</Text>
            <IconSymbol name="arrow.right" size={20} color={colors.buttonText} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (currentStep === 'name') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => setCurrentStep(changeContent ? 'content' : 'options')}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>what&apos;s your name?</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>enter the name you&apos;d like to be called</Text>
          </View>

          <TextInput
            style={[styles.nameInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            placeholder="your name"
            placeholderTextColor={colors.textSecondary}
            value={newName}
            onChangeText={setNewName}
            autoFocus
          />
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity 
            style={[styles.continueButton, { backgroundColor: colors.buttonBackground }, !newName.trim() && styles.continueButtonDisabled]}
            onPress={handleNameSubmit}
            disabled={!newName.trim()}
          >
            <Text style={[styles.continueButtonText, { color: colors.buttonText }]}>continue</Text>
            <IconSymbol name="arrow.right" size={20} color={colors.buttonText} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Narration details step
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <TouchableOpacity style={styles.backButton} onPress={() => setCurrentStep(changeName ? 'name' : (changeContent ? 'content' : 'options'))}>
        <IconSymbol name="chevron.left" size={28} color={colors.text} />
      </TouchableOpacity>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>narration details</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>customize duration and style</Text>
        </View>

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
          <Text style={[styles.durationLabel, { color: colors.text }]}>narrative style</Text>
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
            onValueChange={_setNarrativeRatio}
            minimumTrackTintColor={colors.buttonBackground}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.buttonBackground}
          />
          <Text style={[styles.sliderHint, { color: colors.textSecondary }]}>slide to adjust descriptive vs. direct content</Text>
        </View>

        <View style={{ paddingHorizontal: 24, marginBottom: 24 }}>
          <AmbientPicker
            context={{
              setting: (params.setting as string) || '',
              location: (params.location as string) || '',
              character: (params.character as string) || '',
              trope: (params.trope as string) || '',
              prompt: (params.prompt as string) || '',
            }}
            selected={ambientPrompts}
            onChange={setAmbientPrompts}
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.continueButton,
            { backgroundColor: colors.buttonBackground },
            (!canRegenerate || isProcessing) && styles.continueButtonDisabled,
          ]}
          onPress={handleRegenerate}
          disabled={!canRegenerate || isProcessing}
        >
          {isProcessing ? (
            <Text style={[styles.continueButtonText, { color: colors.buttonText }]}>regenerating...</Text>
          ) : (
            <>
              <IconSymbol name="sparkles" size={20} color={colors.buttonText} />
              <Text style={[styles.continueButtonText, { color: colors.buttonText }]}>
                {canRegenerate ? 'regenerate' : 'loading source story…'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    paddingTop: 80,
    paddingBottom: 100,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '500',
    marginBottom: 8,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  optionCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flex: 1,
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 4,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  optionSubtitle: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  textArea: {
    borderRadius: 20,
    padding: 16,
    fontSize: 16,
    fontFamily: 'EBGaramond-Regular',
    minHeight: 200,
  },
  nameInput: {
    borderRadius: 20,
    padding: 16,
    fontSize: 18,
    fontFamily: 'EBGaramond-Medium',
    borderWidth: 1,
  },
  placeholderText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
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
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sliderLabelText: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
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
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 999,
    width: '100%',
    maxWidth: 552,
  },
  continueButtonDisabled: {
    opacity: 0.3,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '500',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  voiceHeader: {
    marginTop: 80,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  voiceTitle: {
    fontSize: 24,
    color: '#fff',
    fontWeight: '600',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  voiceSubtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    textTransform: 'lowercase',
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
  },
  voiceGenderTabTextActive: {
    color: '#000',
  },
  voiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 120,
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
  },
  voiceAccentActive: {
    color: '#000',
  },
  voiceDescriptors: {
    fontSize: 13,
    color: '#999',
    textTransform: 'lowercase',
    lineHeight: 18,
  },
  voiceDescriptorsActive: {
    color: '#666',
  },
  voicePlayButton: {
    alignSelf: 'flex-end',
    padding: 4,
  },
  voiceFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: '#000',
  },
  voiceContinueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6B6B7B',
    paddingVertical: 16,
    borderRadius: 999,
  },
  voiceContinueText: {
    fontSize: 16,
    color: '#fff',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
});
