// Web no-op for notification service — web doesn't use push notifications

const NOTIFICATIONS_ENABLED_KEY = 'notificationsEnabled';

export async function requestNotificationPermissions(): Promise<boolean> {
  return false;
}

export async function setNotificationsEnabled(_enabled: boolean): Promise<void> {
  // no-op on web
}

export async function getNotificationsEnabled(): Promise<boolean> {
  return false;
}

export async function sendStoryReadyNotification(): Promise<void> {
  // no-op on web
}
