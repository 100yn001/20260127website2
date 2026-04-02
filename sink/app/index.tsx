import { getSharedAudio } from '@/services/shared-audio-service';
import { SharedAudio } from '@/types/shared-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const RECEIVED_IDS_KEY = 'sink_received_ids';
const ONE_HOUR_MS = 60 * 60 * 1000;

function timeAgo(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 minute ago';
  return `${mins} minutes ago`;
}

export default function HomeScreen() {
  const router = useRouter();
  const [receivedAudios, setReceivedAudios] = useState<SharedAudio[]>([]);
  const [loading, setLoading] = useState(true);
  const initialUrlHandled = useRef(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    loadReceivedAudios();
    handleInitialURL();
    const sub = Linking.addEventListener('url', handleDeepLink);
    // Refresh "X minutes ago" labels every 30 seconds
    const timer = setInterval(() => setTick(t => t + 1), 30000);
    return () => { sub.remove(); clearInterval(timer); };
  }, []);

  const handleDeepLink = (event: { url: string }) => {
    const sharedId = parseSharedId(event.url);
    if (sharedId) {
      router.replace({ pathname: '/play/[id]', params: { id: sharedId } });
    }
  };

  const handleInitialURL = async () => {
    if (initialUrlHandled.current) return;
    const url = await Linking.getInitialURL();
    if (url) {
      const sharedId = parseSharedId(url);
      if (sharedId) {
        initialUrlHandled.current = true;
        router.replace({ pathname: '/play/[id]', params: { id: sharedId } });
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
      const now = Date.now();
      const audios: SharedAudio[] = [];
      const validIds: string[] = [];
      for (const id of ids) {
        const audio = await getSharedAudio(id);
        if (audio && (now - audio.createdAt.getTime()) < ONE_HOUR_MS) {
          audios.push(audio);
          validIds.push(id);
        }
      }
      // Prune expired IDs from storage
      await AsyncStorage.setItem(RECEIVED_IDS_KEY, JSON.stringify(validIds));
      setReceivedAudios(audios.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
    } catch (error) {
      console.error('Error loading received audios:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter out any that have expired since last load
  const visibleAudios = receivedAudios.filter(a => (Date.now() - a.createdAt.getTime()) < ONE_HOUR_MS);

  const clearAll = async () => {
    await AsyncStorage.removeItem(RECEIVED_IDS_KEY);
    setReceivedAudios([]);
  };

  const renderItem = ({ item }: { item: SharedAudio }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => router.replace({ pathname: '/play/[id]', params: { id: item.id } })}
    >
      <View style={[styles.colorDot, { backgroundColor: item.coverColor || '#333' }]} />
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.cardMeta}>
          {timeAgo(item.createdAt)}
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
        <Text style={styles.logo}>{'{synk}'}</Text>
        {visibleAudios.length > 0 && (
          <TouchableOpacity onPress={clearAll} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
      ) : visibleAudios.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>no stories yet</Text>
          <Text style={styles.emptySubtitle}>
            open a synk link from the web app to play a story here
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleAudios}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  clearButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  clearButtonText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  logo: {
    fontSize: 32,
    color: '#fff',
    fontFamily: 'EBGaramond-SemiBold',
    textTransform: 'lowercase',
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
