import Constants from 'expo-constants';
import { Platform } from 'react-native';
import api from '@/api/client';
import { ensureNotificationPermission } from './notifications';

/**
 * Registers this device for real Expo push notifications and tells the
 * backend about the token, so it can reach this exact device — used for
 * "SOS nearby" alerts to Helpers and mission-status updates to reporters.
 * Safe to call every time the app starts while logged in; it's a cheap
 * upsert on the backend either way.
 */
export async function registerForPushNotifications(): Promise<void> {
  if (Platform.OS === 'android' && Constants.appOwnership === 'expo') return;
  const granted = await ensureNotificationPermission();
  if (!granted) return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  try {
    const Notifications = require('expo-notifications');
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api.post('/push-tokens/register', { token: data });
  } catch (err) {
    // Push tokens aren't available on some simulators/emulators, and
    // registration can fail offline — neither should block using the app.
    console.warn('Push token registration skipped:', (err as Error)?.message);
  }
}

export async function unregisterCurrentPushToken(): Promise<void> {
  if (Platform.OS === 'android' && Constants.appOwnership === 'expo') return;
  try {
    const Notifications = require('expo-notifications');
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api.post('/push-tokens/unregister', { token: data });
  } catch {
    // best-effort on logout
  }
}

export const supportsPush = Platform.OS === 'ios' || Platform.OS === 'android';
