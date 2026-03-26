import { getSharedAudio } from '@/services/shared-audio-service';
import { SharedAudio } from '@/types/shared-audio';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RECEIVED_IDS_KEY = 'sink_received_ids';

export default function HomeScreen() {
  const router = useRouter();
  const [receivedAudios, setReceivedAudios] = useState<SharedAudio[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReceivedAudios();
    handleInitialURL();
    const sub = Linking.addEventListener('url', handleDeepLink);
    return () => sub.remove();
  }, []);

  const handleDeepLink = (event: { url: string }) => {
    const sharedId = parseSharedId(event.url);
    if (sharedId) {
      router.push({ pathname: '/play/[id]', params: { id: sharedId } });
    }
  };

  const handleInitialURL = async () => {
    const url = await Linking.getInitialURL();
    if (url) {
      const sharedId = parseSharedId(url);
      if (sharedId) {
        router.push({ pathname: '/play/[id]', params: { id: sharedId } });
      }
    }
  };

  const parseSharedId = (url: string): string | null => {
    // Handle sink://play/SHARED_ID
    const match = url.match(/sink:\/\/play\/(.+)/);
    return match ? match[1] : null;
  };

  const loadReceivedAudios = async () => {
    try {
      const stored = await AsyncStorage.getItem(RECEIVED_IDS_KEY);
      const ids: string[] = stored ? JSON.parse(stored) : [];
      const audios: SharedAudio[] = [];
      for (const id of ids) {
        const audio = await getSharedAudio(id);
        if (audio) audios.push(audio);
      }
      setReceivedAudios(audios.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
    } catch (error) {
      console.error('Error loading received audios:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: SharedAudio }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => router.push({ pathname: '/play/[id]', params: { id: item.id } })}
    >
      <View style={[styles.colorDot, { backgroundColor: item.coverColor || '#333' }]} />
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.cardMeta}>
          {item.duration || ''} {item.played ? '· played' : '· new'}
        </Text>
      </View>
      <View style={styles.playIcon}>
        <Text style={styles.playIconText}>▶</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>{'{sink}'}</Text>
        <Text style={styles.subtitle}>your stories, locally</Text>
      </View>

      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
      ) : receivedAudios.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>no stories yet</Text>
          <Text style={styles.emptySubtitle}>
            open a sink link from the web app to receive a story here
          </Text>
        </View>
      ) : (
        <FlatList
          data={receivedAudios}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  logo: {
    fontSize: 32,
    color: '#fff',
    fontFamily: 'EBGaramond-SemiBold',
    textTransform: 'lowercase',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    marginTop: 2,
  },
  list: {
    paddingHorizontal: 24,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 16,
    gap: 14,
  },
  colorDot: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    color: '#fff',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  cardMeta: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    marginTop: 2,
  },
  playIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIconText: {
    color: '#fff',
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
  },
  emptyTitle: {
    fontSize: 24,
    color: '#fff',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    textAlign: 'center',
  },
});
