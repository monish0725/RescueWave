import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { SettingsRepo } from '@/db/database';
import api from '@/api/client';

export const LIVE_SHARE_TASK = 'rescuewave-live-share-location';

/**
 * One background location task backs every active live share — a Helper's
 * mission share and a user's "share with emergency contact" share can both
 * be active at once, so we keep a small list of active share tokens in
 * local settings and ping all of them on each location update. Defined at
 * module scope (imported once from app/_layout.tsx) so it survives app
 * backgrounding/restarts, as TaskManager requires.
 */
TaskManager.defineTask(LIVE_SHARE_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('Live share location task error', error);
    return;
  }
  const { locations } = (data as { locations: Location.LocationObject[] }) || { locations: [] };
  const latest = locations?.[locations.length - 1];
  if (!latest) return;

  const tokens = getActiveTokens();
  if (tokens.length === 0) return;

  await Promise.all(
    tokens.map((token) =>
      api.post(`/live-shares/${token}/ping`, { lat: latest.coords.latitude, lng: latest.coords.longitude }).catch(() => {
        // Offline or the share was already stopped server-side — the next
        // successful ping will catch it back up. Never crash the task.
      })
    )
  );
});

function getActiveTokens(): string[] {
  const raw = SettingsRepo.get('active_share_tokens', '[]');
  try {
    const parsed = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
