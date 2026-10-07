export type UserRole = 'user' | 'helper' | 'authority' | 'admin';
export type HelperStatus = 'available' | 'busy' | 'offline';
export type HelperSkill = 'first_aid' | 'medical' | 'security' | 'general_volunteer';
export type AuthorityType = 'police' | 'hospital' | 'fire';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  blood_group: string | null;
  medical_info: string | null;
  role: UserRole;
  is_admin: 0 | 1;
  helper_status: HelperStatus;
  helper_verified: 0 | 1;
  helper_skills: string | null; // JSON-encoded array on the wire
  helper_lat: number | null;
  helper_lng: number | null;
  helper_location_updated_at: string | null;
  emergencies_attended: number;
  people_helped: number;
  helper_rating: number | null;
  authority_type: AuthorityType | null;
  authority_org: string | null;
  authority_verified: 0 | 1;
  authority_lat: number | null;
  authority_lng: number | null;
  authority_location_updated_at: string | null;
  cases_closed: number;
  created_at: string;
}

export type HelperApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface HelperApplication {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  email: string;
  address: string | null;
  id_proof_uri: string | null;
  skills: HelperSkill[];
  availability: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  status: HelperApplicationStatus;
  admin_note: string | null;
  reviewed_at: string | null;
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
  license_or_badge_id: string | null;
  status: HelperApplicationStatus;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export type ServerAlertStatus = 'open' | 'assigned' | 'completed' | 'cancelled';
export type ServerReportStatus = 'submitted' | 'under_review' | 'verified' | 'resolved' | 'rejected';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type MissionStatus = 'accepted' | 'on_the_way' | 'arrived' | 'assisting' | 'completed';
export type AuthorityCaseStatus = 'accepted' | 'en_route' | 'on_scene' | 'investigating' | 'closed';
export type ServerAlertSource = 'manual_sos' | 'citizen_report' | 'camera_ai';

export interface ServerAlert {
  id: string;
  reporter_id: string | null;
  source: ServerAlertSource;
  category: string | null;
  description: string | null;
  photo_url: string | null;
  video_url: string | null;
  voice_url: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  status: ServerAlertStatus;
  report_status: ServerReportStatus;
  severity: AlertSeverity | null;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  assigned_helper_id: string | null;
  assigned_authority_id: string | null;
  authority_status: AuthorityCaseStatus | null;
  distanceKm?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ServerAlertEvent {
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

export interface AssignedHelperInfo {
  id: string;
  name: string;
  phone: string | null;
  helper_lat: number | null;
  helper_lng: number | null;
  helper_location_updated_at: string | null;
  helper_rating: number | null;
}

export interface AssignedAuthorityInfo {
  id: string;
  name: string;
  authority_type: AuthorityType;
  authority_org: string | null;
  phone: string | null;
  authority_lat: number | null;
  authority_lng: number | null;
  authority_location_updated_at: string | null;
}

export type AlertType = 'sos' | 'report';
export type AlertCategory =
  | 'low_lighting'
  | 'crowded_area'
  | 'suspicious_activity'
  | 'harassment'
  | 'accident'
  | 'medical'
  | 'fire'
  | 'road_hazard'
  | 'missing_person'
  | 'violence'
  | 'theft'
  | 'other';
export type AlertStatus = 'active' | 'resolved';

export interface AlertRecord {
  id: string;
  type: AlertType;
  category: AlertCategory | null;
  description: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  status: AlertStatus;
  photo_uri: string | null; // local device URI, before/after upload
  video_uri: string | null;
  voice_uri: string | null;
  server_alert_id: string | null; // set once this SOS/report has been dispatched to the backend
  created_at: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  relation: string | null;
  created_at: string;
}

export type MissingStatus = 'missing' | 'found';

export interface MissingPerson {
  id: string;
  name: string;
  age: number | null;
  gender: string | null;
  description: string | null;
  last_seen_location: string | null;
  last_seen_lat: number | null;
  last_seen_lng: number | null;
  last_seen_date: string | null;
  search_radius_km: number | null;
  contact_phone: string | null;
  photo_uri: string | null;
  status: MissingStatus;
  server_id: string | null; // set once synced to the backend for cross-device/police visibility
  face_embedding_status: 'pending' | 'generated' | 'not_applicable' | null;
  created_at: string;
}

export interface ServerMissingPerson {
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
  search_radius_km: number | null;
  contact_phone: string | null;
  photo_url: string | null;
  face_embedding_status: 'pending' | 'generated' | 'not_applicable';
  face_validation_status: 'ok' | 'rejected' | null;
  face_validation_reason: 'undecodable' | 'no_face' | 'multiple_faces' | 'face_too_small' | 'too_blurry' | null;
  status: MissingStatus;
  created_at: string;
  updated_at: string;
}

export type CameraPlacement = 'indoor' | 'outdoor';

export interface Camera {
  id: string;
  owner_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  placement: CameraPlacement;
  direction: string | null;
  coverage_notes: string | null;
  coverage_radius_m: number | null;
  owner_name: string | null;
  owner_phone: string | null;
  terms_accepted: 0 | 1;
  terms_accepted_at: string | null;
  status: 'active' | 'inactive';
  ai_status: string;
  stream_url: string | null;
  ai_last_seen_at: string | null;
  created_at: string;
}

export type PublicCameraCoverageStatus = 'online' | 'registered' | 'offline';

export interface NearbyCctvCamera {
  id: string;
  code: string;
  lat: number;
  lng: number;
  distanceKm: number;
  address: string | null;
  placement: CameraPlacement;
  coverage: string | null;
  coverage_radius_m: number | null;
  status: PublicCameraCoverageStatus;
  ai_available: boolean;
  last_ai_seen_at: string | null;
}

export interface NearbyCctvCoverage {
  cameras: NearbyCctvCamera[];
  radiusKm: number;
  registeredCount: number;
  aiAvailableCount: number;
}

export type NotificationType = 'sos' | 'missing' | 'contact' | 'authority' | 'report' | 'system';

export interface AppNotification {
  id: string;
  title: string;
  body: string | null;
  type: NotificationType;
  is_read: number; // sqlite has no boolean
  created_at: string;
}

export interface NearbyPlace {
  id: string;
  name: string;
  kind: 'hospital' | 'police' | 'fire_station';
  lat: number;
  lng: number;
  distanceKm: number;
  address: string | null;
  phone: string | null;
}
