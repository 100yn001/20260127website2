import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const questions = [
  { top: 'moon', bottom: 'sun', key: 'personality' },
  { top: 'needle', bottom: 'thread', key: 'preference' },
];

const objects = ['mirror', 'hourglass', 'globe', 'violin', 'kite', 'magnet'];

export default function CharacterQuizScreen() {
  const router = useRouter();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [step, setStep] = useState<'quiz' | 'object'>('quiz');
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [selectedObject, setSelectedObject] = useState<string | null>(null);

  const handleBack = () => {
    router.push('/(tabs)/mystories');
  };

  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 1200 });
  }, [step, questionIndex]);

  const handleChoice = (choice: string) => {
    setSelectedChoice(choice);

    setTimeout(() => {
      if (questionIndex < questions.length - 1) {
        setQuestionIndex(questionIndex + 1);
        setSelectedChoice(null);
        opacity.value = 0;
        opacity.value = withDelay(300, withTiming(1, { duration: 800 }));
      } else {
        opacity.value = withTiming(0, { duration: 600 });
        setTimeout(() => {
          setStep('object');
          opacity.value = 0;
          opacity.value = withTiming(1, { duration: 800 });
        }, 600);
      }
    }, 1500);
  };

  const handleObjectChoice = (object: string) => {
    setSelectedObject(object);
    
    setTimeout(() => {
      opacity.value = withTiming(0, { duration: 600 });
      setTimeout(() => {
        // Loop back to start
        setQuestionIndex(0);
        setStep('quiz');
        setSelectedChoice(null);
        setSelectedObject(null);
        opacity.value = 0;
        opacity.value = withTiming(1, { duration: 800 });
      }, 600);
    }, 1500);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const currentQuestion = questions[questionIndex];

  if (step === 'quiz') {
    return (
      <View style={styles.container}>
        {/* Back Button */}
        <TouchableOpacity 
          style={styles.backButton}
          onPress={handleBack}
        >
          <IconSymbol name="chevron.left" size={28} color="#fff" />
        </TouchableOpacity>

        <Animated.View style={[styles.quizContainer, animatedStyle]}>
          <TouchableOpacity
            style={styles.quizTop}
            onPress={() => handleChoice(currentQuestion.top)}
            activeOpacity={0.9}
          >
            <Text style={[
              styles.quizText,
              selectedChoice === currentQuestion.top && styles.selectedText
            ]}>
              {currentQuestion.top}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quizBottom}
            onPress={() => handleChoice(currentQuestion.bottom)}
            activeOpacity={0.9}
          >
            <Text style={[
              styles.quizText,
              selectedChoice === currentQuestion.bottom && styles.selectedText
            ]}>
              {currentQuestion.bottom}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  if (step === 'object') {
    return (
      <View style={styles.container}>
        {/* Back Button */}
        <TouchableOpacity 
          style={styles.backButton}
          onPress={handleBack}
        >
          <IconSymbol name="chevron.left" size={28} color="#fff" />
        </TouchableOpacity>

        <Animated.View style={[styles.fullScreen, animatedStyle]}>
          <View style={styles.centered}>
            <Text style={styles.subtitle}>choose one</Text>
            <View style={styles.objectGrid}>
              {objects.map((obj) => (
                <TouchableOpacity
                  key={obj}
                  style={styles.objectButton}
                  onPress={() => handleObjectChoice(obj)}
                >
                  <Text style={[
                    styles.objectText,
                    selectedObject === obj && styles.selectedText
                  ]}>
                    {obj}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Animated.View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 24,
    zIndex: 10,
    padding: 8,
  },
  quizContainer: {
    flex: 1,
    width: '100%',
  },
  quizTop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quizBottom: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quizText: {
    fontSize: 18,
    color: '#fff',
    fontFamily: 'EBGaramond-Regular',
  },
  selectedText: {
    textDecorationLine: 'underline',
  },
  fullScreen: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  subtitle: {
    fontSize: 24,
    color: '#fff',
    marginBottom: 40,
    textAlign: 'center',
    fontFamily: 'EBGaramond-Regular',
  },
  objectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 24,
    maxWidth: 300,
  },
  objectButton: {
    padding: 12,
  },
  objectText: {
    fontSize: 18,
    color: '#fff',
    fontFamily: 'EBGaramond-Regular',
  },
});
