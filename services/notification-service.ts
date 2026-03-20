import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const NOTIFICATIONS_ENABLED_KEY = 'notificationsEnabled';

// Configure how notifications appear when app is in foreground
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (e) {
  console.warn('Failed to set notification handler:', e);
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  return true;
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, JSON.stringify(enabled));
}

export async function getNotificationsEnabled(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    if (stored !== null) {
      return JSON.parse(stored);
    }
    return false;
  } catch {
    return false;
  }
}

export async function sendStoryReadyNotification(): Promise<void> {
  const enabled = await getNotificationsEnabled();
  if (!enabled) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'yourname',
      body: 'your story is ready',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now()),
    },
  });
}
