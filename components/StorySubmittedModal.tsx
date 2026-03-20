import React, { useState } from 'react';
import {
    Dimensions,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

const profileBinaries = [
  ['wax', 'wane'], ['dawn', 'dusk'], ['north', 'south'], ['east', 'west'],
  ['river', 'delta'], ['shore', 'deep'], ['ash', 'ember'], ['frost', 'thaw'],
  ['iron', 'silk'], ['glass', 'stone'], ['bone', 'blood'], ['nerve', 'sinew'],
  ['spark', 'cinder'], ['pulse', 'echo'], ['mirror', 'shadow'], ['lock', 'key'],
  ['map', 'territory'], ['root', 'branch'], ['storm', 'calm'], ['ink', 'paper'],
  ['tidepool', 'trench'], ['drift', 'anchor'], ['flare', 'afterglow'], ['hush', 'howl'],
  ['blaze', 'smoke'], ['salt', 'sugar'], ['velvet', 'steel'], ['quartz', 'clay'],
  ['willow', 'cinder'], ['hawk', 'heron'], ['fang', 'feather'], ['shell', 'pearl'],
  ['reed', 'river'], ['knot', 'rope'], ['blade', 'sheath'], ['crown', 'thorn'],
  ['veil', 'vow'], ['door', 'threshold'], ['orbit', 'gravity'], ['myth', 'memory'],
  ['cradle', 'grave'], ['lantern', 'night'], ['thunder', 'lightning'], ['breeze', 'gale'],
  ['rain', 'river'], ['creek', 'canyon'], ['sand', 'glass'], ['soot', 'ivory'],
  ['silver', 'charcoal'], ['marble', 'moss'], ['skin', 'scar'], ['marrow', 'bone'],
  ['scent', 'smoke'], ['tremor', 'stillness'], ['candle', 'shadow'], ['ring', 'riddle'],
  ['script', 'stage'], ['oath', 'secret'], ['horizon', 'harbor'], ['satellite', 'signal'],
];

const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

interface StorySubmittedModalProps {
  visible: boolean;
  onKeepCreating: () => void;
  onBuildProfile: (answers: Record<string, string>) => void;
  onGoToStories: () => void;
}

export function StorySubmittedModal({
  visible,
  onKeepCreating,
  onBuildProfile,
  onGoToStories,
}: StorySubmittedModalProps) {
  const [showQuiz, setShowQuiz] = useState(false);
  const [questions] = useState(() => shuffleArray(profileBinaries).slice(0, 5));
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const handleChoice = (choice: string) => {
    setSelectedChoice(choice);
    const currentQ = questions[questionIndex];
    const key = `${currentQ[0]}_${currentQ[1]}`;
    const newAnswers = { ...answers, [key]: choice };
    setAnswers(newAnswers);

    setTimeout(() => {
      opacity.value = withTiming(0, { duration: 400 });
      setTimeout(() => {
        if (questionIndex < questions.length - 1) {
          setQuestionIndex(questionIndex + 1);
          setSelectedChoice(null);
          opacity.value = withTiming(1, { duration: 500 });
        } else {
          onBuildProfile(newAnswers);
          // Reset state
          setShowQuiz(false);
          setQuestionIndex(0);
          setAnswers({});
          setSelectedChoice(null);
          opacity.value = 1;
        }
      }, 450);
    }, 800);
  };

  const handleBack = () => {
    setShowQuiz(false);
    setQuestionIndex(0);
    setAnswers({});
    setSelectedChoice(null);
    opacity.value = 1;
    onGoToStories();
  };

  if (!visible) return null;

  if (showQuiz) {
    const currentQ = questions[questionIndex];
    const isTopSelected = selectedChoice === currentQ[0];
    const isBottomSelected = selectedChoice === currentQ[1];

    return (
      <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.quizOverlay}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backText}>← my stories</Text>
          </TouchableOpacity>
          
          <View style={styles.quizContainer}>
            <TouchableOpacity
              style={styles.quizTop}
              onPress={() => handleChoice(currentQ[0])}
              disabled={selectedChoice !== null}
            >
              <Animated.Text style={[
                styles.quizText,
                isTopSelected && styles.selectedText,
                animatedStyle,
                isBottomSelected && { opacity: 0 }
              ]}>
                {currentQ[0]}
              </Animated.Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quizBottom}
              onPress={() => handleChoice(currentQ[1])}
              disabled={selectedChoice !== null}
            >
              <Animated.Text style={[
                styles.quizText,
                isBottomSelected && styles.selectedText,
                animatedStyle,
                isTopSelected && { opacity: 0 }
              ]}>
                {currentQ[1]}
              </Animated.Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>story submitted!</Text>
          <Text style={styles.message}>
            your story will be ready in a few minutes. we&apos;ll send you a notification when it&apos;s done
          </Text>

          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={onKeepCreating}
            >
              <Text style={styles.primaryButtonText}>keep creating</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={() => setShowQuiz(true)}
            >
              <Text style={styles.secondaryButtonText}>add to profile</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 32,
    width: width - 48,
    maxWidth: 340,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
    fontFamily: 'EBGaramond-Medium',
  },
  message: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
    fontFamily: 'EBGaramond-Regular',
  },
  buttons: {
    width: '100%',
    gap: 12,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#2b2b34',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'EBGaramond-Medium',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'EBGaramond-Medium',
  },
  quizOverlay: {
    flex: 1,
    backgroundColor: '#000',
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 24,
    zIndex: 10,
  },
  backText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 16,
    fontFamily: 'EBGaramond-Regular',
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
    fontSize: 20,
    color: '#fff',
    fontFamily: 'EBGaramond-Regular',
  },
  selectedText: {
    textDecorationLine: 'underline',
  },
});
