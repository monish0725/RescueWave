import api, { extractErrorMessage } from './client';
import type { ServerAlert, ServerAlertEvent, AssignedHelperInfo, AssignedAuthorityInfo, MissionStatus, AuthorityCaseStatus, ServerAlertSource } from '@/types';

interface CreateAlertInput {
  source?: ServerAlertSource;
  description?: string;
  category?: string;
  lat?: number;
  lng?: number;
  address?: string;
  photo_url?: string;
  video_url?: string;
  voice_url?: string;
}

export async function createServerAlert(input: CreateAlertInput): Promise<{
  alert: ServerAlert;
  helpersNotified: number;
  authoritiesNotified: number;
  cameraCoverage?: { nearbyCameraCount: number; nearbyAiCameraCount: number };
}> {
  const { data } = await api.post('/alerts', input); // let network errors surface as-is — caller decides how to degrade
  return data;
}

export async function getAlertDetail(id: string): Promise<{
  alert: ServerAlert;
  events: ServerAlertEvent[];
  helper: AssignedHelperInfo | null;
  authority: AssignedAuthorityInfo | null;
  reporter: { id: string; name: string; phone: string | null; blood_group: string | null; medical_info: string | null } | null;
  liveShareToken: string | null;
}> {
  const { data } = await api.get(`/alerts/${id}`);
  return data;
}

export async function getMyServerAlerts(): Promise<ServerAlert[]> {
  const { data } = await api.get('/alerts/mine');
  return data.alerts;
}

export async function cancelServerAlert(id: string): Promise<void> {
  try {
    await api.post(`/alerts/${id}/cancel`);
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

// --- Helper track --------------------------------------------------------------
export async function getHelperAssignments(): Promise<{ open: ServerAlert[]; assigned: ServerAlert[] }> {
  const { data } = await api.get('/alerts/assignments');
  return data;
}

export async function acceptAssignment(id: string): Promise<ServerAlert> {
  try {
    const { data } = await api.post(`/alerts/${id}/accept`);
    return data.alert;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

export async function rejectAssignment(id: string): Promise<void> {
  await api.post(`/alerts/${id}/reject`).catch(() => {});
}

export async function updateMissionStatus(id: string, status: MissionStatus, opts?: { note?: string; lat?: number; lng?: number }): Promise<ServerAlert> {
  try {
    const { data } = await api.post(`/alerts/${id}/status`, { status, ...opts });
    return data.alert;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

// --- Authority track -------------------------------------------------------------
export async function getAuthorityAssignments(): Promise<{ open: ServerAlert[]; assigned: ServerAlert[] }> {
  const { data } = await api.get('/alerts/authority-assignments');
  return data;
}

export async function acceptAuthorityCase(id: string): Promise<ServerAlert> {
  try {
    const { data } = await api.post(`/alerts/${id}/authority/accept`);
    return data.alert;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

export async function updateAuthorityCaseStatus(id: string, status: AuthorityCaseStatus, opts?: { note?: string; lat?: number; lng?: number }): Promise<ServerAlert> {
  try {
    const { data } = await api.post(`/alerts/${id}/authority/status`, { status, ...opts });
    return data.alert;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}
