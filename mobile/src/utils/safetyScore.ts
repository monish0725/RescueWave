import { AlertsRepo, ContactsRepo } from '@/db/database';
import type { AuthUser } from '@/types';

export interface SafetySnapshot {
  score: number; // 0-100
  label: 'Good' | 'Fair' | 'Needs Attention';
  areaStatus: 'SAFE' | 'CAUTION' | 'ELEVATED RISK' | 'HIGH RISK' | 'SAFETY DATA LIMITED';
  statusReason: string;
  factors: Array<{ label: string; met: boolean }>;
}

/**
 * A transparent, rule-based "preparedness" score computed entirely from
 * real on-device data (contacts saved, unresolved alerts, location access,
 * profile completeness). This is deliberately NOT framed as a live/AI area
 * risk score — RescueWave doesn't have a real-time threat model yet, and
 * faking one would violate the "no fake data" rule. It tells the user how
 * ready THEY are, not how dangerous their surroundings are.
 */
export function computeSafetySnapshot(user: AuthUser | null, hasLocation: boolean): SafetySnapshot {
  const activeAlerts = AlertsRepo.countActive();
  const contacts = ContactsRepo.all().length > 0;
  const noActiveAlerts = activeAlerts === 0;
  const profileComplete = !!(user?.phone && user?.blood_group);

  const factors = [
    { label: 'Emergency contacts added', met: contacts },
    { label: 'No unresolved alerts', met: noActiveAlerts },
    { label: 'Location access enabled', met: hasLocation },
    { label: 'Medical profile complete', met: profileComplete },
  ];

  const weights = [25, 35, 20, 20];
  const score = factors.reduce((sum, f, i) => sum + (f.met ? weights[i] : 0), 0);
  const label = score >= 80 ? 'Good' : score >= 50 ? 'Fair' : 'Needs Attention';
  const hasLocalSafetyData = hasLocation || activeAlerts > 0;
  const areaStatus = !hasLocalSafetyData
    ? 'SAFETY DATA LIMITED'
    : activeAlerts >= 3
      ? 'HIGH RISK'
      : activeAlerts === 2
        ? 'ELEVATED RISK'
        : activeAlerts === 1
          ? 'CAUTION'
          : 'SAFE';
  const statusReason = !hasLocalSafetyData
    ? 'Enable location or sync nearby alerts to calculate a live area status.'
    : activeAlerts === 0
      ? 'No unresolved RescueWave alerts are saved near your current session.'
      : `${activeAlerts} unresolved RescueWave alert${activeAlerts === 1 ? '' : 's'} in your local alert history.`;

  return { score, label, areaStatus, statusReason, factors };
}
