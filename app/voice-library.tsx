import { IconSymbol } from '@/components/ui/icon-symbol';
import { fetchStaticVoices } from '@/constants/voices';
import { useTheme } from '@/contexts/ThemeContext';
import { deleteCustomVoice, saveCustomVoice, subscribeToCustomVoices } from '@/services/voice-service';
import { CustomVoice, Voice } from '@/types/voice';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Screen = 'library' | 'design' | 'preview';

const VOICE_GENDERS = ['female', 'male', 'androgynous'] as const;
const VOICE_AGES = ['young adult', 'middle-aged', 'elderly', 'other'] as const;
const VOICE_TAGS = [
  'whispery', 'serious', 'playful', 'assertive', 'seductive',
  'warm', 'deep', 'high-pitched', 'gravelly', 'nasal',
] as const;

interface VoicePreview {
  generated_voice_id: string;
  audio_base_64: string;
  media_type: string;
  duration_secs: number;
}

export default function VoiceLibraryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors } = useTheme();
  const ELEVENLABS_API_KEY = Constants.expoConfig?.extra?.ELEVENLABS || '';

  // Params from caller
  const callerGenderHint = (params.genderHint as string) || '';
  const userName = (params.userName as string) || 'you';

  // Screen state
  const [screen, setScreen] = useState<Screen>('library');
  const [activeGenderTab, setActiveGenderTab] = useState<'male' | 'female' | 'neutral'>('neutral');

  // Custom voices from Firestore
  const [staticVoices, setStaticVoices] = useState<Voice[]>([]);
  const [isLoadingStatic, setIsLoadingStatic] = useState(true);
  const [customVoices, setCustomVoices] = useState<CustomVoice[]>([]);
  const [isLoadingCustom, setIsLoadingCustom] = useState(true);

  // Selected voice
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [selectedIsCustom, setSelectedIsCustom] = useState(false);

  // Audio playback
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  // Voice design state
  const [voiceName, setVoiceName] = useState('');
  const [voiceGender, setVoiceGender] = useState<typeof VOICE_GENDERS[number] | null>(null);
  const [voiceAccent, setVoiceAccent] = useState('');
  const [voiceAge, setVoiceAge] = useState<typeof VOICE_AGES[number] | null>(null);
  const [voiceAgeCustom, setVoiceAgeCustom] = useState('');
  const [voiceTags, setVoiceTags] = useState<string[]>([]);
  const [voiceTagCustom, setVoiceTagCustom] = useState('');
  const [voiceOtherNotes, setVoiceOtherNotes] = useState('');

  // Voice preview generation
  const [voicePreviews, setVoicePreviews] = useState<VoicePreview[]>([]);
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null);
  const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);
  const [isSavingVoice, setIsSavingVoice] = useState(false);

  // Regenerate modal
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [regenerateNotes, setRegenerateNotes] = useState('');

  // Set initial gender tab based on caller hint
  useEffect(() => {
    if (callerGenderHint === 'male') setActiveGenderTab('male');
    else if (callerGenderHint === 'female') setActiveGenderTab('female');
    else setActiveGenderTab('neutral');
  }, [callerGenderHint]);

  // Fetch static voices from Firestore
  useEffect(() => {
    fetchStaticVoices().then((voices) => {
      setStaticVoices(voices);
      setIsLoadingStatic(false);
    });
  }, []);

  // Subscribe to custom voices
  useEffect(() => {
    const unsubscribe = subscribeToCustomVoices((voices) => {
      setCustomVoices(voices);
      setIsLoadingCustom(false);
    });
    return unsubscribe;
  }, []);

  // Cleanup sound
  useEffect(() => {
    return sound ? () => { sound.unloadAsync(); } : undefined;
  }, [sound]);

  // Filter static voices by gender tab
  const filteredStaticVoices = useMemo(
    () => staticVoices.filter((v) => v.gender === activeGenderTab),
    [staticVoices, activeGenderTab]
  );

  // Filter custom voices by gender tab
  const filteredCustomVoices = useMemo(
    () => customVoices.filter((v) => v.gender === activeGenderTab),
    [customVoices, activeGenderTab]
  );

  // ─── Audio playback ───────────────────────────────────────────────

  const playStaticVoicePreview = async (voiceId: string) => {
    try {
      if (sound) { await sound.stopAsync(); await sound.unloadAsync(); setSound(null); }
      if (playingVoiceId === voiceId) { setPlayingVoiceId(null); return; }

      setPlayingVoiceId(voiceId);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY },
        body: JSON.stringify({
          text: `Hello, ${userName}`,
          model_id: 'eleven_v3',
          voice_settings: { stability: 0.5, similarity_boost: 0.5 },
        }),
      });

      if (!response.ok) throw new Error('Failed to generate voice preview');

      const audioBlob = await response.blob();
      const reader = new FileReader();
      const base64Audio = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(audioBlob);
      });

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: base64Audio },
        { shouldPlay: true },
        (status) => { if (status.isLoaded && status.didJustFinish) setPlayingVoiceId(null); },
      );
      setSound(newSound);
    } catch (error) {
      console.error('Error playing voice preview:', error);
      setPlayingVoiceId(null);
    }
  };

  const playCustomVoicePreview = async (voice: CustomVoice) => {
    if (voice.previewAudioBase64) {
      try {
        if (sound) { await sound.stopAsync(); await sound.unloadAsync(); setSound(null); }
        if (playingVoiceId === voice.voiceId) { setPlayingVoiceId(null); return; }

        setPlayingVoiceId(voice.voiceId);
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });

        const audioUri = `data:audio/mpeg;base64,${voice.previewAudioBase64}`;
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: audioUri },
          { shouldPlay: true },
          (status) => { if (status.isLoaded && status.didJustFinish) setPlayingVoiceId(null); },
        );
        setSound(newSound);
      } catch (error) {
        console.error('Error playing custom voice preview:', error);
        setPlayingVoiceId(null);
      }
    } else {
      // Fallback to TTS API
      await playStaticVoicePreview(voice.voiceId);
    }
  };

  const playDesignPreview = async (preview: VoicePreview) => {
    try {
      if (sound) { await sound.stopAsync(); await sound.unloadAsync(); setSound(null); }
      if (playingVoiceId === preview.generated_voice_id) { setPlayingVoiceId(null); return; }

      setPlayingVoiceId(preview.generated_voice_id);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const audioUri = `data:${preview.media_type};base64,${preview.audio_base_64}`;
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true },
        (status) => { if (status.isLoaded && status.didJustFinish) setPlayingVoiceId(null); },
      );
      setSound(newSound);
    } catch (error) {
      console.error('Error playing design preview:', error);
      setPlayingVoiceId(null);
    }
  };

  // ─── Voice selection ──────────────────────────────────────────────

  const handleSelectVoice = (voiceId: string, isCustom: boolean) => {
    setSelectedVoiceId(voiceId);
    setSelectedIsCustom(isCustom);
  };

  const handleConfirmSelection = () => {
    if (!selectedVoiceId) return;
    router.back();
    // Use setTimeout to ensure navigation completes before params are read
    setTimeout(() => {
      router.setParams({ selectedVoiceId: selectedVoiceId });
    }, 50);
  };

  // ─── Voice design ─────────────────────────────────────────────────

  const toggleVoiceTag = (tag: string) => {
    setVoiceTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= 4) return prev;
      return [...prev, tag];
    });
  };

  const addCustomTag = () => {
    const trimmed = voiceTagCustom.trim().toLowerCase();
    if (trimmed && !voiceTags.includes(trimmed) && voiceTags.length < 4) {
      setVoiceTags((prev) => [...prev, trimmed]);
      setVoiceTagCustom('');
    }
  };

  const buildVoiceDescription = () => {
    const age = voiceAge === 'other' ? voiceAgeCustom.trim() : voiceAge;
    const parts: string[] = [];
    if (age) parts.push(`age: ${age}`);
    if (voiceGender) parts.push(`gender: ${voiceGender}`);
    if (voiceAccent.trim()) parts.push(`accent: ${voiceAccent.trim()}`);
    if (voiceTags.length > 0) parts.push(`features: ${voiceTags.join(', ')}`);
    if (voiceOtherNotes.trim()) parts.push(voiceOtherNotes.trim());
    const built = parts.join('; ');
    // ElevenLabs /text-to-voice/design requires voice_description ≥20 chars.
    // A minimal selection ("gender: female") is under that, so prepend a
    // natural descriptor to guarantee a valid, non-empty prompt.
    const LEAD = 'a warm, natural, expressive narrating voice';
    return built.length >= 20 ? built : built ? `${LEAD}; ${built}` : LEAD;
  };

  const generateVoicePreviews = async (additionalNotes?: string) => {
    setIsGeneratingPreviews(true);
    setVoicePreviews([]);
    setSelectedPreviewId(null);

    try {
      let voiceDescription = buildVoiceDescription();
      if (additionalNotes?.trim()) {
        voiceDescription += `; additional feedback: ${additionalNotes.trim()}`;
      }

      const response = await fetch('https://api.elevenlabs.io/v1/text-to-voice/design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY },
        body: JSON.stringify({
          voice_description: voiceDescription,
          // ElevenLabs /text-to-voice/design requires text of 100–1000 chars.
          // Keep the body ≥100 chars regardless of how short the name is.
          text: `Hello ${userName}. Settle in and let yourself relax — tonight's story is just for you. I'll be right here with you the whole way through, soft and close. So close your eyes, take a slow breath, and let yourself sink into it.`,
          model_id: 'eleven_ttv_v3',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Voice design API error:', response.status, errorText);
        alert(`API Error ${response.status}: ${errorText}`);
        throw new Error('Failed to generate voice previews');
      }

      const data = await response.json();
      const previews = data.previews || [data];

      if (previews?.length > 0 && previews[0].generated_voice_id) {
        setVoicePreviews(previews);
        setScreen('preview');
      } else {
        alert('No voice previews generated. Try adjusting your description.');
      }
    } catch (error) {
      console.error('Error generating voice previews:', error);
      alert('Failed to generate voice previews. Please try again.');
    } finally {
      setIsGeneratingPreviews(false);
    }
  };

  const handleRegenerateWithNotes = async () => {
    setShowRegenerateModal(false);
    await generateVoicePreviews(regenerateNotes);
    setRegenerateNotes('');
  };

  const handleSaveAndSelectVoice = async () => {
    if (!selectedPreviewId) return;
    setIsSavingVoice(true);

    try {
      // 1. Save the generated voice to ElevenLabs to get a permanent ID
      const saveResponse = await fetch('https://api.elevenlabs.io/v1/text-to-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY },
        body: JSON.stringify({
          voice_name: voiceName.trim() || `custom voice ${Date.now()}`,
          voice_description: buildVoiceDescription(),
          generated_voice_id: selectedPreviewId,
        }),
      });

      if (!saveResponse.ok) {
        const errorText = await saveResponse.text();
        throw new Error(`Failed to save voice: ${errorText}`);
      }

      const saveData = await saveResponse.json();
      const permanentVoiceId = saveData.voice_id;

      if (!permanentVoiceId) {
        throw new Error('Voice was created but no ID was returned.');
      }

      // 2. Get the preview audio for caching
      const selectedPreview = voicePreviews.find((p) => p.generated_voice_id === selectedPreviewId);

      // 3. Save to Firestore
      const resolvedGender: 'male' | 'female' | 'neutral' =
        voiceGender === 'male' ? 'male' :
        voiceGender === 'female' ? 'female' : 'neutral';

      await saveCustomVoice({
        voiceId: permanentVoiceId,
        name: voiceName.trim() || 'custom voice',
        gender: resolvedGender,
        accent: voiceAccent.trim(),
        descriptors: voiceTags.join(', '),
        voiceDesignDescription: buildVoiceDescription(),
        previewAudioBase64: selectedPreview?.audio_base_64,
      });

      // 4. Return to caller with the permanent voice ID
      router.back();
      setTimeout(() => {
        router.setParams({ selectedVoiceId: permanentVoiceId });
      }, 50);
    } catch (error: any) {
      console.error('Error saving voice:', error);
      alert(`Failed to save voice: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSavingVoice(false);
    }
  };

  const handleDeleteCustomVoice = (voice: CustomVoice) => {
    Alert.alert(
      'delete voice?',
      `are you sure you want to delete "${voice.name}"?`,
      [
        { text: 'cancel', style: 'cancel' },
        {
          text: 'delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCustomVoice(voice.id);
            } catch (error) {
              console.error('Error deleting voice:', error);
            }
          },
        },
      ]
    );
  };

  const resetDesignState = () => {
    setVoiceName('');
    setVoiceGender(null);
    setVoiceAccent('');
    setVoiceAge(null);
    setVoiceAgeCustom('');
    setVoiceTags([]);
    setVoiceTagCustom('');
    setVoiceOtherNotes('');
    setVoicePreviews([]);
    setSelectedPreviewId(null);
  };

  // ─── Render: Voice Design Preview (select from generated options) ─

  if (screen === 'preview') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => setScreen('design')}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>select voice</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              preview and choose your favorite
            </Text>
          </View>

          {/* Voice name input */}
          <View style={styles.inputSection}>
            <Text style={[styles.label, { color: colors.text }]}>voice name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, color: colors.text }]}
              value={voiceName}
              onChangeText={setVoiceName}
              placeholder="e.g., low and warm, soft whisper..."
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.voiceCards}>
            {voicePreviews.map((preview, index) => (
              <TouchableOpacity
                key={preview.generated_voice_id}
                style={[
                  styles.voiceCard,
                  { backgroundColor: colors.card },
                  selectedPreviewId === preview.generated_voice_id && styles.voiceCardActive,
                ]}
                onPress={() => setSelectedPreviewId(preview.generated_voice_id)}
              >
                <View style={styles.voiceCardContent}>
                  <Text style={[
                    styles.voiceCardTitle,
                    { color: colors.text },
                    selectedPreviewId === preview.generated_voice_id && styles.voiceCardTextActive,
                  ]}>
                    voice option {index + 1}
                  </Text>
                  <Text style={[
                    styles.voiceCardSub,
                    { color: colors.textSecondary },
                    selectedPreviewId === preview.generated_voice_id && styles.voiceCardTextActive,
                  ]}>
                    {Math.round(preview.duration_secs)}s preview
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.playButton}
                  onPress={(e) => { e.stopPropagation(); playDesignPreview(preview); }}
                >
                  <IconSymbol
                    name={playingVoiceId === preview.generated_voice_id ? 'pause.fill' : 'play.fill'}
                    size={20}
                    color={selectedPreviewId === preview.generated_voice_id ? '#fff' : colors.text}
                  />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>

          {/* Regenerate button */}
          <TouchableOpacity
            style={[styles.regenerateButton, { borderColor: colors.border }]}
            onPress={() => setShowRegenerateModal(true)}
          >
            <IconSymbol name="arrow.triangle.2.circlepath" size={16} color={colors.textSecondary} />
            <Text style={[styles.regenerateText, { color: colors.textSecondary }]}>regenerate with feedback</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.continueButton, (!selectedPreviewId || isSavingVoice) && styles.continueButtonDisabled]}
            onPress={handleSaveAndSelectVoice}
            disabled={!selectedPreviewId || isSavingVoice}
          >
            {isSavingVoice ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.continueButtonText}>save & select</Text>
                <IconSymbol name="checkmark" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Regenerate modal */}
        <Modal visible={showRegenerateModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>regenerate voice</Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                what would you like to change?
              </Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                value={regenerateNotes}
                onChangeText={setRegenerateNotes}
                placeholder="e.g., make it deeper, more breathy..."
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={3}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.background }]}
                  onPress={() => setShowRegenerateModal(false)}
                >
                  <Text style={[styles.modalButtonText, { color: colors.text }]}>cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: '#007AFF' }]}
                  onPress={handleRegenerateWithNotes}
                >
                  <Text style={[styles.modalButtonText, { color: '#fff' }]}>regenerate</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ─── Render: Voice Design (create new voice) ──────────────────────

  if (screen === 'design') {
    const canGenerate = voiceGender !== null;

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => { resetDesignState(); setScreen('library'); }}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.content, { paddingBottom: 200 }]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>design a voice</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              describe the voice you want to create
            </Text>
          </View>

          {/* Gender */}
          <View style={styles.inputSection}>
            <Text style={[styles.label, { color: colors.text }]}>voice gender</Text>
            <View style={styles.pillsRow}>
              {VOICE_GENDERS.map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.pill, { backgroundColor: colors.card, borderColor: colors.border }, voiceGender === g && styles.pillActive]}
                  onPress={() => setVoiceGender(g)}
                >
                  <Text style={[styles.pillText, { color: colors.textSecondary }, voiceGender === g && styles.pillTextActive]}>
                    {g}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Age */}
          <View style={styles.inputSection}>
            <Text style={[styles.label, { color: colors.text }]}>age range</Text>
            <View style={styles.pillsRow}>
              {VOICE_AGES.map((a) => (
                <TouchableOpacity
                  key={a}
                  style={[styles.pill, { backgroundColor: colors.card, borderColor: colors.border }, voiceAge === a && styles.pillActive]}
                  onPress={() => setVoiceAge(a)}
                >
                  <Text style={[styles.pillText, { color: colors.textSecondary }, voiceAge === a && styles.pillTextActive]}>
                    {a}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {voiceAge === 'other' && (
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, color: colors.text, marginTop: 8 }]}
                value={voiceAgeCustom}
                onChangeText={setVoiceAgeCustom}
                placeholder="specify age range"
                placeholderTextColor={colors.textSecondary}
              />
            )}
          </View>

          {/* Accent */}
          <View style={styles.inputSection}>
            <Text style={[styles.label, { color: colors.text }]}>accent (optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, color: colors.text }]}
              value={voiceAccent}
              onChangeText={setVoiceAccent}
              placeholder="e.g., British, Australian, Southern..."
              placeholderTextColor={colors.textSecondary}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>

          {/* Voice tags */}
          <View style={styles.inputSection}>
            <Text style={[styles.label, { color: colors.text }]}>voice characteristics (up to 4)</Text>
            <View style={styles.tagsGrid}>
              {VOICE_TAGS.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  style={[
                    styles.tagPill,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    voiceTags.includes(tag) && styles.tagPillActive,
                  ]}
                  onPress={() => toggleVoiceTag(tag)}
                >
                  <Text style={[
                    styles.tagPillText,
                    { color: colors.textSecondary },
                    voiceTags.includes(tag) && styles.tagPillTextActive,
                  ]}>
                    {tag}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Custom tag input */}
            <View style={styles.customTagRow}>
              <TextInput
                style={[styles.customTagInput, { backgroundColor: colors.card, color: colors.text }]}
                value={voiceTagCustom}
                onChangeText={setVoiceTagCustom}
                placeholder="add custom tag..."
                placeholderTextColor={colors.textSecondary}
                returnKeyType="done"
                onSubmitEditing={addCustomTag}
              />
              <TouchableOpacity
                style={[styles.addTagButton, (!voiceTagCustom.trim() || voiceTags.length >= 4) && { opacity: 0.3 }]}
                onPress={addCustomTag}
                disabled={!voiceTagCustom.trim() || voiceTags.length >= 4}
              >
                <IconSymbol name="plus.circle.fill" size={28} color="#007AFF" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Additional notes */}
          <View style={styles.inputSection}>
            <Text style={[styles.label, { color: colors.text }]}>additional notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.card, color: colors.text }]}
              value={voiceOtherNotes}
              onChangeText={setVoiceOtherNotes}
              placeholder="any other details about the voice..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={3}
              blurOnSubmit
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.continueButton, (!canGenerate || isGeneratingPreviews) && styles.continueButtonDisabled]}
            onPress={() => generateVoicePreviews()}
            disabled={!canGenerate || isGeneratingPreviews}
          >
            {isGeneratingPreviews ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.continueButtonText}>generating...</Text>
              </>
            ) : (
              <>
                <IconSymbol name="sparkles" size={18} color="#fff" />
                <Text style={styles.continueButtonText}>generate previews</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Render: Voice Library (main screen) ──────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <IconSymbol name="chevron.left" size={28} color={colors.text} />
      </TouchableOpacity>

      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>voice library</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          choose a voice or create your own
        </Text>
      </View>

      {/* Gender tabs */}
      <View style={styles.genderTabs}>
        {(['female', 'male', 'neutral'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.genderTab, activeGenderTab === tab && styles.genderTabActive]}
            onPress={() => setActiveGenderTab(tab)}
          >
            <Text style={[styles.genderTabText, activeGenderTab === tab && styles.genderTabTextActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={[styles.content, { paddingBottom: 120 }]}>
        {/* Create new voice button */}
        <TouchableOpacity
          style={[styles.createVoiceButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setScreen('design')}
        >
          <View style={styles.createVoiceIcon}>
            <IconSymbol name="plus" size={24} color="#007AFF" />
          </View>
          <View style={styles.createVoiceInfo}>
            <Text style={[styles.createVoiceTitle, { color: colors.text }]}>create a new voice</Text>
            <Text style={[styles.createVoiceSub, { color: colors.textSecondary }]}>
              design a custom voice
            </Text>
          </View>
          <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* My Voices section */}
        {filteredCustomVoices.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>my voices</Text>
            {filteredCustomVoices.map((voice) => (
              <TouchableOpacity
                key={voice.id}
                style={[
                  styles.voiceRow,
                  { backgroundColor: colors.card },
                  selectedVoiceId === voice.voiceId && selectedIsCustom && styles.voiceRowActive,
                ]}
                onPress={() => handleSelectVoice(voice.voiceId, true)}
                onLongPress={() => handleDeleteCustomVoice(voice)}
              >
                <View style={styles.voiceRowInfo}>
                  <Text style={[
                    styles.voiceRowName,
                    { color: colors.text },
                    selectedVoiceId === voice.voiceId && selectedIsCustom && styles.voiceRowTextActive,
                  ]}>
                    {voice.name}
                  </Text>
                  <Text style={[
                    styles.voiceRowDesc,
                    { color: colors.textSecondary },
                    selectedVoiceId === voice.voiceId && selectedIsCustom && styles.voiceRowTextActive,
                  ]}>
                    {[voice.accent, voice.descriptors].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.playButton}
                  onPress={(e) => { e.stopPropagation(); playCustomVoicePreview(voice); }}
                >
                  {playingVoiceId === voice.voiceId ? (
                    <ActivityIndicator size="small" color={selectedVoiceId === voice.voiceId && selectedIsCustom ? '#fff' : colors.text} />
                  ) : (
                    <IconSymbol
                      name="play.circle.fill"
                      size={28}
                      color={selectedVoiceId === voice.voiceId && selectedIsCustom ? '#fff' : colors.text}
                    />
                  )}
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}


        {/* Static Voices section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>suggested</Text>
          {filteredStaticVoices.map((voice) => (
            <TouchableOpacity
              key={voice.id}
              style={[
                styles.voiceRow,
                { backgroundColor: colors.card },
                selectedVoiceId === voice.id && !selectedIsCustom && styles.voiceRowActive,
              ]}
              onPress={() => handleSelectVoice(voice.id, false)}
            >
              <View style={styles.voiceRowInfo}>
                <Text style={[
                  styles.voiceRowName,
                  { color: colors.text },
                  selectedVoiceId === voice.id && !selectedIsCustom && styles.voiceRowTextActive,
                ]}>
                  {voice.accent}
                </Text>
                <Text style={[
                  styles.voiceRowDesc,
                  { color: colors.textSecondary },
                  selectedVoiceId === voice.id && !selectedIsCustom && styles.voiceRowTextActive,
                ]}>
                  {voice.descriptors.join(', ')}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.playButton}
                onPress={(e) => { e.stopPropagation(); playStaticVoicePreview(voice.id); }}
              >
                {playingVoiceId === voice.id ? (
                  <ActivityIndicator size="small" color={selectedVoiceId === voice.id && !selectedIsCustom ? '#fff' : colors.text} />
                ) : (
                  <IconSymbol
                    name="play.circle.fill"
                    size={28}
                    color={selectedVoiceId === voice.id && !selectedIsCustom ? '#fff' : colors.text}
                  />
                )}
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Confirm selection footer */}
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.continueButton, !selectedVoiceId && styles.continueButtonDisabled]}
          onPress={handleConfirmSelection}
          disabled={!selectedVoiceId}
        >
          <Text style={styles.continueButtonText}>select voice</Text>
          <IconSymbol name="checkmark" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignSelf: 'flex-start',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    marginTop: 4,
  },

  // Gender tabs
  genderTabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 8,
  },
  genderTab: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  genderTabActive: {
    backgroundColor: '#fff',
  },
  genderTabText: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
    color: '#999',
  },
  genderTabTextActive: {
    color: '#000',
  },

  // Create voice button
  createVoiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: 24,
    gap: 12,
  },
  createVoiceIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,122,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createVoiceInfo: {
    flex: 1,
  },
  createVoiceTitle: {
    fontSize: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  createVoiceSub: {
    fontSize: 13,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    marginTop: 2,
  },

  // Sections
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },

  // Voice rows (library)
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
  },
  voiceRowActive: {
    backgroundColor: '#007AFF',
  },
  voiceRowInfo: {
    flex: 1,
    gap: 2,
    marginRight: 12,
  },
  voiceRowName: {
    fontSize: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  voiceRowDesc: {
    fontSize: 13,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  voiceRowTextActive: {
    color: '#fff',
  },
  playButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Loading
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },

  // Voice design
  inputSection: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
    marginBottom: 8,
  },
  input: {
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    fontFamily: 'EBGaramond-Regular',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  pillText: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  pillTextActive: {
    color: '#fff',
  },
  tagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  tagPillActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  tagPillText: {
    fontSize: 13,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  tagPillTextActive: {
    color: '#fff',
  },
  customTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  customTagInput: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
  },
  addTagButton: {
    padding: 4,
  },

  // Voice cards (preview selection)
  voiceCards: {
    gap: 12,
    marginBottom: 16,
  },
  voiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
  },
  voiceCardActive: {
    backgroundColor: '#007AFF',
  },
  voiceCardContent: {
    flex: 1,
    gap: 2,
  },
  voiceCardTitle: {
    fontSize: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  voiceCardSub: {
    fontSize: 13,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  voiceCardTextActive: {
    color: '#fff',
  },

  // Regenerate
  regenerateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  regenerateText: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },

  // Footer
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 999,
  },
  continueButtonDisabled: {
    opacity: 0.3,
  },
  continueButtonText: {
    fontSize: 16,
    fontFamily: 'EBGaramond-Medium',
    color: '#fff',
    textTransform: 'lowercase',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    marginBottom: 16,
  },
  modalInput: {
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    borderWidth: 1,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
});
