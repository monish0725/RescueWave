import api from './client';
import type { AdminAlert, AdminCamera, AdminMissingPerson, AdminMissingPersonMatch, AdminStats, AdminUser, AlertDetail, AuthorityApplication, HelperApplication } from './types';

export async function getStats(): Promise<AdminStats> {
  const { data } = await api.get('/admin/stats');
  return data;
}

export async function getCategoryBreakdown(): Promise<Array<{ category: string; c: number }>> {
  const { data } = await api.get('/admin/stats/categories');
  return data.categories;
}

export async function getTrend(): Promise<Array<{ day: string; c: number }>> {
  const { data } = await api.get('/admin/stats/trend');
  return data.trend;
}

export async function getUsers(params?: { role?: string; search?: string }): Promise<AdminUser[]> {
  const { data } = await api.get('/admin/users', { params });
  return data.users;
}

export async function makeAdmin(id: string): Promise<void> {
  await api.post(`/admin/users/${id}/make-admin`);
}

export async function revokeAdmin(id: string): Promise<void> {
  await api.post(`/admin/users/${id}/revoke-admin`);
}

export async function getAllAlerts(params?: { status?: string; source?: string; category?: string; report_status?: string }): Promise<AdminAlert[]> {
  const { data } = await api.get('/admin/alerts', { params });
  return data.alerts;
}

export async function reviewAlert(
  id: string,
  input: { report_status: AdminAlert['report_status']; severity?: NonNullable<AdminAlert['severity']>; note?: string }
): Promise<AdminAlert> {
  const { data } = await api.patch(`/admin/alerts/${id}/review`, input);
  return data.alert;
}

// Not under /admin/ — this is the same GET /alerts/:id every alert
// participant (reporter/helper/authority) already uses, which also
// answers for an admin (see backend/src/routes/alerts.js: reporter's
// phone requires `involved || req.user.is_admin`; the alert, events,
// helper and authority objects aren't gated at all). Reused as-is rather
// than adding a parallel /admin/alerts/:id route for the same data.
export async function getAlertDetail(id: string): Promise<AlertDetail> {
  const { data } = await api.get(`/alerts/${id}`);
  return data;
}

export async function getAllCameras(): Promise<AdminCamera[]> {
  const { data } = await api.get('/admin/cameras');
  return data.cameras;
}

export async function getAllMissingPersons(status?: string): Promise<AdminMissingPerson[]> {
  const { data } = await api.get('/admin/missing-persons', { params: status ? { status } : undefined });
  return data.missingPersons;
}

export async function updateMissingPersonStatus(id: string, status: AdminMissingPerson['status']): Promise<AdminMissingPerson> {
  const { data } = await api.patch(`/admin/missing-persons/${id}/status`, { status });
  return data.missingPerson;
}

export async function getMissingPersonSightings(missingPersonId: string): Promise<AdminMissingPersonMatch[]> {
  const { data } = await api.get(`/admin/missing-persons/${missingPersonId}/matches`);
  return data.matches;
}

export async function updateSightingVerification(
  missingPersonId: string,
  matchId: string,
  verification_status: 'verified' | 'rejected' | 'confirmed_sighting'
): Promise<AdminMissingPersonMatch> {
  const { data } = await api.patch(`/admin/missing-persons/${missingPersonId}/matches/${matchId}`, { verification_status });
  return data.match;
}

// Helper & Authority applications reuse the same endpoints the mobile app's
// admin-cli.js hits — the dashboard is just another caller of them.
export async function getHelperApplications(status = 'pending'): Promise<HelperApplication[]> {
  const { data } = await api.get('/helpers/admin/applications', { params: { status } });
  return data.applications;
}

export async function reviewHelperApplication(id: string, decision: 'approve' | 'reject', note?: string): Promise<void> {
  await api.post(`/helpers/admin/applications/${id}/${decision}`, { note });
}

export async function getAuthorityApplications(status = 'pending'): Promise<AuthorityApplication[]> {
  const { data } = await api.get('/authorities/admin/applications', { params: { status } });
  return data.applications;
}

export async function reviewAuthorityApplication(id: string, decision: 'approve' | 'reject', note?: string): Promise<void> {
  await api.post(`/authorities/admin/applications/${id}/${decision}`, { note });
}
