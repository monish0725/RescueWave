export type UserRole = 'user' | 'helper' | 'authority' | 'admin';
export type AuthorityType = 'police' | 'hospital' | 'fire';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  is_admin: 0 | 1;
  helper_status: string;
  helper_verified: 0 | 1;
  authority_type: AuthorityType | null;
  authority_org: string | null;
  authority_verified: 0 | 1;
  emergencies_attended: number;
  people_helped: number;
  cases_closed: number;
  created_at: string;
}

export interface HelperApplication {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  email: string;
  address: string | null;
  skills: string[] | string;
  availability: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  created_at: string;
}

export interface AuthorityApplication {
  id: string;
  user_id: string;
  authority_type: AuthorityType;
  org_name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  created_at: string;
}

export interface AdminAlert {
  id: string;
  reporter_id: string | null;
  source: 'manual_sos' | 'citizen_report' | 'camera_ai';
  category: string | null;
  description: string | null;
  photo_url: string | null;
  video_url: string | null;
  voice_url: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  status: 'open' | 'assigned' | 'completed' | 'cancelled';
  report_status: 'submitted' | 'under_review' | 'verified' | 'resolved' | 'rejected';
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  assigned_helper_id: string | null;
  assigned_authority_id: string | null;
  authority_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertStatusEvent {
  id: string;
  alert_id: string;
  actor_id: string | null;
  actor_role: 'helper' | 'authority' | 'reporter' | 'system' | null;
  status: string;
  note: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

export interface AlertDetail {
  alert: AdminAlert;
  events: AlertStatusEvent[];
  helper: { id: string; name: string; phone: string | null } | null;
  authority: { id: string; name: string; authority_type: string; authority_org: string | null; phone: string | null } | null;
  reporter: { id: string; name: string; phone: string | null } | null;
}

export interface AdminCamera {
  id: string;
  owner_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  placement: 'indoor' | 'outdoor';
  direction: string | null;
  status: 'active' | 'inactive';
  ai_status: string;
  ai_voice_enabled: 0 | 1 | null;    // null = not reported yet by any ai-service heartbeat, not "disabled"
  ai_emotion_enabled: 0 | 1 | null;
  ai_fall_enabled: 0 | 1 | null;
  stream_url: string | null;
  ai_last_seen_at: string | null;
  created_at: string;
}

export interface AdminMissingPerson {
  id: string;
  reporter_id: string | null;
  name: string;
  age: number | null;
  gender: string | null;
  description: string | null;
  last_seen_location: string | null;
  last_seen_lat: number | null;
  last_seen_lng: number | null;
  last_seen_date: string | null;
  photo_url: string | null;
  face_embedding_status: 'pending' | 'generated' | 'not_applicable';
  face_validation_status: 'ok' | 'rejected' | null;
  face_validation_reason: 'undecodable' | 'no_face' | 'multiple_faces' | 'face_too_small' | 'too_blurry' | null;
  status: 'missing' | 'found';
  created_at: string;
}

export interface AdminMissingPersonMatch {
  id: string;
  missing_person_id: string;
  camera_id: string | null;
  camera_name: string | null;
  camera_address: string | null;
  confidence: number;                          // 0-1 ArcFace cosine similarity
  face_detection_score: number | null;          // 0-1 SCRFD detection confidence, null on older matches
  local_feature_score: number | null;
  ssim_score: number | null;
  final_confidence: number | null;
  match_label: 'high_confidence_match' | 'possible_match_requires_more_frames' | 'no_match' | null;
  snapshot_url: string | null;
  matched_at: string;
  verification_status: 'pending' | 'verified' | 'rejected' | 'confirmed_sighting';
}

export interface AdminStats {
  users: { total: number; public: number; helpers: number; authorities: number; admins: number };
  applications: { helpersPending: number; authoritiesPending: number };
  alerts: { open: number; assigned: number; completedToday: number; total: number; sosTotal: number; reportsTotal: number };
  cameras: { total: number; active: number };
  missingPersons: { active: number; found: number };
}
