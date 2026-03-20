import NarratorArtwork, { getRandomNarratorColor } from '@/components/NarratorArtwork';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { auth, db } from '@/config/firebase';
import { useTheme } from '@/contexts/ThemeContext';
import { Narrator } from '@/types/narrator';
import { useRouter } from 'expo-router';
import { collection, onSnapshot } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

export default function NarratorSelectionScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [narrators, setNarrators] = useState<Narrator[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setIsLoading(false);
      return;
    }

    const narratorsRef = collection(db, 'users', user.uid, 'narrators');

    const unsubscribe = onSnapshot(narratorsRef, (snapshot) => {
      const narratorsList = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        } as Narrator;
      });

      setNarrators(narratorsList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSelectNarrator = (narrator: Narrator) => {
    // Navigate to narrator-based story creation with narrator data
    router.push({
      pathname: '/narrator-story',
      params: {
        narratorId: narrator.id,
        narratorName: narrator.name,
        narratorData: JSON.stringify(narrator),
      },
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">select narrator</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.text} />
          </View>
        )}

        {!isLoading && narrators.length === 0 && (
          <View style={styles.emptyState}>
            <IconSymbol name="person.wave.2" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>no narrators yet</Text>
            <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>create your first narrator to get started</Text>
            <TouchableOpacity
              style={[styles.createButton, { backgroundColor: colors.text }]}
              onPress={() => router.push('/create-narrator')}
            >
              <Text style={[styles.createButtonText, { color: colors.background }]}>create narrator</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isLoading && narrators.length > 0 && (
          <View style={styles.narratorsList}>
            {narrators.map((narrator) => (
              <TouchableOpacity
                key={narrator.id}
                style={[styles.narratorCard, { backgroundColor: colors.card }]}
                onPress={() => handleSelectNarrator(narrator)}
              >
                <View style={styles.narratorCardContent}>
                  <NarratorArtwork 
                    color={narrator.color || getRandomNarratorColor(narrator.id)} 
                    size={96} 
                  />
                  <View style={styles.narratorInfo}>
                    <Text style={[styles.narratorName, { color: colors.text }]}>{narrator.name}</Text>
                    <Text style={[styles.narratorGender, { color: colors.textSecondary }]}>
                      {narrator.gender === 'other' && narrator.customGender
                        ? narrator.customGender
                        : narrator.gender}
                    </Text>
                    <Text style={[styles.narratorRelationship, { color: colors.textSecondary }]} numberOfLines={1}>
                      {narrator.relationship}
                    </Text>
                  </View>
                  <IconSymbol name="arrow.right" size={24} color={colors.text} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 8,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '500',
    color: '#030213',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 100,
  },
  emptyText: {
    fontSize: 18,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  emptyHint: {
    fontSize: 14,
    color: '#999',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  createButton: {
    marginTop: 16,
    backgroundColor: '#030213',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 999,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  narratorsList: {
    gap: 12,
  },
  narratorCard: {
    backgroundColor: '#f7f7f8',
    borderRadius: 16,
    padding: 20,
  },
  narratorCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  narratorInfo: {
    flex: 1,
  },
  narratorName: {
    fontSize: 18,
    fontWeight: '500',
    color: '#030213',
    marginBottom: 4,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  narratorGender: {
    fontSize: 14,
    color: '#717182',
    marginBottom: 4,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  narratorRelationship: {
    fontSize: 14,
    color: '#999',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
});
