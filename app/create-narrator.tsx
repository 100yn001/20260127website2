import NarratorArtwork, { getRandomNarratorColor, NARRATOR_COLOR_PALETTE } from '@/components/NarratorArtwork';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { auth, db } from '@/config/firebase';
import { useTheme } from '@/contexts/ThemeContext';
import { Narrator } from '@/types/narrator';
import { createShadow } from '@/utils/shadow';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Keyboard,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Step = 'basic' | 'details' | 'user' | 'voice' | 'preview';

// Voice design options
const VOICE_GENDERS = ['female', 'male', 'androgynous'] as const;
const VOICE_AGES = ['young adult', 'middle-aged', 'elderly', 'other'] as const;
const VOICE_TAGS = [
  'whispery', 'serious', 'playful', 'assertive', 'seductive',
  'warm', 'deep', 'high-pitched', 'gravelly', 'nasal'
] as const;

interface VoicePreview {
  generated_voice_id: string;
  audio_base_64: string;
  media_type: string;
  duration_secs: number;
}

export default function CreateNarratorScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useTheme();
  const isEditMode = params.editMode === 'true';
  const editStep = params.editStep as Step | undefined;
  const existingNarrator: Narrator | null = params.narratorData 
    ? JSON.parse(params.narratorData as string) 
    : null;

  const [currentStep, setCurrentStep] = useState<Step>(editStep || 'basic');
  const [isSaving, setIsSaving] = useState(false);

  // Basic info
  const [narratorName, setNarratorName] = useState('');
  const [narratorGenderChoice, setNarratorGenderChoice] = useState<'male' | 'female' | 'other' | null>(null);
  const [narratorCustomGender, setNarratorCustomGender] = useState('');

  // Details
  const [description, setDescription] = useState('');
  const [relationship, setRelationship] = useState('');
  const [additionalDetails, setAdditionalDetails] = useState('');

  // User info with narrator
  const [userNameChoice, setUserNameChoice] = useState<'my-name' | 'custom' | null>(null);
  const [customUserName, setCustomUserName] = useState('');
  const [storedUserName, setStoredUserName] = useState('User');
  const [userGenderChoice, setUserGenderChoice] = useState<'male' | 'female' | 'other' | null>(null);
  const [userCustomGender, setUserCustomGender] = useState('');

  // Color
  const [selectedColor, setSelectedColor] = useState<string>(() => getRandomNarratorColor());

  // Voice design
  const [voiceGender, setVoiceGender] = useState<typeof VOICE_GENDERS[number] | null>(null);
  const [voiceAccent, setVoiceAccent] = useState('');
  const [voiceAge, setVoiceAge] = useState<typeof VOICE_AGES[number] | null>(null);
  const [voiceAgeCustom, setVoiceAgeCustom] = useState('');
  const [voiceTags, setVoiceTags] = useState<string[]>([]);
  const [voiceTagCustom, setVoiceTagCustom] = useState('');
  const [voiceOtherNotes, setVoiceOtherNotes] = useState('');
  
  // Voice previews
  const [voicePreviews, setVoicePreviews] = useState<VoicePreview[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
  const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const ELEVENLABS_API_KEY = Constants.expoConfig?.extra?.ELEVENLABS || '';
  
  // Regenerate modal
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [regenerateNotes, setRegenerateNotes] = useState('');

  const _resolvedNarratorGender = narratorGenderChoice === 'other' ? narratorCustomGender.trim() : narratorGenderChoice;
  const _resolvedUserGender = userGenderChoice === 'other' ? userCustomGender.trim() : userGenderChoice;
  const resolvedUserName = (userNameChoice === 'my-name' ? storedUserName : customUserName) || 'you';

  useEffect(() => {
    const loadName = async () => {
      const saved = await AsyncStorage.getItem('userName');
      if (saved) {
        setStoredUserName(saved);
      }
    };
    loadName();

    // Pre-populate fields if in edit mode
    if (isEditMode && existingNarrator) {
      setNarratorName(existingNarrator.name);
      setNarratorGenderChoice(existingNarrator.gender);
      if (existingNarrator.customGender) {
        setNarratorCustomGender(existingNarrator.customGender);
      }
      setDescription(existingNarrator.description);
      setRelationship(existingNarrator.relationship);
      setAdditionalDetails(existingNarrator.additionalDetails || '');
      setUserNameChoice(existingNarrator.userNameWithNarrator === storedUserName ? 'my-name' : 'custom');
      setCustomUserName(existingNarrator.userNameWithNarrator);
      setUserGenderChoice(existingNarrator.userGenderWithNarrator);
      if (existingNarrator.userCustomGenderWithNarrator) {
        setUserCustomGender(existingNarrator.userCustomGenderWithNarrator);
      }
      setSelectedVoice(existingNarrator.voiceId);
      if (existingNarrator.color) {
        setSelectedColor(existingNarrator.color);
      }
    }
  }, [isEditMode, existingNarrator]);

  useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync();
        }
      : undefined;
  }, [sound]);

  // Stop audio when leaving preview step
  useEffect(() => {
    if (currentStep !== 'preview' && sound) {
      sound.stopAsync();
      sound.unloadAsync();
      setSound(null);
      setPlayingVoiceId(null);
    }
  }, [currentStep]);

  // Set voice gender based on narrator gender
  useEffect(() => {
    if (currentStep === 'voice' && narratorGenderChoice && !voiceGender) {
      if (narratorGenderChoice === 'male') {
        setVoiceGender('male');
      } else if (narratorGenderChoice === 'female') {
        setVoiceGender('female');
      } else {
        setVoiceGender('androgynous');
      }
    }
  }, [currentStep, narratorGenderChoice, voiceGender]);

  const toggleVoiceTag = (tag: string) => {
    setVoiceTags(prev => {
      if (prev.includes(tag)) {
        return prev.filter(t => t !== tag);
      }
      if (prev.length >= 4) {
        return prev;
      }
      return [...prev, tag];
    });
  };

  const addCustomTag = () => {
    const trimmed = voiceTagCustom.trim().toLowerCase();
    if (trimmed && !voiceTags.includes(trimmed) && voiceTags.length < 4) {
      setVoiceTags(prev => [...prev, trimmed]);
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
    
    return parts.join('; ');
  };

  const generateVoicePreviews = async (additionalNotes?: string) => {
    setIsGeneratingPreviews(true);
    setVoicePreviews([]);
    setSelectedVoice(null);
    
    try {
      let voiceDescription = buildVoiceDescription();
      
      // Append additional notes if provided (for regeneration)
      if (additionalNotes?.trim()) {
        voiceDescription += `; additional feedback: ${additionalNotes.trim()}`;
      }
      
      console.log('Generating voice with description:', voiceDescription);
      
      const response = await fetch('https://api.elevenlabs.io/v1/text-to-voice/design', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          voice_description: voiceDescription,
          text: `Hello ${resolvedUserName}, welcome to your story. Tell me what you have in mind. I'm so glad you're here. We're going to have a great time together.`,
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
      console.log('Voice design API response:', JSON.stringify(data, null, 2));
      
      // The API returns previews array directly or nested
      const previews = data.previews || [data];
      
      if (previews && previews.length > 0 && previews[0].generated_voice_id) {
        setVoicePreviews(previews);
        setCurrentStep('preview');
      } else {
        console.error('Unexpected response structure:', data);
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

  const playVoicePreview = async (voiceId: string) => {
    try {
      if (playingVoiceId === voiceId) {
        await sound?.stopAsync();
        setPlayingVoiceId(null);
        return;
      }

      if (sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
      }

      setPlayingVoiceId(voiceId);

      // Configure audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      // Find the preview with this voice ID and use its base64 audio
      const preview = voicePreviews.find(p => p.generated_voice_id === voiceId);
      if (preview && preview.audio_base_64) {
        // Use the pre-generated audio from the design API
        const audioUri = `data:${preview.media_type};base64,${preview.audio_base_64}`;
        
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: audioUri },
          { shouldPlay: true }
        );

        setSound(newSound);

        newSound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            setPlayingVoiceId(null);
          }
        });
      } else {
        // Fallback: generate new audio using TTS API
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': ELEVENLABS_API_KEY,
          },
          body: JSON.stringify({
            text: `Hello ${resolvedUserName}, welcome to your story. Tell me what you have in mind. I'm so glad you're here. We're going to have a great time together.`,
            model_id: 'eleven_v3',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.5,
            },
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to generate voice preview');
        }

        const audioBlob = await response.blob();
        const reader = new FileReader();
        const base64Audio = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(audioBlob);
        });

        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: base64Audio },
          { shouldPlay: true }
        );

        setSound(newSound);

        newSound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            setPlayingVoiceId(null);
          }
        });
      }
    } catch (error) {
      console.error('Error playing voice preview:', error);
      setPlayingVoiceId(null);
    }
  };

  const handleSaveNarrator = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setIsSaving(true);

    try {
      // If we have a selected voice from previews, save it to get a permanent voice ID
      let permanentVoiceId = selectedVoice || '';
      
      if (selectedVoice && voicePreviews.some(p => p.generated_voice_id === selectedVoice)) {
        // This is a generated_voice_id (temporary) - need to save it to get permanent ID
        console.log('🎤 Saving voice preview to ElevenLabs library...');
        try {
          const saveResponse = await fetch('https://api.elevenlabs.io/v1/text-to-voice', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'xi-api-key': ELEVENLABS_API_KEY,
            },
            body: JSON.stringify({
              voice_name: `${narratorName} - ${user.uid.slice(0, 6)}`,
              voice_description: `Voice for narrator ${narratorName}`,
              generated_voice_id: selectedVoice,
            }),
          });
          
          if (saveResponse.ok) {
            const saveData = await saveResponse.json();
            // ElevenLabs returns voice_id in the response
            permanentVoiceId = saveData.voice_id;
            console.log('✅ Voice saved with permanent ID:', permanentVoiceId);
            
            if (!permanentVoiceId) {
              console.error('❌ API returned success but no voice_id. Response:', JSON.stringify(saveData));
              throw new Error('Voice was created but no ID was returned. Please try again.');
            }
          } else {
            const errorText = await saveResponse.text();
            console.error('❌ Failed to save voice:', errorText);
            throw new Error(`Failed to save voice to ElevenLabs: ${errorText}`);
          }
        } catch (saveError: any) {
          console.error('❌ Error saving voice:', saveError);
          alert(`Failed to save voice: ${saveError.message || 'Unknown error'}. Please try again.`);
          setIsSaving(false);
          return; // Don't continue saving narrator without valid voice
        }
      }
      
      if (isEditMode && existingNarrator) {
        // Update existing narrator
        const narratorData: Record<string, any> = {
          name: narratorName,
          gender: narratorGenderChoice || 'other',
          description,
          relationship,
          additionalDetails,
          userNameWithNarrator: userNameChoice === 'my-name' ? storedUserName : customUserName,
          userGenderWithNarrator: userGenderChoice || 'other',
          voiceId: permanentVoiceId,
          updatedAt: new Date(),
        };

        if (narratorGenderChoice === 'other' && narratorCustomGender.trim()) {
          narratorData.customGender = narratorCustomGender.trim();
        }

        if (userGenderChoice === 'other' && userCustomGender.trim()) {
          narratorData.userCustomGenderWithNarrator = userCustomGender.trim();
        }

        narratorData.color = selectedColor;

        // Store the preview audio - generate if not available
        const selectedPreview = voicePreviews.find(p => p.generated_voice_id === selectedVoice);
        if (selectedPreview?.audio_base_64) {
          narratorData.voicePreviewAudio = selectedPreview.audio_base_64;
        } else if (permanentVoiceId) {
          // Generate preview audio using TTS API
          try {
            const previewResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${permanentVoiceId}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'xi-api-key': ELEVENLABS_API_KEY,
              },
              body: JSON.stringify({
                text: `Hello ${resolvedUserName}, welcome to your story. Tell me what you have in mind. I'm so glad you're here. We're going to have a great time together.`,
                model_id: 'eleven_v3',
              }),
            });
            if (previewResponse.ok) {
              const audioBlob = await previewResponse.blob();
              const reader = new FileReader();
              const base64Audio = await new Promise<string>((resolve) => {
                reader.onloadend = () => {
                  const result = reader.result as string;
                  const base64 = result.split(',')[1];
                  resolve(base64);
                };
                reader.readAsDataURL(audioBlob);
              });
              narratorData.voicePreviewAudio = base64Audio;
            }
          } catch (e) {
            console.error('Failed to generate preview audio:', e);
          }
        }

        await updateDoc(doc(db, 'users', user.uid, 'narrators', existingNarrator.id), narratorData);
      } else {
        // Create new narrator
        const narratorId = `narrator_${Date.now()}`;
        const narratorData: Record<string, any> = {
          id: narratorId,
          userId: user.uid,
          sourceUserId: user.uid,
          name: narratorName,
          gender: narratorGenderChoice || 'other',
          description,
          relationship,
          additionalDetails,
          userNameWithNarrator: userNameChoice === 'my-name' ? storedUserName : customUserName,
          userGenderWithNarrator: userGenderChoice || 'other',
          voiceId: permanentVoiceId,
          createdAt: new Date(),
          updatedAt: new Date(),
          isPublished: false,
          publishedAt: null,
          publishedBy: null,
          sourcePublicNarratorId: null,
          username: null,
          usernameLowercase: null,
          color: selectedColor,
        };

        if (narratorGenderChoice === 'other' && narratorCustomGender.trim()) {
          narratorData.customGender = narratorCustomGender.trim();
        }

        if (userGenderChoice === 'other' && userCustomGender.trim()) {
          narratorData.userCustomGenderWithNarrator = userCustomGender.trim();
        }

        // Store the preview audio - generate if not available
        const selectedPreview = voicePreviews.find(p => p.generated_voice_id === selectedVoice);
        if (selectedPreview?.audio_base_64) {
          narratorData.voicePreviewAudio = selectedPreview.audio_base_64;
        } else if (permanentVoiceId) {
          // Generate preview audio using TTS API
          try {
            const previewResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${permanentVoiceId}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'xi-api-key': ELEVENLABS_API_KEY,
              },
              body: JSON.stringify({
                text: `Hello ${resolvedUserName}, welcome to your story. Tell me what you have in mind. I'm so glad you're here. We're going to have a great time together.`,
                model_id: 'eleven_v3',
              }),
            });
            if (previewResponse.ok) {
              const audioBlob = await previewResponse.blob();
              const reader = new FileReader();
              const base64Audio = await new Promise<string>((resolve) => {
                reader.onloadend = () => {
                  const result = reader.result as string;
                  const base64 = result.split(',')[1];
                  resolve(base64);
                };
                reader.readAsDataURL(audioBlob);
              });
              narratorData.voicePreviewAudio = base64Audio;
            }
          } catch (e) {
            console.error('Failed to generate preview audio:', e);
          }
        }

        await setDoc(doc(db, 'users', user.uid, 'narrators', narratorId), narratorData);
      }
      
      router.push('/(tabs)/narrators');
    } catch (error) {
      console.error('Error saving narrator:', error);
      alert('Failed to save narrator. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Basic info step
  if (currentStep === 'basic') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>create narrator</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>basic information</Text>
          </View>

          <View style={styles.inputSection}>
            <Text style={[styles.label, { color: colors.text }]}>narrator name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, color: colors.text }]}
              value={narratorName}
              onChangeText={setNarratorName}
              placeholder="e.g., alex, dr. morgan, etc."
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={[styles.genderCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.genderCardLabel, { color: colors.text }]}>narrator gender</Text>
            <View style={styles.genderPillsRow}>
              {['male', 'female', 'other'].map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.genderPill,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    narratorGenderChoice === option && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground },
                  ]}
                  onPress={() => setNarratorGenderChoice(option as 'male' | 'female' | 'other')}
                >
                  <Text style={[
                    styles.genderPillText,
                    { color: colors.textSecondary },
                    narratorGenderChoice === option && { color: colors.buttonText },
                  ]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {narratorGenderChoice === 'other' && (
              <TextInput
                style={[styles.genderCustomInput, { backgroundColor: colors.background, color: colors.text }]}
                value={narratorCustomGender}
                onChangeText={setNarratorCustomGender}
                placeholder="specify gender"
                placeholderTextColor={colors.textSecondary}
              />
            )}
          </View>

          {/* Color picker */}
          <View style={[styles.colorCard, { backgroundColor: colors.card }]}>
            <View style={styles.colorCardHeader}>
              <Text style={[styles.colorCardLabel, { color: colors.text }]}>display color</Text>
              <TouchableOpacity
                style={styles.randomColorButton}
                onPress={() => setSelectedColor(getRandomNarratorColor())}
              >
                <IconSymbol name="arrow.triangle.2.circlepath" size={16} color="#0A84FF" />
                <Text style={styles.randomColorText}>random</Text>
              </TouchableOpacity>
            </View>
            
            {/* Preview */}
            <View style={styles.colorPreview}>
              <NarratorArtwork color={selectedColor} size={160} />
            </View>
            
            {/* Color swatches */}
            <View style={styles.colorSwatches}>
              {NARRATOR_COLOR_PALETTE.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: color },
                    selectedColor === color && styles.colorSwatchSelected,
                  ]}
                  onPress={() => setSelectedColor(color)}
                />
              ))}
            </View>
          </View>
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.continueButton, (!narratorName.trim() || !narratorGenderChoice) && styles.continueButtonDisabled]}
            onPress={() => setCurrentStep('details')}
            disabled={!narratorName.trim() || !narratorGenderChoice}
          >
            <Text style={styles.continueButtonText}>continue</Text>
            <IconSymbol name="arrow.right" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Details step
  if (currentStep === 'details') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => setCurrentStep('basic')}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.content, { paddingBottom: 220 }]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>hello, {resolvedUserName || 'you'}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>tell us more about this narrator</Text>
            </View>

            <View style={styles.inputSection}>
              <Text style={[styles.label, { color: colors.text }]}>description</Text>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>physical attributes, personality, mannerisms</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: colors.card, color: colors.text }]}
                value={description}
                onChangeText={setDescription}
                placeholder="e.g., tall with kind eyes, speaks softly, has a warm laugh..."
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={4}
                blurOnSubmit
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            </View>

            <View style={styles.inputSection}>
              <Text style={[styles.label, { color: colors.text }]}>your relationship</Text>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>how do you know this narrator?</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, color: colors.text }]}
                value={relationship}
                onChangeText={setRelationship}
                placeholder="e.g., close friend, mentor, partner..."
                placeholderTextColor={colors.textSecondary}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            </View>

            <View style={[styles.inputSection, styles.keyboardMargin]}>
              <Text style={[styles.label, { color: colors.text }]}>additional details (optional)</Text>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>nicknames, special traits, inside jokes</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: colors.card, color: colors.text }]}
                value={additionalDetails}
                onChangeText={setAdditionalDetails}
                placeholder="e.g., calls you 'kiddo', loves coffee, always on time..."
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
            style={[styles.continueButton, (!description.trim() || !relationship.trim()) && styles.continueButtonDisabled]}
            onPress={() => setCurrentStep('user')}
            disabled={!description.trim() || !relationship.trim()}
          >
            <Text style={styles.continueButtonText}>continue</Text>
            <IconSymbol name="arrow.right" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // User info step
  if (currentStep === 'user') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => setCurrentStep('details')}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>you with this narrator</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>how does this narrator know you?</Text>
          </View>

          <View style={[styles.nameCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.nameCardLabel, { color: colors.text }]}>your name with {narratorName}</Text>
            
            <TouchableOpacity
              style={[styles.nameOption, { backgroundColor: colors.background, borderColor: colors.border }, userNameChoice === 'my-name' && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground }]}
              onPress={() => setUserNameChoice('my-name')}
            >
              <Text style={[styles.nameOptionTitle, { color: colors.text }, userNameChoice === 'my-name' && { color: colors.buttonText }]}>
                use my name
              </Text>
              <Text style={[styles.nameOptionSubtitle, { color: colors.textSecondary }, userNameChoice === 'my-name' && { color: colors.buttonText, opacity: 0.7 }]}>
                {storedUserName}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.nameOption, { backgroundColor: colors.background, borderColor: colors.border }, userNameChoice === 'custom' && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground }]}
              onPress={() => setUserNameChoice('custom')}
            >
              <Text style={[styles.nameOptionTitle, { color: colors.text }, userNameChoice === 'custom' && { color: colors.buttonText }]}>
                custom name
              </Text>
            </TouchableOpacity>

            {userNameChoice === 'custom' && (
              <TextInput
                style={[styles.nameCustomInput, { backgroundColor: colors.background, color: colors.text }]}
                value={customUserName}
                onChangeText={setCustomUserName}
                placeholder="enter name"
                placeholderTextColor={colors.textSecondary}
              />
            )}
          </View>

          <View style={[styles.genderCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.genderCardLabel, { color: colors.text }]}>your gender with {narratorName}</Text>
            <View style={styles.genderPillsRow}>
              {['male', 'female', 'other'].map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.genderPill,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    userGenderChoice === option && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground },
                  ]}
                  onPress={() => setUserGenderChoice(option as 'male' | 'female' | 'other')}
                >
                  <Text style={[
                    styles.genderPillText,
                    { color: colors.textSecondary },
                    userGenderChoice === option && { color: colors.buttonText },
                  ]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {userGenderChoice === 'other' && (
              <TextInput
                style={[styles.genderCustomInput, { backgroundColor: colors.background, color: colors.text }]}
                value={userCustomGender}
                onChangeText={setUserCustomGender}
                placeholder="specify gender"
                placeholderTextColor={colors.textSecondary}
              />
            )}
          </View>
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[
              styles.continueButton, 
              (!userNameChoice || !userGenderChoice || (userNameChoice === 'custom' && !customUserName.trim())) && styles.continueButtonDisabled
            ]}
            onPress={() => setCurrentStep('voice')}
            disabled={!userNameChoice || !userGenderChoice || (userNameChoice === 'custom' && !customUserName.trim())}
          >
            <Text style={styles.continueButtonText}>continue</Text>
            <IconSymbol name="arrow.right" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Voice design step
  if (currentStep === 'voice') {
    const canGenerate = voiceGender && voiceAge && (voiceAge !== 'other' || voiceAgeCustom.trim());
    
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => setCurrentStep('user')}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={[styles.content, { paddingBottom: 140 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>design voice</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>describe {narratorName}&apos;s voice</Text>
          </View>

          {/* Voice Gender */}
          <View style={[styles.inputSection, { marginBottom: 20 }]}>
            <Text style={[styles.label, { color: colors.text }]}>voice gender</Text>
            <View style={styles.voiceGenderTabs}>
              {VOICE_GENDERS.map((gender) => (
                <TouchableOpacity
                  key={gender}
                  style={[
                    styles.voiceGenderTab, 
                    { backgroundColor: colors.card }, 
                    voiceGender === gender && { backgroundColor: colors.buttonBackground }
                  ]}
                  onPress={() => setVoiceGender(gender)}
                >
                  <Text style={[
                    styles.voiceGenderTabText,
                    { color: colors.textSecondary },
                    voiceGender === gender && { color: colors.buttonText },
                  ]}>
                    {gender}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Accent */}
          <View style={styles.inputSection}>
            <Text style={[styles.label, { color: colors.text }]}>accent</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, color: colors.text }]}
              value={voiceAccent}
              onChangeText={setVoiceAccent}
              placeholder="e.g., British, Southern American, Australian..."
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          {/* Age */}
          <View style={[styles.inputSection, { marginBottom: 20 }]}>
            <Text style={[styles.label, { color: colors.text }]}>age</Text>
            <View style={styles.ageOptions}>
              {VOICE_AGES.map((age) => (
                <TouchableOpacity
                  key={age}
                  style={[
                    styles.ageOption, 
                    { backgroundColor: colors.card, borderColor: colors.border },
                    voiceAge === age && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground }
                  ]}
                  onPress={() => setVoiceAge(age)}
                >
                  <Text style={[
                    styles.ageOptionText,
                    { color: colors.textSecondary },
                    voiceAge === age && { color: colors.buttonText },
                  ]}>
                    {age}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {voiceAge === 'other' && (
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, color: colors.text, marginTop: 12 }]}
                value={voiceAgeCustom}
                onChangeText={setVoiceAgeCustom}
                placeholder="specify age (e.g., teenager, child)"
                placeholderTextColor={colors.textSecondary}
              />
            )}
          </View>

          {/* Voice Tags */}
          <View style={styles.inputSection}>
            <Text style={[styles.label, { color: colors.text }]}>voice features (select up to 4)</Text>
            <View style={styles.voiceTagsGrid}>
              {VOICE_TAGS.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  style={[
                    styles.voiceTagPill,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    voiceTags.includes(tag) && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground },
                  ]}
                  onPress={() => toggleVoiceTag(tag)}
                >
                  <Text style={[
                    styles.voiceTagText,
                    { color: colors.textSecondary },
                    voiceTags.includes(tag) && { color: colors.buttonText },
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
                placeholder="add custom feature..."
                placeholderTextColor={colors.textSecondary}
                onSubmitEditing={addCustomTag}
                returnKeyType="done"
              />
              <TouchableOpacity 
                style={[styles.addTagButton, !voiceTagCustom.trim() && { opacity: 0.3 }]}
                onPress={addCustomTag}
                disabled={!voiceTagCustom.trim() || voiceTags.length >= 4}
              >
                <IconSymbol name="plus" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {/* Selected custom tags */}
            {voiceTags.filter(t => !VOICE_TAGS.includes(t as any)).length > 0 && (
              <View style={styles.selectedCustomTags}>
                {voiceTags.filter(t => !VOICE_TAGS.includes(t as any)).map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.voiceTagPill, { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground }]}
                    onPress={() => toggleVoiceTag(tag)}
                  >
                    <Text style={[styles.voiceTagText, { color: colors.buttonText }]}>
                      {tag} ×
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Other Notes */}
          <View style={styles.inputSection}>
            <Text style={[styles.label, { color: colors.text }]}>other notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.card, color: colors.text }]}
              value={voiceOtherNotes}
              onChangeText={setVoiceOtherNotes}
              placeholder="any additional voice characteristics..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={3}
              blurOnSubmit={true}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
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
                <Text style={styles.continueButtonText}>generating voices...</Text>
              </>
            ) : (
              <>
                <Text style={styles.continueButtonText}>generate voice options</Text>
                <IconSymbol name="waveform" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Voice preview selection step
  if (currentStep === 'preview') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => setCurrentStep('voice')}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>select voice</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>preview and choose {narratorName}&apos;s voice</Text>
          </View>

          <View style={styles.voiceCards}>
            {voicePreviews.map((preview, index) => (
              <TouchableOpacity
                key={preview.generated_voice_id}
                style={[
                  styles.voiceCard, 
                  { backgroundColor: colors.card }, 
                  selectedVoice === preview.generated_voice_id && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground }
                ]}
                onPress={() => setSelectedVoice(preview.generated_voice_id)}
              >
                <View style={styles.voiceCardContent}>
                  <View style={styles.voiceCardInfo}>
                    <Text style={[
                      styles.voiceCardAccent, 
                      { color: colors.text }, 
                      selectedVoice === preview.generated_voice_id && { color: colors.buttonText }
                    ]}>
                      voice option {index + 1}
                    </Text>
                                      </View>
                  <TouchableOpacity
                    style={styles.previewButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      playVoicePreview(preview.generated_voice_id);
                    }}
                  >
                    <IconSymbol 
                      name={playingVoiceId === preview.generated_voice_id ? 'pause.fill' : 'play.fill'} 
                      size={20} 
                      color={selectedVoice === preview.generated_voice_id ? colors.buttonText : colors.text} 
                    />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.regenerateOptions}>
            <TouchableOpacity 
              style={styles.regenerateButton}
              onPress={() => setShowRegenerateModal(true)}
              disabled={isGeneratingPreviews}
            >
              <IconSymbol name="arrow.triangle.2.circlepath" size={16} color="#0A84FF" />
              <Text style={[styles.regenerateText, { color: '#0A84FF' }]}>regenerate with feedback</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.regenerateButton}
              onPress={() => setCurrentStep('voice')}
            >
              <IconSymbol name="pencil" size={16} color={colors.textSecondary} />
              <Text style={[styles.regenerateText, { color: colors.textSecondary }]}>edit voice description</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Regenerate Modal */}
        <Modal
          visible={showRegenerateModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRegenerateModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>regenerate voices</Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                what would you like to change about the voice?
              </Text>
              
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.background, color: colors.text }]}
                value={regenerateNotes}
                onChangeText={setRegenerateNotes}
                placeholder="e.g., make it deeper, more breathy, less nasal..."
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              
              <View style={styles.modalButtons}>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.modalButtonCancel, { borderColor: colors.border }]}
                  onPress={() => {
                    setShowRegenerateModal(false);
                    setRegenerateNotes('');
                  }}
                >
                  <Text style={[styles.modalButtonText, { color: colors.text }]}>cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.modalButton, styles.modalButtonSubmit, !regenerateNotes.trim() && { opacity: 0.3 }]}
                  onPress={handleRegenerateWithNotes}
                  disabled={!regenerateNotes.trim() || isGeneratingPreviews}
                >
                  {isGeneratingPreviews ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={[styles.modalButtonText, { color: '#fff' }]}>regenerate</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.continueButton, !selectedVoice && styles.continueButtonDisabled]}
            onPress={handleSaveNarrator}
            disabled={!selectedVoice || isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.continueButtonText}>save narrator</Text>
                <IconSymbol name="checkmark" size={20} color="#fff" />
              </>
            )}
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
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '500',
    color: '#030213',
    marginBottom: 4,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  subtitle: {
    fontSize: 14,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  inputSection: {
    marginBottom: 24,
  },
  keyboardMargin: {
    marginBottom: 32,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#030213',
    marginBottom: 4,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  input: {
    backgroundColor: '#f7f7f8',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#030213',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  genderCard: {
    backgroundColor: '#f7f7f8',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  genderCardLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#030213',
    marginBottom: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
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
    borderColor: '#ddd',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  genderPillActive: {
    backgroundColor: '#030213',
    borderColor: '#030213',
  },
  genderPillText: {
    color: '#999',
    fontSize: 14,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  genderPillTextActive: {
    color: '#fff',
  },
  genderCustomInput: {
    marginTop: 12,
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fff',
    color: '#030213',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
    fontSize: 14,
  },
  nameCard: {
    backgroundColor: '#f7f7f8',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  nameCardLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#030213',
    marginBottom: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  nameOption: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 12,
  },
  nameOptionActive: {
    backgroundColor: '#030213',
    borderColor: '#030213',
  },
  nameOptionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#030213',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  nameOptionTitleActive: {
    color: '#fff',
  },
  nameOptionSubtitle: {
    fontSize: 14,
    color: '#717182',
    marginTop: 4,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  nameOptionSubtitleActive: {
    color: '#ccc',
  },
  nameCustomInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#030213',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  voiceGenderTabs: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  voiceGenderTab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: '#f7f7f8',
  },
  voiceGenderTabActive: {
    backgroundColor: '#030213',
  },
  voiceGenderTabText: {
    fontSize: 14,
    color: '#717182',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  voiceGenderTabTextActive: {
    color: '#fff',
  },
  voiceCards: {
    gap: 12,
  },
  voiceCard: {
    backgroundColor: '#f7f7f8',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  voiceCardActive: {
    backgroundColor: '#030213',
    borderColor: '#030213',
  },
  voiceCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voiceCardInfo: {
    flex: 1,
  },
  voiceCardAccent: {
    fontSize: 16,
    fontWeight: '500',
    color: '#030213',
    marginBottom: 4,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  voiceCardDescriptors: {
    fontSize: 14,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  voiceCardTextActive: {
    color: '#fff',
  },
  previewButton: {
    padding: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 16,
    paddingHorizontal: 24,
    paddingBottom: 24,
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
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  colorCard: {
    backgroundColor: '#f7f7f8',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  colorCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  colorCardLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#030213',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  randomColorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  randomColorText: {
    fontSize: 14,
    color: '#0A84FF',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  colorPreview: {
    alignItems: 'center',
    marginBottom: 20,
  },
  colorSwatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorSwatchSelected: {
    borderColor: '#fff',
    ...createShadow('#000', 0, 2, 4, 0.3, 4),
  },
  // Voice design styles
  ageOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  ageOption: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
  },
  ageOptionActive: {
    backgroundColor: '#030213',
    borderColor: '#030213',
  },
  ageOptionText: {
    fontSize: 14,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  ageOptionTextActive: {
    color: '#fff',
  },
  voiceTagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  voiceTagPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  voiceTagPillActive: {
    backgroundColor: '#030213',
    borderColor: '#030213',
  },
  voiceTagText: {
    fontSize: 13,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  voiceTagTextActive: {
    color: '#fff',
  },
  customTagRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  customTagInput: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  addTagButton: {
    backgroundColor: '#030213',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCustomTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  regenerateOptions: {
    marginTop: 24,
    gap: 8,
  },
  regenerateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  regenerateText: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    fontWeight: '500',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    marginBottom: 16,
  },
  modalInput: {
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  modalButtonSubmit: {
    backgroundColor: '#030213',
  },
  modalButtonText: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
});
