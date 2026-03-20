import { Card } from '@/components/ui/card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type Tab = 'setting' | 'name' | 'location' | 'character' | 'gender' | 'trope' | 'features' | 'narration' | 'voice' | 'preview';

interface Option {
  id: string;
  name: string;
}

export default function RecipeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const routeParams = useLocalSearchParams();
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';
  const [hasStarted, setHasStarted] = useState(false);
  const [isNighttime, setIsNighttime] = useState(false);
  const [currentTab, setCurrentTab] = useState<Tab>('setting');
  const [currentIndexes, setCurrentIndexes] = useState({
    setting: 0,
    location: 0,
    character: 0,
    trope: 0,
  });
  const backgroundColorAnim = useSharedValue(0);
  const transitionOpacity = useSharedValue(1);

  const [selectedSetting, setSelectedSetting] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [selectedGenderSelf, setSelectedGenderSelf] = useState<string | null>(null);
  const [selectedGenderOther, setSelectedGenderOther] = useState<string | null>(null);
  const [selectedTrope, setSelectedTrope] = useState<string | null>(null);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [featurePreferences, setFeaturePreferences] = useState<Record<string, string[]>>({});
  const [featureDetails, setFeatureDetails] = useState('');
  const [featureSpecificDetails, setFeatureSpecificDetails] = useState<Record<string, string>>({});
  const [customFeatures, setCustomFeatures] = useState<string[]>([]);
  const [newCustomFeature, setNewCustomFeature] = useState('');
  
  // Narration details
  const [duration, setDuration] = useState<'5min' | '10min' | '15min'>('10min');
  const [narrativeRatio, setNarrativeRatio] = useState(5); // 0-10 slider, where 0 = all narrative, 10 = all direct

  // Name selection
  const [nameOption, setNameOption] = useState<'my-name' | 'custom' | 'nameless'>('my-name');
  const [customNameInput, setCustomNameInput] = useState('');
  const [storedUserName, setStoredUserName] = useState('User');

  // Voice selection
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);

  const [customSetting, setCustomSetting] = useState('');
  const [customLocation, setCustomLocation] = useState('');
  const [customCharacter, setCustomCharacter] = useState('');
  const [customTrope, setCustomTrope] = useState('');
  const [customGenderSelf, setCustomGenderSelf] = useState('');
  const [customGenderOther, setCustomGenderOther] = useState('');
  
  const [isCustomMode, setIsCustomMode] = useState({
    setting: false,
    location: false,
    character: false,
    trope: false,
  });

  const settings: Option[] = [
    { id: 'victorian', name: 'victorian' },
    { id: 'medieval', name: 'medieval' },
    { id: 'cyberpunk', name: 'cyberpunk' },
    { id: 'small-town', name: 'small town' },
    { id: 'fantasy', name: 'fantasy' },
    { id: 'modern', name: 'modern' },
  ];

  const locations: Option[] = [
    { id: 'bedroom', name: 'bedroom' },
    { id: 'dungeon', name: 'dungeon' },
    { id: 'nightclub', name: 'nightclub' },
    { id: 'office', name: 'office' },
    { id: 'hotel', name: 'hotel' },
    { id: 'beach', name: 'beach' },
  ];

  const characters: Option[] = [
    { id: 'boss', name: 'boss' },
    { id: 'professor', name: 'professor' },
    { id: 'student', name: 'student' },
    { id: 'artist', name: 'artist' },
    { id: 'neighbor', name: 'neighbor' },
    { id: 'stranger', name: 'stranger' },
  ];

  const tropes: Option[] = [
    { id: 'enemies-to-lovers', name: 'enemies to lovers' },
    { id: 'friends-to-lovers', name: 'friends to lovers' },
    { id: 'second-chance', name: 'second chance romance' },
    { id: 'fake-relationship', name: 'fake relationship' },
  ];

  const features: Option[] = [
    { id: 'bondage', name: 'bondage' },
    { id: 'spanking', name: 'spanking' },
    { id: 'blindfolds', name: 'blindfolds' },
    { id: 'exhibitionism', name: 'exhibitionism' },
    { id: 'orgasm-control', name: 'orgasm control' },
    { id: 'edging', name: 'edging' },
    { id: 'body-worship', name: 'body worship' },
    { id: 'choking', name: 'choking' },
    { id: 'aftercare', name: 'aftercare' },
    { id: 'degradation', name: 'degradation' },
    { id: 'riding', name: 'riding' },
    { id: 'praise', name: 'praise' },
    { id: 'toys', name: 'toys' },
    { id: 'nipple-play', name: 'nipple play' },
    { id: 'cuddling', name: 'cuddling' },
    { id: 'biting', name: 'biting' },
  ];


  const getOptionLabel = (options: Option[], value: string | null) => {
    if (!value) return '';
    return options.find((option) => option.id === value)?.name ?? '';
  };

  const trimmedCustomSetting = customSetting.trim();
  const trimmedCustomLocation = customLocation.trim();
  const trimmedCustomCharacter = customCharacter.trim();
  const trimmedCustomTrope = customTrope.trim();

  const resolvedSetting = isCustomMode.setting ? trimmedCustomSetting : selectedSetting;
  const resolvedLocation = isCustomMode.location ? trimmedCustomLocation : selectedLocation;
  const resolvedCharacter = isCustomMode.character ? trimmedCustomCharacter : selectedCharacter;
  const resolvedTrope = isCustomMode.trope ? trimmedCustomTrope : selectedTrope;

  const hasSetting = Boolean(resolvedSetting);
  const hasLocation = Boolean(resolvedLocation);
  const hasCharacter = Boolean(resolvedCharacter);
  const hasTrope = Boolean(resolvedTrope);
  const hasSelfGender = Boolean(selectedGenderSelf);
  const hasOtherGender = Boolean(selectedGenderOther);

  const settingDisplayValue = isCustomMode.setting ? trimmedCustomSetting : getOptionLabel(settings, selectedSetting);
  const locationDisplayValue = isCustomMode.location ? trimmedCustomLocation : getOptionLabel(locations, selectedLocation);
  const characterDisplayValue = isCustomMode.character ? trimmedCustomCharacter : getOptionLabel(characters, selectedCharacter);
  const tropeDisplayValue = isCustomMode.trope ? trimmedCustomTrope : getOptionLabel(tropes, selectedTrope);

  // Compute the actual name to use based on selection
  const userName = nameOption === 'my-name' ? storedUserName : 
                   nameOption === 'custom' ? (customNameInput || 'User') : 
                   'you';

  // Tabs sequence
  const tabs: { id: Tab; label: string }[] = [
    { id: 'setting', label: 'setting' },
    { id: 'location', label: 'location' },
    { id: 'character', label: 'character' },
    { id: 'gender', label: 'gender' },
    { id: 'trope', label: 'trope' },
    ...(isNighttime ? [{ id: 'features' as Tab, label: 'features' }] : []),
    { id: 'narration', label: 'narration' },
    { id: 'name', label: 'name' },
    { id: 'voice', label: 'voice' },
    { id: 'preview', label: 'preview' },
  ];

  // Smoothly dissolve between daytime and nighttime
  useEffect(() => {
    backgroundColorAnim.value = withTiming(isNighttime ? 1 : 0, { duration: 500 });
  }, [isNighttime]);

  // Load user name from AsyncStorage
  useEffect(() => {
    const loadUserName = async () => {
      const name = await AsyncStorage.getItem('userName');
      if (name) setStoredUserName(name);
    };
    loadUserName();
  }, []);

  // Receive voice selection back from voice-library
  useEffect(() => {
    const voiceId = routeParams.selectedVoiceId as string | undefined;
    if (voiceId) {
      setSelectedVoice(voiceId);
      setCurrentTab('preview');
    }
  }, [routeParams.selectedVoiceId]);

  // Hide tab bar on recipe screen
  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: {
        display: 'none',
      }
    });
  }, [navigation]);

  // When voice tab is selected, navigate to voice-library screen
  useEffect(() => {
    if (currentTab === 'voice') {
      router.push({
        pathname: '/voice-library' as any,
        params: {
          genderHint: selectedGenderOther || '',
          userName,
        },
      });
      // Go back to name tab so returning from voice-library doesn't re-trigger
      setCurrentTab('name');
    }
  }, [currentTab]);

  const nighttimeOpacityStyle = useAnimatedStyle(() => ({
    opacity: backgroundColorAnim.value,
  }));
  const daytimeOpacityStyle = useAnimatedStyle(() => ({
    opacity: 1 - backgroundColorAnim.value,
  }));

  const transitionStyle = useAnimatedStyle(() => ({
    opacity: transitionOpacity.value,
  }));

  const getOptionsForTab = (tab: Tab): Option[] => {
    if (tab === 'setting') return settings;
    if (tab === 'location') return locations;
    if (tab === 'character') return characters;
    if (tab === 'trope') return tropes;
    return [];
  };

  const getCurrentIndex = () => {
    if (currentTab === 'features' || currentTab === 'gender' || currentTab === 'preview') return 0;
    return currentIndexes[currentTab as keyof typeof currentIndexes];
  };

  const getCurrentOption = () => {
    const options = getOptionsForTab(currentTab);
    return options[getCurrentIndex()];
  };

  const handleNext = () => {
    if (currentTab === 'features' || currentTab === 'gender' || currentTab === 'preview') return;
    const options = getOptionsForTab(currentTab);
    setCurrentIndexes((prev) => ({
      ...prev,
      [currentTab]: (prev[currentTab as keyof typeof prev] + 1) % options.length,
    }));
  };

  const handlePrevious = () => {
    if (currentTab === 'features' || currentTab === 'gender' || currentTab === 'preview') return;
    const options = getOptionsForTab(currentTab);
    setCurrentIndexes((prev) => ({
      ...prev,
      [currentTab]: prev[currentTab as keyof typeof prev] === 0 ? options.length - 1 : prev[currentTab as keyof typeof prev] - 1,
    }));
  };

  const handleShuffle = () => {
    if (currentTab === 'features' || currentTab === 'gender' || currentTab === 'preview') return;
    const options = getOptionsForTab(currentTab);
    const randomIndex = Math.floor(Math.random() * options.length);
    setCurrentIndexes((prev) => ({
      ...prev,
      [currentTab]: randomIndex,
    }));
  };

  const handleSelect = () => {
    if (currentTab === 'features' || currentTab === 'gender') return;
    const currentOption = getCurrentOption();

    if (currentTab === 'setting') {
      setSelectedSetting(currentOption.id);
      setCustomSetting('');
      setCurrentTab('location');
    } else if (currentTab === 'location') {
      setSelectedLocation(currentOption.id);
      setCustomLocation('');
      setCurrentTab('character');
    } else if (currentTab === 'character') {
      setSelectedCharacter(currentOption.id);
      setCustomCharacter('');
      setCurrentTab('gender');
    } else if (currentTab === 'trope') {
      setSelectedTrope(currentOption.id);
      setCustomTrope('');
      // In daytime mode, skip features and go to preview
      setCurrentTab(isNighttime ? 'features' : 'preview');
    }
  };

  const toggleFeature = (featureId: string) => {
    setSelectedFeatures((prev) => {
      const isCurrentlySelected = prev.includes(featureId);

      if (isCurrentlySelected) {
        setFeaturePreferences((prevPrefs) => {
          const newPrefs = { ...prevPrefs };
          delete newPrefs[featureId];
          return newPrefs;
        });
        return prev.filter((id) => id !== featureId);
      }

      if (prev.length >= 3) return prev;

      return [...prev, featureId];
    });
  };

  const toggleFeaturePreference = (featureId: string, pref: string) => {
    setFeaturePreferences((prev) => {
      const currentPrefs = prev[featureId] || [];
      const newPrefs = currentPrefs.includes(pref)
        ? currentPrefs.filter((p) => p !== pref)
        : [...currentPrefs, pref];

      return {
        ...prev,
        [featureId]: newPrefs,
      };
    });
  };

  const getTabStatus = (tab: Tab) => {
    if (tab === 'setting') return hasSetting ? '✓' : '';
    if (tab === 'location') return hasLocation ? '✓' : '';
    if (tab === 'character') return hasCharacter ? '✓' : '';
    if (tab === 'gender') return (hasSelfGender && hasOtherGender) ? '✓' : '';
    if (tab === 'trope') return hasTrope ? '✓' : '';
    if (tab === 'features') return selectedFeatures.length > 0 ? `(${selectedFeatures.length})` : '';
    return '';
  };

  // In daytime mode, features are not required; in nighttime mode, they are
  const isComplete = hasSetting && hasLocation && hasCharacter && hasSelfGender && hasOtherGender && hasTrope && (isNighttime ? selectedFeatures.length > 0 : true);

  // Intro screen
  if (!hasStarted) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={[styles.container, { backgroundColor: '#000' }]}>
          {/* Daytime gradient layer */}
          <Animated.View style={[StyleSheet.absoluteFill, daytimeOpacityStyle]}>
            <LinearGradient
              colors={['#7f1d1d', '#92400e', '#78350f', '#451a03']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          {/* Nighttime gradient layer */}
          <Animated.View style={[StyleSheet.absoluteFill, nighttimeOpacityStyle]}>
            <LinearGradient
              colors={['#0f172a', '#1e293b', '#1e1b4b', '#0c0a09']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Animated.View style={[{ flex: 1 }, transitionStyle]}>
          <SafeAreaView style={{ flex: 1 }}>
          <TouchableOpacity 
            onPress={() => router.replace('/(tabs)/create')}
            style={styles.backButton}
          >
            <IconSymbol name="chevron.left" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.introContainer}>
            <View style={styles.introContent}>
              <Text style={[styles.introTitle, { color: '#fff' }]}>craft your recipe</Text>
              <Text style={[styles.introSubtitle, { color: 'rgba(255,255,255,0.7)' }]}>choose the ingredients for your perfect story</Text>
              
              {/* Daytime/Nighttime Toggle */}
              <View style={[styles.modeToggleContainer, styles.modeToggleContainerDark]}>
                <TouchableOpacity
                  style={[styles.modeToggle, !isNighttime && styles.modeToggleActive]}
                  onPress={() => setIsNighttime(false)}
                >
                  <IconSymbol name="sun.max.fill" size={20} color={!isNighttime ? '#030213' : 'rgba(255,255,255,0.5)'} />
                  <View style={styles.modeToggleTextContainer}>
                    <Text style={[styles.modeToggleText, !isNighttime && styles.modeToggleTextActive]}>daytime</Text>
                    <Text style={[styles.nsfwLabel, !isNighttime && styles.nsfwLabelActive]}>bedtime stories, nature descriptions, relaxing audios, etc.</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeToggle, isNighttime && styles.modeToggleActiveDark]}
                  onPress={() => setIsNighttime(true)}
                >
                  <IconSymbol name="moon.stars.fill" size={20} color={isNighttime ? '#030213' : 'rgba(255,255,255,0.5)'} />
                  <View style={styles.modeToggleTextContainer}>
                    <Text style={[styles.modeToggleText, isNighttime ? styles.textDark : { color: 'rgba(255,255,255,0.5)' }]}>nighttime</Text>
                    <Text style={[styles.nsfwLabel, isNighttime && styles.nsfwLabelActive]}>romantic encounters, etc.</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity 
              onPress={() => {
                // Skip fade animation - just start immediately
                setHasStarted(true);
              }} 
              style={styles.continueButton}
            >
              <Text style={styles.continueButtonText}>continue</Text>
              <IconSymbol name="arrow.right" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
        </Animated.View>
        </View>
      </GestureHandlerRootView>
    );
  }

  // Name selection screen
  if (currentTab === 'name') {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
        <Animated.View style={[transitionStyle, { flex: 1 }]}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
            {/* Back Button */}
            <TouchableOpacity 
              onPress={() => setCurrentTab('narration')}
              style={styles.backButton}
            >
              <IconSymbol name="chevron.left" size={28} color={colors.text} />
            </TouchableOpacity>

            {/* Header */}
            <View style={styles.swipeableHeader}>
              <Text style={[styles.swipeableTitle, { color: colors.text }]}>how should we address you?</Text>
              <Text style={[styles.swipeableSubtitle, { color: colors.textSecondary }]}>choose how you&apos;ll be called in the story</Text>
            </View>

            <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingTop: 40, paddingBottom: 100 }]}>
              {/* Name Options */}
              <View style={styles.nameOptionsContainer}>
                {/* Use My Name */}
                <TouchableOpacity
                  style={[styles.nameOption, { backgroundColor: colors.card, borderColor: colors.border }, nameOption === 'my-name' && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground }]}
                  onPress={() => setNameOption('my-name')}
                >
                  <View style={styles.nameOptionContent}>
                    <Text style={[styles.nameOptionTitle, { color: colors.text }, nameOption === 'my-name' && { color: colors.buttonText }]}>
                      use my name
                    </Text>
                    <Text style={[styles.nameOptionSubtitle, { color: colors.textSecondary }, nameOption === 'my-name' && styles.nameOptionSubtitleActive]}>
                      {storedUserName}
                    </Text>
                  </View>
                  {nameOption === 'my-name' && (
                    <IconSymbol name="checkmark.circle.fill" size={24} color={colors.buttonText} />
                  )}
                </TouchableOpacity>

                {/* Use Another Name */}
                <TouchableOpacity
                  style={[styles.nameOption, { backgroundColor: colors.card, borderColor: colors.border }, nameOption === 'custom' && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground }]}
                  onPress={() => setNameOption('custom')}
                >
                  <View style={styles.nameOptionContent}>
                    <Text style={[styles.nameOptionTitle, { color: colors.text }, nameOption === 'custom' && { color: colors.buttonText }]}>
                      use another name
                    </Text>
                    {nameOption === 'custom' ? (
                      <TextInput
                        style={[styles.nameCustomInput, { backgroundColor: colors.background, color: colors.buttonText }]}
                        value={customNameInput}
                        onChangeText={setCustomNameInput}
                        placeholder="enter name..."
                        placeholderTextColor={colors.textSecondary}
                        autoFocus
                      />
                    ) : (
                      <Text style={[styles.nameOptionSubtitle, { color: colors.textSecondary }]}>
                        customize your name
                      </Text>
                    )}
                  </View>
                  {nameOption === 'custom' && customNameInput && (
                    <IconSymbol name="checkmark.circle.fill" size={24} color={colors.buttonText} />
                  )}
                </TouchableOpacity>

                {/* Nameless Audio */}
                <TouchableOpacity
                  style={[styles.nameOption, { backgroundColor: colors.card, borderColor: colors.border }, nameOption === 'nameless' && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground }]}
                  onPress={() => setNameOption('nameless')}
                >
                  <View style={styles.nameOptionContent}>
                    <Text style={[styles.nameOptionTitle, { color: colors.text }, nameOption === 'nameless' && { color: colors.buttonText }]}>
                      generate a nameless audio
                    </Text>
                    <Text style={[styles.nameOptionSubtitle, { color: colors.textSecondary }, nameOption === 'nameless' && styles.nameOptionSubtitleActive]}>
                      you&apos;ll be addressed as &quot;you&quot;
                    </Text>
                  </View>
                  {nameOption === 'nameless' && (
                    <IconSymbol name="checkmark.circle.fill" size={24} color={colors.buttonText} />
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Continue Button */}
            <View style={styles.swipeableFooter}>
              <TouchableOpacity
                onPress={() => setCurrentTab('voice')}
                style={styles.continueButtonRow}
              >
                <Text style={styles.continueTextWhite}>continue</Text>
                <IconSymbol name="arrow.right" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Animated.View>
      </GestureHandlerRootView>
    );
  }

  // Render gender selection with new ButtonPicker
  if (currentTab === 'gender') {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
        <Animated.View style={[transitionStyle, { flex: 1 }]}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
          {/* Back Button */}
          <TouchableOpacity 
            onPress={() => setCurrentTab('trope')}
            style={styles.backButton}
          >
            <IconSymbol name="chevron.left" size={28} color={colors.text} />
          </TouchableOpacity>
          {/* Header */}
          <View style={styles.swipeableHeader}>
            <Text style={[styles.swipeableTitle, { color: colors.text }]}>select genders</Text>
            <Text style={[styles.swipeableSubtitle, { color: colors.textSecondary }]}>choose gender for self and character</Text>
          </View>

          <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingTop: 40, paddingBottom: 100, paddingHorizontal: 24 }]}>
            {/* Self Gender Card */}
            <View style={[styles.genderCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.genderCardLabel, { color: colors.text }]}>self gender</Text>
              <View style={styles.genderPillsRow}>
                {['female', 'male'].map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.genderPill,
                      { backgroundColor: colors.background, borderColor: colors.border },
                      selectedGenderSelf === option && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground },
                    ]}
                    onPress={() => setSelectedGenderSelf(option)}
                  >
                    <Text style={[
                      styles.genderPillText,
                      { color: colors.textSecondary },
                      selectedGenderSelf === option && { color: colors.buttonText },
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
                  selectedGenderSelf !== 'female' && selectedGenderSelf !== 'male' && selectedGenderSelf && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground },
                  { marginTop: 12 },
                ]}
                onPress={() => {
                  if (selectedGenderSelf === 'female' || selectedGenderSelf === 'male' || !selectedGenderSelf) {
                    setSelectedGenderSelf(customGenderSelf || 'custom-trigger');
                  }
                }}
              >
                <TextInput
                  style={[styles.genderPillInput, {
                    color: selectedGenderSelf !== 'female' && selectedGenderSelf !== 'male' && selectedGenderSelf ? colors.buttonText : colors.textSecondary,
                  }]}
                  value={customGenderSelf}
                  onChangeText={(text) => {
                    setCustomGenderSelf(text);
                    setSelectedGenderSelf(text);
                  }}
                  placeholder="enter custom gender"
                  placeholderTextColor={selectedGenderSelf !== 'female' && selectedGenderSelf !== 'male' && selectedGenderSelf ? colors.buttonText + '80' : colors.textSecondary}
                  editable={selectedGenderSelf !== 'female' && selectedGenderSelf !== 'male'}
                  pointerEvents={selectedGenderSelf !== 'female' && selectedGenderSelf !== 'male' ? 'auto' : 'none'}
                />
              </TouchableOpacity>
            </View>

            {/* Character Gender Card */}
            <View style={[styles.genderCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.genderCardLabel, { color: colors.text }]}>character gender</Text>
              <View style={styles.genderPillsRow}>
                {['female', 'male'].map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.genderPill,
                      { backgroundColor: colors.background, borderColor: colors.border },
                      selectedGenderOther === option && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground },
                    ]}
                    onPress={() => setSelectedGenderOther(option)}
                  >
                    <Text style={[
                      styles.genderPillText,
                      { color: colors.textSecondary },
                      selectedGenderOther === option && { color: colors.buttonText },
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
                  selectedGenderOther !== 'female' && selectedGenderOther !== 'male' && selectedGenderOther && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground },
                  { marginTop: 12 },
                ]}
                onPress={() => {
                  if (selectedGenderOther === 'female' || selectedGenderOther === 'male' || !selectedGenderOther) {
                    setSelectedGenderOther(customGenderOther || 'custom-trigger');
                  }
                }}
              >
                <TextInput
                  style={[styles.genderPillInput, {
                    color: selectedGenderOther !== 'female' && selectedGenderOther !== 'male' && selectedGenderOther ? colors.buttonText : colors.textSecondary,
                  }]}
                  value={customGenderOther}
                  onChangeText={(text) => {
                    setCustomGenderOther(text);
                    setSelectedGenderOther(text);
                  }}
                  placeholder="enter custom gender"
                  placeholderTextColor={selectedGenderOther !== 'female' && selectedGenderOther !== 'male' && selectedGenderOther ? colors.buttonText + '80' : colors.textSecondary}
                  editable={selectedGenderOther !== 'female' && selectedGenderOther !== 'male'}
                  pointerEvents={selectedGenderOther !== 'female' && selectedGenderOther !== 'male' ? 'auto' : 'none'}
                />
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Continue Button */}
          <View style={styles.swipeableFooter}>
            <TouchableOpacity
              onPress={() => setCurrentTab(isNighttime ? 'features' : 'narration')}
              style={styles.continueButtonRow}
            >
              <Text style={styles.continueTextWhite}>continue</Text>
              <IconSymbol name="arrow.right" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          </SafeAreaView>
        </Animated.View>
      </GestureHandlerRootView>
    );
  }

  // Render features selection
  if (currentTab === 'features') {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
        <Animated.View style={[transitionStyle, { flex: 1 }]}>
          <SafeAreaView style={[styles.container, { flex: 1, backgroundColor: colors.background }]}>
        {/* Back Button */}
        <TouchableOpacity 
          onPress={() => setCurrentTab('gender')}
          style={styles.backButton}
        >
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 }]}>
          <View style={styles.featuresContainer}>
            <Text style={styles.featuresTitle}>features</Text>
            <Text style={styles.featuresSubtitle}>
              {selectedFeatures.length > 0 ? `${selectedFeatures.length} of 3 selected` : 'select up to 3 features'}
            </Text>

            <View style={styles.featuresGrid}>
              {features.map((feature) => {
                const isSelected = selectedFeatures.includes(feature.id);
                return (
                  <TouchableOpacity
                    key={feature.id}
                    onPress={() => toggleFeature(feature.id)}
                    style={[styles.featureBubble, isSelected && styles.featureBubbleActive]}
                  >
                    <Text style={[styles.featureText, isSelected && styles.featureTextActive]}>{feature.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedFeatures.length > 0 && (
              <View style={styles.featurePreferences}>
                {selectedFeatures.map((featureId) => {
                  const feature = features.find((f) => f.id === featureId);
                  const isCustom = customFeatures.includes(featureId);
                  const featureName = isCustom ? featureId : (feature?.name || featureId);

                  return (
                    <Card key={featureId} style={styles.preferenceCard}>
                      <View style={styles.preferenceHeader}>
                        <Text style={styles.preferenceTitle}>{featureName}</Text>
                        <TouchableOpacity onPress={() => {
                          toggleFeature(featureId);
                          if (isCustom) {
                            setCustomFeatures(prev => prev.filter(f => f !== featureId));
                          }
                        }}>
                          <Text style={styles.removeText}>remove</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.preferenceLabel}>specific details (optional)</Text>
                      <TextInput
                        style={styles.featureSpecificInput}
                        value={featureSpecificDetails[featureId] || ''}
                        onChangeText={(text) => setFeatureSpecificDetails(prev => ({ ...prev, [featureId]: text }))}
                        placeholder="add specific details for this feature..."
                        placeholderTextColor="#666"
                        multiline
                        maxLength={200}
                        textAlignVertical="top"
                      />
                    </Card>
                  );
                })}
              </View>
            )}

            <View style={styles.addCustomFeatureContainer}>
              <Text style={styles.addCustomFeatureLabel}>add your own features</Text>
              <View style={styles.customFeatureInputRow}>
                <TextInput
                  style={styles.customFeatureInput}
                  value={newCustomFeature}
                  onChangeText={setNewCustomFeature}
                  placeholder="type a custom feature..."
                  placeholderTextColor="#666"
                  maxLength={50}
                  onSubmitEditing={() => {
                    const trimmed = newCustomFeature.trim().toLowerCase();
                    if (trimmed && !selectedFeatures.includes(trimmed) && selectedFeatures.length < 3) {
                      setSelectedFeatures(prev => [...prev, trimmed]);
                      setCustomFeatures(prev => [...prev, trimmed]);
                      setNewCustomFeature('');
                    }
                  }}
                />
                <TouchableOpacity
                  style={[styles.addCustomFeatureButton, (!newCustomFeature.trim() || selectedFeatures.length >= 3) && { opacity: 0.3 }]}
                  onPress={() => {
                    const trimmed = newCustomFeature.trim().toLowerCase();
                    if (trimmed && !selectedFeatures.includes(trimmed) && selectedFeatures.length < 3) {
                      setSelectedFeatures(prev => [...prev, trimmed]);
                      setCustomFeatures(prev => [...prev, trimmed]);
                      setNewCustomFeature('');
                    }
                  }}
                  disabled={!newCustomFeature.trim() || selectedFeatures.length >= 3}
                >
                  <IconSymbol name="plus.circle.fill" size={28} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

          </View>
        </ScrollView>
        
        {/* Continue Button */}
        <View style={styles.swipeableFooter}>
          <TouchableOpacity
            onPress={() => setCurrentTab('narration')}
            style={styles.continueButtonRow}
            disabled={selectedFeatures.length === 0}
          >
            <Text style={[styles.continueTextWhite, selectedFeatures.length === 0 && { opacity: 0.3 }]}>continue</Text>
            <IconSymbol name="arrow.right" size={20} color={colors.buttonText} style={{ opacity: selectedFeatures.length === 0 ? 0.3 : 1 }} />
          </TouchableOpacity>
        </View>
          </SafeAreaView>
        </Animated.View>
      </GestureHandlerRootView>
    );
  }

  // Narration Details Screen
  if (currentTab === 'narration') {
    const wordCount = duration === '5min' ? 800 : duration === '10min' ? 1500 : 2300;
    const narrativePercentage = ((10 - narrativeRatio) * 10);
    const directPercentage = (narrativeRatio * 10);

    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
        <Animated.View style={[transitionStyle, { flex: 1 }]}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
          {/* Back Button */}
          <TouchableOpacity 
            onPress={() => setCurrentTab(isNighttime ? 'features' : 'gender')}
            style={styles.backButton}
          >
            <IconSymbol name="chevron.left" size={28} color={colors.text} />
          </TouchableOpacity>
          {/* Header */}
          <View style={styles.swipeableHeader}>
            <Text style={[styles.swipeableTitle, { color: colors.text }]}>narration details</Text>
            <Text style={[styles.swipeableSubtitle, { color: colors.textSecondary }]}>customize your experience</Text>
          </View>

          <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingTop: 40, paddingBottom: 100 }]}>
            {/* Duration Selection */}
            <View style={[styles.durationCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.durationCardLabel, { color: colors.text }]}>duration</Text>
              <View style={styles.durationButtons}>
                {(['5min', '10min', '15min'] as const).map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.durationButton, { backgroundColor: colors.background, borderColor: colors.border }, duration === option && { backgroundColor: colors.buttonBackground, borderColor: colors.buttonBackground }]}
                    onPress={() => setDuration(option)}
                  >
                    <Text style={[styles.durationButtonText, { color: colors.textSecondary }, duration === option && { color: colors.buttonText }]}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Narrative to Direct Slider */}
            <View style={[styles.sliderCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.durationCardLabel, { color: colors.text }]}>narrative style</Text>
              <View style={styles.sliderLabels}>
                <Text style={[styles.sliderLabelText, { color: colors.textSecondary }]}>descriptive ({narrativePercentage}%)</Text>
                <Text style={[styles.sliderLabelText, { color: colors.textSecondary }]}>direct ({directPercentage}%)</Text>
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
          </ScrollView>

          {/* Continue Button */}
          <View style={styles.swipeableFooter}>
            <TouchableOpacity
              onPress={() => setCurrentTab('name')}
              style={styles.continueButtonRow}
            >
              <Text style={styles.continueTextWhite}>continue</Text>
              <IconSymbol name="arrow.right" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          </SafeAreaView>
        </Animated.View>
      </GestureHandlerRootView>
    );
  }

  // Preview screen
  if (currentTab === 'preview') {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
        <Animated.View style={[transitionStyle, { flex: 1 }]}>
          <SafeAreaView style={[styles.container, { flex: 1, backgroundColor: colors.background }]}>
        {/* Back Button */}
        <TouchableOpacity 
          onPress={() => setCurrentTab('name')}
          style={styles.backButton}
        >
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.previewContainer}>
            <IconSymbol name="sparkles" size={40} color={colors.buttonBackground} />
            <Text style={[styles.previewTitle, { color: colors.text }]}>your recipe is ready</Text>
            <Text style={[styles.previewSubtitle, { color: colors.textSecondary }]}>here&apos;s what we&apos;ll create for you</Text>
            <View style={styles.recipeChips}>
              {hasSetting && (
                <View style={[styles.chip, { backgroundColor: colors.card }]}>
                  <Text style={[styles.chipText, { color: colors.text }]}>{settingDisplayValue || resolvedSetting}</Text>
                </View>
              )}
              {hasLocation && (
                <View style={[styles.chip, { backgroundColor: colors.card }]}>
                  <Text style={[styles.chipText, { color: colors.text }]}>{locationDisplayValue || resolvedLocation}</Text>
                </View>
              )}
              {hasCharacter && (
                <View style={[styles.chip, { backgroundColor: colors.card }]}>
                  <Text style={[styles.chipText, { color: colors.text }]}>{characterDisplayValue || resolvedCharacter}</Text>
                </View>
              )}
              {hasTrope && (
                <View style={[styles.chip, { backgroundColor: colors.card }]}>
                  <Text style={[styles.chipText, { color: colors.text }]}>{tropeDisplayValue || resolvedTrope}</Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
        <View style={styles.swipeableFooter}>
          <TouchableOpacity
            style={[styles.listenButton, { backgroundColor: colors.buttonBackground }]}
            onPress={() => {
              const tags = [
                resolvedSetting,
                resolvedLocation,
                resolvedCharacter,
                resolvedTrope,
              ].filter(Boolean);
              
              router.push({
                pathname: '/followup',
                params: {
                  userName: userName,
                  setting: resolvedSetting || '',
                  location: resolvedLocation || '',
                  character: resolvedCharacter || '',
                  genderSelf: selectedGenderSelf || '',
                  genderOther: selectedGenderOther || '',
                  trope: resolvedTrope || '',
                  features: JSON.stringify(selectedFeatures),
                  featurePreferences: JSON.stringify(featurePreferences),
                  isNighttime: isNighttime.toString(),
                  duration: duration,
                  narrativeRatio: narrativeRatio.toString(),
                  voiceId: selectedVoice || '',
                  prompt: '',
                  tags: JSON.stringify(tags),
                },
              });
            }}
          >
            <IconSymbol name="sparkles" size={18} color={colors.buttonText} />
            <Text style={[styles.listenButtonText, { color: colors.buttonText }]}>let&apos;s hear it</Text>
          </TouchableOpacity>
        </View>
          </SafeAreaView>
        </Animated.View>
      </GestureHandlerRootView>
    );
  }

  // Swipeable Pickers Screen (setting, location, character, trope)
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <Animated.View style={[transitionStyle, { flex: 1 }]}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
        {/* Back Button */}
        <TouchableOpacity 
          onPress={() => setHasStarted(false)}
          style={styles.backButton}
        >
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        {/* Header */}
        <View style={styles.swipeableHeader}>
          <Text style={[styles.swipeableTitle, { color: colors.text }]}>select your preferences</Text>
          <Text style={[styles.swipeableSubtitle, { color: colors.textSecondary }]}>swipe to explore options</Text>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingTop: 20, paddingBottom: 32 }]}>
          {/* Setting Picker */}
          <SwipeablePicker
            options={settings}
            label="setting"
            currentIndex={currentIndexes.setting}
            onIndexChange={(index) => {
              setCurrentIndexes({ ...currentIndexes, setting: index });
              setSelectedSetting(settings[index].id);
            }}
            isActive={currentTab === 'setting'}
            onActivate={() => setCurrentTab('setting')}
            customValue={customSetting}
            onCustomChange={setCustomSetting}
            isCustomMode={isCustomMode.setting}
            onToggleCustom={() => setIsCustomMode({ ...isCustomMode, setting: !isCustomMode.setting })}
          />

          {/* Location Picker */}
          <SwipeablePicker
            options={locations}
            label="location"
            currentIndex={currentIndexes.location}
            onIndexChange={(index) => {
              setCurrentIndexes({ ...currentIndexes, location: index });
              setSelectedLocation(locations[index].id);
            }}
            isActive={currentTab === 'location'}
            onActivate={() => setCurrentTab('location')}
            customValue={customLocation}
            onCustomChange={setCustomLocation}
            isCustomMode={isCustomMode.location}
            onToggleCustom={() => setIsCustomMode({ ...isCustomMode, location: !isCustomMode.location })}
          />

          {/* Character Picker */}
          <SwipeablePicker
            options={characters}
            label="character"
            currentIndex={currentIndexes.character}
            onIndexChange={(index) => {
              setCurrentIndexes({ ...currentIndexes, character: index });
              setSelectedCharacter(characters[index].id);
            }}
            isActive={currentTab === 'character'}
            onActivate={() => setCurrentTab('character')}
            customValue={customCharacter}
            onCustomChange={setCustomCharacter}
            isCustomMode={isCustomMode.character}
            onToggleCustom={() => setIsCustomMode({ ...isCustomMode, character: !isCustomMode.character })}
          />

          {/* Trope Picker */}
          <SwipeablePicker
            options={tropes}
            label="trope"
            currentIndex={currentIndexes.trope}
            onIndexChange={(index) => {
              setCurrentIndexes({ ...currentIndexes, trope: index });
              setSelectedTrope(tropes[index].id);
            }}
            isActive={currentTab === 'trope'}
            onActivate={() => setCurrentTab('trope')}
            customValue={customTrope}
            onCustomChange={setCustomTrope}
            isCustomMode={isCustomMode.trope}
            onToggleCustom={() => setIsCustomMode({ ...isCustomMode, trope: !isCustomMode.trope })}
          />
        </ScrollView>

        {/* Continue Button */}
        <View style={styles.swipeableFooter}>
          <TouchableOpacity
            onPress={() => setCurrentTab('gender')}
            style={styles.continueButtonRow}
          >
            <Text style={styles.continueTextWhite}>continue</Text>
            <IconSymbol name="arrow.right" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        </SafeAreaView>
      </Animated.View>
    </GestureHandlerRootView>
  );
}

// Swipeable Picker Component
interface SwipeablePickerProps {
  options: Option[];
  label: string;
  currentIndex: number;
  onIndexChange: (index: number) => void;
  isActive: boolean;
  onActivate: () => void;
  customValue: string;
  onCustomChange: (value: string) => void;
  isCustomMode: boolean;
  onToggleCustom: () => void;
}

function SwipeablePicker({
  options,
  label,
  currentIndex,
  onIndexChange,
  isActive,
  onActivate,
  customValue,
  onCustomChange,
  isCustomMode,
  onToggleCustom,
}: SwipeablePickerProps) {
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      opacity.value = 1 - Math.abs(event.translationX) / 200;
      scale.value = 1 - Math.abs(event.translationX) / 600;
    })
    .onEnd((event) => {
      const threshold = 50;
      if (event.translationX > threshold) {
        // Swipe right - previous
        runOnJS(onIndexChange)((currentIndex - 1 + options.length) % options.length);
      } else if (event.translationX < -threshold) {
        // Swipe left - next
        runOnJS(onIndexChange)((currentIndex + 1) % options.length);
      }
      translateX.value = withSpring(0);
      opacity.value = withSpring(1);
      scale.value = withSpring(1);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <TouchableOpacity activeOpacity={1} onPress={onActivate} style={styles.pickerContainer}>
      {/* Toggle Buttons */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          onPress={() => {
            if (isCustomMode) onToggleCustom();
          }}
        >
          <Text style={styles.labelText}>
            {label}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onToggleCustom}
          style={[
            styles.toggleButton,
            isCustomMode && styles.toggleButtonActive,
          ]}
        >
          <Text style={[styles.toggleText, isCustomMode && styles.toggleTextActive]}>
            custom
          </Text>
        </TouchableOpacity>
      </View>

      {/* Carousel or Custom Input */}
      <View style={styles.carouselWrapper}>
        {isCustomMode ? (
          <View style={[styles.optionCard, isActive && styles.optionCardActive]}>
            <TextInput
              value={customValue}
              onChangeText={onCustomChange}
              placeholder={`enter custom ${label}...`}
              placeholderTextColor="#999"
              style={styles.customInput}
              autoFocus={isActive}
            />
          </View>
        ) : (
          <GestureDetector gesture={panGesture}>
            <Animated.View style={[styles.optionCard, isActive && styles.optionCardActive, animatedStyle]}>
              <Text style={styles.optionCardText}>{options[currentIndex]?.name}</Text>
            </Animated.View>
          </GestureDetector>
        )}
      </View>

      {/* Indicators */}
      <View style={styles.indicatorsContainer}>
        {!isCustomMode && options.map((option, index) => (
          <TouchableOpacity
            key={option.id}
            onPress={() => onIndexChange(index)}
            style={[
              styles.indicator,
              index === currentIndex && styles.indicatorActive,
              index === currentIndex && isActive && styles.indicatorActiveHighlight,
            ]}
          />
        ))}
      </View>
    </TouchableOpacity>
  );
}

// Button Picker Component for Gender Selection
interface ButtonPickerProps {
  label: string;
  options: string[];
  customLabel: string;
  selectedValue: string | null;
  onSelect: (value: string) => void;
  customValue: string;
  onCustomChange: (value: string) => void;
}

function ButtonPicker({
  label,
  options,
  customLabel,
  selectedValue,
  onSelect,
  customValue,
  onCustomChange,
}: ButtonPickerProps) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [savedCustom, setSavedCustom] = useState('');

  const handleCustomSave = () => {
    if (customValue.trim()) {
      setSavedCustom(customValue);
      onSelect(customValue);
      setShowCustomInput(false);
    }
  };

  return (
    <View style={styles.buttonPickerContainer}>
      <Text style={styles.buttonPickerLabel}>{label}</Text>
      <View style={styles.buttonPickerOptions}>
        {options.map((option) => (
          <TouchableOpacity
            key={option}
            onPress={() => {
              onSelect(option);
              setShowCustomInput(false);
            }}
            style={[
              styles.buttonPickerOption,
              selectedValue === option && !showCustomInput && styles.buttonPickerOptionActive,
            ]}
          >
            <Text
              style={[
                styles.buttonPickerOptionText,
                selectedValue === option && !showCustomInput && styles.buttonPickerOptionTextActive,
              ]}
            >
              {option}
            </Text>
          </TouchableOpacity>
        ))}

        {/* Custom Option */}
        <View
          style={[
            styles.buttonPickerOption,
            (showCustomInput || savedCustom) && styles.buttonPickerOptionActive,
          ]}
        >
          {showCustomInput ? (
            <TextInput
              value={customValue}
              onChangeText={onCustomChange}
              onSubmitEditing={handleCustomSave}
              placeholder={customLabel}
              placeholderTextColor="#999"
              style={styles.buttonPickerCustomInput}
              autoFocus
            />
          ) : savedCustom && selectedValue === savedCustom ? (
            <TouchableOpacity
              onPress={() => setShowCustomInput(true)}
              style={{ width: '100%' }}
            >
              <Text style={styles.buttonPickerOptionTextActive}>{savedCustom}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => setShowCustomInput(true)}
              style={{ width: '100%' }}
            >
              <Text style={styles.buttonPickerOptionText}>{customLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 100,
  },
  // Intro screen
  introContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  introContent: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 40,
  },
  introTitle: {
    fontSize: 28,
    fontWeight: '500',
    color: '#030213',
    textAlign: 'center',
    fontFamily: 'EBGaramond-Medium',
  },
  introSubtitle: {
    fontSize: 16,
    color: '#717182',
    textAlign: 'center',
    fontFamily: 'EBGaramond-Regular',
  },
  continueButton: {
    backgroundColor: '#000000',
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  continueButtonText: {
    fontSize: 16,
    color: '#fff',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  // Mode toggle
  modeToggleContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
    padding: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
  },
  modeToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  modeToggleActive: {
    backgroundColor: '#fff',
  },
  modeToggleContainerDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  modeToggleActiveDark: {
    backgroundColor: '#fff',
  },
  modeToggleTextContainer: {
    alignItems: 'center',
  },
  modeToggleText: {
    fontSize: 14,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
  },
  modeToggleTextActive: {
    color: '#030213',
    fontWeight: '500',
  },
  nsfwLabel: {
    fontSize: 9,
    color: '#999',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    marginTop: 2,
  },
  nsfwLabelActive: {
    color: '#666',
  },
  textLight: {
    color: '#fff',
  },
  textDark: {
    color: '#030213',
    fontWeight: '500',
  },
  // Tab navigation
  tabContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    marginBottom: 20,
  },
  tabIndicators: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  tabIndicator: {
    flex: 1,
    height: 8,
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
  },
  tabIndicatorActive: {
    backgroundColor: '#fff',
  },
  tabLabels: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  tabLabel: {
    flex: 1,
    alignItems: 'center',
  },
  tabLabelText: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  tabLabelTextActive: {
    color: '#fff',
    fontWeight: '500',
  },
  // Carousel
  carouselContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  carousel: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 40,
  },
  arrowButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    fontSize: 14,
    color: '#030213',
    textAlign: 'center',
    fontFamily: 'EBGaramond-Regular',
  },
  actions: {
    gap: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  actionButton: {
    width: 192,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shuffleButtonText: {
    fontSize: 14,
    color: '#030213',
    fontFamily: 'EBGaramond-Regular',
  },
  otherSection: {
    marginTop: 24,
    gap: 12,
  },
  orText: {
    fontSize: 13,
    color: '#717182',
    textAlign: 'center',
    fontFamily: 'EBGaramond-Regular',
  },
  otherInput: {
    textAlign: 'center',
  },
  // Gender selection
  genderContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  genderTitle: {
    fontSize: 24,
    fontWeight: '500',
    color: '#030213',
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: 'EBGaramond-Medium',
  },
  genderSubtitle: {
    fontSize: 14,
    color: '#717182',
    textAlign: 'center',
    marginBottom: 48,
    fontFamily: 'EBGaramond-Regular',
  },
  genderSection: {
    marginBottom: 40,
  },
  genderLabel: {
    fontSize: 13,
    color: '#717182',
    textAlign: 'center',
    marginBottom: 12,
    fontFamily: 'EBGaramond-Regular',
  },
  genderButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  genderButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    alignItems: 'center',
  },
  genderButtonActive: {
    backgroundColor: '#030213',
    borderColor: '#030213',
  },
  genderButtonText: {
    fontSize: 14,
    color: '#030213',
    fontFamily: 'EBGaramond-Regular',
  },
  genderButtonTextActive: {
    color: '#fff',
  },
  continueBtn: {
    marginTop: 40,
  },
  // Features
  featuresContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  featuresTitle: {
    fontSize: 24,
    fontWeight: '500',
    color: '#fff',
    textTransform: 'lowercase',
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: 'EBGaramond-Medium',
  },
  featuresSubtitle: {
    fontSize: 14,
    color: '#999',
    textTransform: 'lowercase',
    textAlign: 'center',
    marginBottom: 32,
    fontFamily: 'EBGaramond-Regular',
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  featureBubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#666',
    backgroundColor: 'transparent',
  },
  featureBubbleActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  featureText: {
    fontSize: 14,
    color: '#999',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  featureTextActive: {
    color: '#000',
    fontWeight: '500',
  },
  featurePreferences: {
    gap: 16,
    marginTop: 8,
  },
  preferenceCard: {
    marginBottom: 16,
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    padding: 16,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  preferenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  preferenceTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  removeText: {
    fontSize: 12,
    color: '#999',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  preferenceLabel: {
    fontSize: 12,
    color: '#999',
    textTransform: 'lowercase',
    marginBottom: 8,
    fontFamily: 'EBGaramond-Regular',
  },
  featureSpecificInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    textTransform: 'lowercase',
    minHeight: 60,
    borderWidth: 1,
    borderColor: '#666',
  },
  addCustomFeatureContainer: {
    marginTop: 8,
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    padding: 16,
  },
  addCustomFeatureLabel: {
    fontSize: 12,
    color: '#999',
    textTransform: 'lowercase',
    marginBottom: 12,
    fontFamily: 'EBGaramond-Regular',
  },
  customFeatureInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  customFeatureInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    textTransform: 'lowercase',
    borderWidth: 1,
    borderColor: '#666',
  },
  addCustomFeatureButton: {
    padding: 4,
  },
  // Narration Details
  durationCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    marginHorizontal: 24,
  },
  durationCardLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 16,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  durationButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  durationButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  durationButtonText: {
    fontSize: 14,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  sliderCard: {
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 24,
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
  slider: {
    width: '100%',
    height: 40,
  },
  sliderHint: {
    fontSize: 12,
    textTransform: 'lowercase',
    textAlign: 'center',
    marginTop: 8,
    fontFamily: 'EBGaramond-Regular',
  },
  preferenceButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  prefButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#666',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  prefButtonActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  prefButtonText: {
    fontSize: 14,
    color: '#999',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  prefButtonTextActive: {
    color: '#000',
    fontWeight: '500',
    fontFamily: 'EBGaramond-Medium',
  },
  generateButton: {
    marginTop: 32,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  // Preview
  previewContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 120,
    alignItems: 'center',
  },
  previewTitle: {
    fontSize: 28,
    fontWeight: '500',
    textTransform: 'lowercase',
    marginTop: 20,
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: 'EBGaramond-Medium',
  },
  previewSubtitle: {
    fontSize: 16,
    textTransform: 'lowercase',
    marginBottom: 32,
    textAlign: 'center',
    fontFamily: 'EBGaramond-Regular',
  },
  recipeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 40,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 14,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  listenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 999,
    width: '100%',
  },
  listenButtonText: {
    fontSize: 16,
    fontWeight: '500',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  // Swipeable Screen Layout
  backButton: {
    position: 'absolute',
    top: 40,
    left: 16,
    zIndex: 10,
    padding: 8,
  },
  swipeableHeader: {
    paddingTop: 40,
    paddingBottom: 8,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  swipeableTitle: {
    fontSize: 24,
    fontWeight: '500',
    color: '#fff',
    textTransform: 'lowercase',
    marginBottom: 4,
    fontFamily: 'EBGaramond-Medium',
  },
  swipeableSubtitle: {
    fontSize: 14,
    color: '#999',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  swipeableFooter: {
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  continueButtonRow: {
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
    fontSize: 16,
    color: '#fff',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  // Gender Card Styles
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
  // Swipeable Picker
  pickerContainer: {
    width: '100%',
    marginBottom: 32,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  labelText: {
    fontSize: 16,
    color: '#fff',
    textTransform: 'lowercase',
    fontWeight: '500',
    fontFamily: 'EBGaramond-Medium',
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#666',
    backgroundColor: '#2a2a2a',
  },
  toggleButtonActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  toggleText: {
    fontSize: 14,
    color: '#999',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  toggleTextActive: {
    color: '#000',
    fontWeight: '500',
    fontFamily: 'EBGaramond-Medium',
  },
  carouselWrapper: {
    height: 112,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  optionCard: {
    width: '90%',
    maxWidth: 320,
    height: 112,
    borderRadius: 24,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  optionCardActive: {
    backgroundColor: '#fff',
  },
  optionCardText: {
    fontSize: 14,
    color: '#000',
    textTransform: 'lowercase',
    textAlign: 'center',
    fontFamily: 'EBGaramond-Regular',
  },
  customInput: {
    width: '100%',
    backgroundColor: 'transparent',
    color: '#000',
    fontSize: 14,
    textAlign: 'center',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  indicatorsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    height: 6,
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#444',
  },
  indicatorActive: {
    width: 32,
    backgroundColor: '#666',
  },
  indicatorActiveHighlight: {
    backgroundColor: '#fff',
  },
  // Button Picker
  buttonPickerContainer: {
    width: '100%',
    maxWidth: 320,
    marginHorizontal: 'auto',
    marginBottom: 32,
  },
  buttonPickerLabel: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  buttonPickerOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  buttonPickerOption: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonPickerOptionActive: {
    backgroundColor: '#fff',
  },
  buttonPickerOptionText: {
    fontSize: 14,
    color: '#999',
    textTransform: 'lowercase',
    textAlign: 'center',
    fontFamily: 'EBGaramond-Regular',
  },
  buttonPickerOptionTextActive: {
    color: '#000',
    fontWeight: '500',
    fontFamily: 'EBGaramond-Medium',
  },
  buttonPickerCustomInput: {
    width: '100%',
    backgroundColor: 'transparent',
    color: '#000',
    fontSize: 14,
    textAlign: 'center',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  // Voice Selection
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
  voicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 24,
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
  // Name Selection
  nameOptionsContainer: {
    paddingHorizontal: 24,
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
  nameOptionContent: {
    flex: 1,
    gap: 8,
  },
  nameOptionTitle: {
    fontSize: 18,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  nameOptionSubtitle: {
    fontSize: 14,
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
  },
  nameOptionSubtitleActive: {
    color: '#ccc',
  },
  nameCustomInput: {
    fontSize: 16,
    textTransform: 'lowercase',
    padding: 8,
    borderRadius: 12,
    fontFamily: 'EBGaramond-Regular',
  },
});
