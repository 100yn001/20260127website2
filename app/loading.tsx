import { useAuth } from '@/contexts/AuthContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    SafeAreaView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

export default function LoadingScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [statusText, setStatusText] = useState('Generating your story...');
  const [progress, setProgress] = useState(0);

  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    // Pulse animation
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  useEffect(() => {
    generateAudio();
  }, []);

  const generateAudio = async () => {
    try {
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Parse all the data
      const recipeData = {
        userName: params.userName as string,
        setting: params.setting as string,
        location: params.location as string,
        character: params.character as string,
        genderSelf: params.genderSelf as string,
        genderOther: params.genderOther as string,
        trope: params.trope as string,
        features: params.features ? JSON.parse(params.features as string) : [],
        featurePreferences: params.featurePreferences ? JSON.parse(params.featurePreferences as string) : {},
        isNighttime: params.isNighttime === 'true',
        duration: params.duration as string,
        narrativeRatio: params.narrativeRatio ? parseInt(params.narrativeRatio as string) : 5,
        followUpAnswers: params.followUpAnswers ? JSON.parse(params.followUpAnswers as string) : [],
        followUpQuestions: params.followUpQuestions ? JSON.parse(params.followUpQuestions as string) : [],
      };

      // Update status
      setStatusText('thinking...');
      setProgress(20);

      await new Promise(resolve => setTimeout(resolve, 1000));

      setStatusText('Writing your story...');
      setProgress(40);

      // Import the service and call directly - no backend needed!
      const { generateAudioStory } = require('@/services/audio-generation');
      
      const data = await generateAudioStory(recipeData, recipeData.followUpQuestions, recipeData.followUpAnswers, user.uid);

      setStatusText('Bringing your story to life...');
      setProgress(90);

      await new Promise(resolve => setTimeout(resolve, 500));

      // Navigate to audio player with the audio URL and story ID
      router.replace({
        pathname: '/player',
        params: {
          audioUrl: data.audioUrl,
          audioChunkURLs: data.audioChunkURLs?.length ? JSON.stringify(data.audioChunkURLs) : '',
          transcript: data.transcript,
          storyId: data.storyId,
          userName: recipeData.userName,
          setting: recipeData.setting,
          location: recipeData.location,
          character: recipeData.character,
          genderSelf: recipeData.genderSelf,
          genderOther: recipeData.genderOther,
          trope: recipeData.trope,
          isNighttime: recipeData.isNighttime.toString(),
          features: JSON.stringify(recipeData.features),
          duration: recipeData.duration,
          narrativeRatio: recipeData.narrativeRatio.toString(),
        },
      });

    } catch (error) {
      console.error('Error generating audio:', error);
      setStatusText('Something went wrong. Please try again.');
      
      // Optionally navigate back after error
      setTimeout(() => {
        router.back();
      }, 2000);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Animated.View style={[styles.iconContainer, animatedStyle]}>
          <Text style={styles.iconText}>✨</Text>
        </Animated.View>
        
        <Text style={styles.statusText}>{statusText}</Text>
        
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressText}>{progress}%</Text>
        </View>

        <ActivityIndicator size="large" color="#030213" style={styles.spinner} />
        
        <Text style={styles.subtitleText}>This may take a minute or two</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  iconContainer: {
    marginBottom: 32,
  },
  iconText: {
    fontSize: 64,
  },
  statusText: {
    fontSize: 20,
    fontWeight: '500',
    color: '#030213',
    textAlign: 'center',
    marginBottom: 32,
    fontFamily: 'EBGaramond-Medium',
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#ececf0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#030213',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
  },
  spinner: {
    marginBottom: 16,
  },
  subtitleText: {
    fontSize: 14,
    color: '#717182',
    textAlign: 'center',
    fontFamily: 'EBGaramond-Regular',
  },
});
