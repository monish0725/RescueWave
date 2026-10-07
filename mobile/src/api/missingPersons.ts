import api, { extractErrorMessage } from './client';
import type { ServerMissingPerson } from '@/types';

interface CreateMissingPersonInput {
  name: string;
  age?: number | null;
  gender?: string | null;
  description?: string | null;
  last_seen_location?: string | null;
  last_seen_lat?: number | null;
  last_seen_lng?: number | null;
  last_seen_date?: string | null;
  search_radius_km?: number | null;
  contact_phone?: string | null;
  photo_url?: string | null;
}

export async function createServerMissingPerson(input: CreateMissingPersonInput): Promise<{ missingPerson: ServerMissingPerson; authoritiesNotified: number }> {
  const { data } = await api.post('/missing-persons', input);
  return data;
}

export async function getMyServerMissingPersons(): Promise<ServerMissingPerson[]> {
  const { data } = await api.get('/missing-persons/mine');
  return data.missingPersons;
}

// Fetches the server's current view of one record — used specifically for
// fields that only ever change server-side after local creation (like
// face_validation_status/_reason, set by the AI service once it actually
// checks the reference photo) and that this app's local-first sync doesn't
// otherwise pull back down. Not a full record refresh/merge — just reads
// what's needed, the same narrow pattern getMissingPersonMatches already uses.
export async function getServerMissingPerson(serverId: string): Promise<ServerMissingPerson> {
  const { data } = await api.get(`/missing-persons/${serverId}`);
  return data.missingPerson;
}

export async function updateServerMissingPerson(id: string, input: Partial<CreateMissingPersonInput & { status: 'missing' | 'found' }>): Promise<ServerMissingPerson> {
  try {
    const { data } = await api.patch(`/missing-persons/${id}`, input);
    return data.missingPerson;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

// Server-side counterpart to MissingRepo.remove() — without this, deleting a
// record on-device left it live on the server: still visible to
// police/authority dashboards and still being actively matched against by
// the AI camera pipeline. Callers should delete the local copy regardless of
// whether this succeeds (matches the "saved locally, sync later" pattern
// used elsewhere), but should warn the person if it fails.
export async function deleteServerMissingPerson(id: string): Promise<void> {
  try {
    await api.delete(`/missing-persons/${id}`);
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

export interface MissingPersonMatch {
  id: string;
  missing_person_id: string;
  camera_id: string | null;
  confidence: number; // ArcFace similarity score, 0-1
  face_detection_score: number | null; // SCRFD's own detection confidence, 0-1 — distinct from the similarity score above
  local_feature_score: number | null;
  ssim_score: number | null;
  final_confidence: number | null;
  match_label: 'high_confidence_match' | 'possible_match_requires_more_frames' | 'no_match' | null;
  verification_status: 'pending' | 'verified' | 'rejected' | 'confirmed_sighting';
  snapshot_url: string | null;
  matched_at: string;
  camera_name: string | null;
  camera_address: string | null;
  camera_lat: number | null;
  camera_lng: number | null;
}

export async function getMissingPersonMatches(serverId: string): Promise<MissingPersonMatch[]> {
  try {
    const { data } = await api.get(`/missing-persons/${serverId}/matches`);
    return data.matches;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}

export async function reviewMissingPersonMatch(
  serverId: string,
  matchId: string,
  verification_status: 'verified' | 'rejected' | 'confirmed_sighting'
): Promise<MissingPersonMatch> {
  try {
    const { data } = await api.patch(`/missing-persons/${serverId}/matches/${matchId}`, { verification_status });
    return data.match;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}
