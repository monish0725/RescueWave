import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import api, { extractErrorMessage } from '@/api/client';
import { SettingsRepo } from '@/db/database';
import { LIVE_SHARE_TASK } from './liveShareTask';

export interface LiveShare {
  id: string;
  share_token: string;
  kind: 'helper_mission' | 'authority_case' | 'contact_share';
  alert_id: string | null;
  label: string | null;
  status: 'active' | 'stopped';
}

function getActiveTokens(): string[] {
  try {
    const parsed = JSON.parse(SettingsRepo.get('active_share_tokens', '[]') ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setActiveTokens(tokens: string[]) {
  SettingsRepo.set('active_share_tokens', JSON.stringify(tokens));
}

async function requestLiveSharePermissions(): Promise<{ foreground: boolean; background: boolean }> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return { foreground: false, background: false };
  const bg = await Location.requestBackgroundPermissionsAsync().catch(() => null);
  return { foreground: true, background: bg?.status === 'granted' };
}

async function ensureTrackingStarted(backgroundAllowed: boolean) {
  if (!backgroundAllowed) return;
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(LIVE_SHARE_TASK).catch(() => false);
  if (alreadyStarted) return;
  await Location.startLocationUpdatesAsync(LIVE_SHARE_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 15000, // ~every 15s
    distanceInterval: 25, // or every 25m, whichever comes first
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'RescueWave is sharing your live location',
      notificationBody: 'Tap to open the app. Stop sharing from Emergency Contacts or your active mission.',
      notificationColor: '#0B1E45',
    },
    pausesUpdatesAutomatically: false,
  });
}

async function stopTrackingIfNoneActive() {
  if (getActiveTokens().length > 0) return;
  const started = await Location.hasStartedLocationUpdatesAsync(LIVE_SHARE_TASK).catch(() => false);
  if (started) await Location.stopLocationUpdatesAsync(LIVE_SHARE_TASK);
}

/** Starts a new live share (helper mission or emergency-contact share) and begins background location pings for it. */
export async function startLiveShare(kind: LiveShare['kind'], opts?: { alertId?: string; label?: string }): Promise<LiveShare> {
  const permissions = await requestLiveSharePermissions();
  if (!permissions.foreground) {
    throw new Error('Location permission is required to share your live location.');
  }
  try {
    const { data } = await api.post('/live-shares', { kind, alert_id: opts?.alertId, label: opts?.label });
    const share: LiveShare = data.share;
    setActiveTokens([...getActiveTokens(), share.share_token]);

    // Send one ping right away so whoever opens the link sees a live point
    // immediately instead of waiting for the first ~15s background tick.
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    await api.post(`/live-shares/${share.share_token}/ping`, { lat: pos.coords.latitude, lng: pos.coords.longitude });
    await ensureTrackingStarted(permissions.background);

    return share;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

export async function stopLiveShare(token: string): Promise<void> {
  try {
    await api.post(`/live-shares/${token}/stop`);
  } catch {
    // Even if the network call fails, stop tracking locally so the person
    // isn't stuck "sharing" with no way to turn it off from the UI.
  }
  setActiveTokens(getActiveTokens().filter((t) => t !== token));
  await stopTrackingIfNoneActive();
}

export function isShareActive(token: string): boolean {
  return getActiveTokens().includes(token);
}

export function shareViewerUrl(baseApiUrl: string, token: string): string {
  // baseApiUrl looks like http://192.168.x.x:4000/api — the share page is
  // served from the same host, one level up, at /share/:token.
  const origin = baseApiUrl.replace(/\/api\/?$/, '');
  return `${origin}/share/${token}`;
}

export const isBackgroundLocationSupported = Platform.OS !== 'web';

// ---------------------------------------------------------------------------
// Per-contact share bookkeeping — lets the Emergency Contacts screen show
// "Stop Sharing" for exactly the contact a share was started for, and
// survives app restarts (stored in local settings, not component state).
// ---------------------------------------------------------------------------
function getContactShareMap(): Record<string, string> {
  try {
    const parsed = JSON.parse(SettingsRepo.get('contact_share_tokens', '{}') ?? '{}');
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function getShareTokenForContact(contactId: string): string | null {
  return getContactShareMap()[contactId] ?? null;
}

export function setShareTokenForContact(contactId: string, token: string | null) {
  const map = getContactShareMap();
  if (token) map[contactId] = token;
  else delete map[contactId];
  SettingsRepo.set('contact_share_tokens', JSON.stringify(map));
}

export function getActiveShareCount(): number {
  return getActiveTokens().length;
}

export async function stopAllLiveShares(): Promise<void> {
  const tokens = getActiveTokens();
  for (const token of tokens) {
    await stopLiveShare(token); // sequential — avoids a lost-update race on the shared token list
  }
}
