import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { NotificationsRepo, SettingsRepo } from '@/db/database';
import type { NotificationType } from '@/types';

function getNotifications() {
  if (Platform.OS === 'android' && Constants.appOwnership === 'expo') {
    return null;
  }
  try {
    return require('expo-notifications');
  } catch (err) {
    console.warn('OS notifications disabled in this runtime:', (err as Error)?.message);
    return null;
  }
}

let handlerConfigured = false;

function getUsableNotifications() {
  const Notifications = getNotifications();
  if (!Notifications) return null;
  if (!handlerConfigured) {
    Notifications.setNotificationHandler?.({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    handlerConfigured = true;
  }
  return Notifications;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const Notifications = getUsableNotifications();
  if (!Notifications) return false;
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'RescueWave Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1a7a3c',
    });
  }
  return status === 'granted';
}

/**
 * Fires a real local device notification AND writes it to the in-app
 * Notification Center (SQLite) so the history survives even if the OS
 * notification is dismissed. This is what backs "SOS created", "Missing
 * person added" and "Emergency contact updated" notifications.
 *
 * The in-app history entry is always recorded — it's just this device's
 * own log, not a delivered notification. The actual OS-level notification
 * (banner/sound) respects the person's "Push Notifications" Settings
 * toggle: when they've turned it off, we must not push one at them even
 * though permission is technically granted at the OS level.
 */
export async function notify(title: string, body: string, type: NotificationType) {
  NotificationsRepo.create({ title, body, type });
  const Notifications = getUsableNotifications();
  if (!Notifications) return;
  const notificationsEnabled = SettingsRepo.get('notifications_enabled', '1') === '1';
  if (!notificationsEnabled) return;
  const granted = await ensureNotificationPermission();
  if (granted) {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true, priority: Notifications.AndroidNotificationPriority.HIGH },
      trigger: null, // fire immediately
    });
  }
}
