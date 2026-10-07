const { DatabaseSync } = require('node:sqlite');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../rescuewave.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ---------------------------------------------------------------------------
// Architecture note: the backend is the source of truth for anything that
// has to be seen by MORE than one person — an SOS that Helpers/Authorities
// need to see, a responder's live location, a location shared with an
// emergency contact. Everything single-user (missing person records, saved
// contacts, the medical guide, personal settings) still lives only in the
// app's on-device SQLite database.
//
// This schema is also the integration point for the future AI CCTV system
// (kept fully separate for now, per instruction): when that system is wired
// up, it will create rows in `alerts` with source='camera_ai' exactly the
// same way a manual SOS does, and the existing matching + push notification
// + admin-visibility pipeline below picks it up with no changes required.
//
// Note on enums: `role`, `alerts.source` and `alerts.category` intentionally
// have NO CHECK constraint — these are exactly the fields Phase 2/3 kept
// needing to extend (user -> +helper -> +authority; manual_sos -> +camera_ai
// -> +citizen_report). They're validated in the route handlers instead,
// which is where that validation has to live anyway. Narrow, stable
// lifecycle fields (helper_status, application status, alert status) keep
// their CHECK constraints.
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  blood_group TEXT,
  medical_info TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  is_admin INTEGER NOT NULL DEFAULT 0,

  -- Helper profile fields (populated once a helper_application is approved)
  helper_status TEXT NOT NULL DEFAULT 'offline' CHECK (helper_status IN ('available','busy','offline')),
  helper_verified INTEGER NOT NULL DEFAULT 0,
  helper_skills TEXT,               -- JSON array, e.g. ["first_aid","security"]
  helper_lat REAL,
  helper_lng REAL,
  helper_location_updated_at TEXT,
  emergencies_attended INTEGER NOT NULL DEFAULT 0,
  people_helped INTEGER NOT NULL DEFAULT 0,
  helper_rating REAL,               -- reserved for future rating system

  -- Authority profile fields (populated once an authority_application is approved)
  authority_type TEXT,              -- 'police' | 'hospital' | 'fire'
  authority_org TEXT,               -- e.g. "Cubbon Park Police Station"
  authority_verified INTEGER NOT NULL DEFAULT 0,
  authority_lat REAL,
  authority_lng REAL,
  authority_location_updated_at TEXT,
  cases_closed INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Public User -> Apply to become a Helper -> Admin Review -> Approved/Rejected.
CREATE TABLE IF NOT EXISTS helper_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT,
  id_proof_uri TEXT,                -- optional for now, per instruction
  skills TEXT NOT NULL,             -- JSON array
  availability TEXT,                -- free-text, e.g. "Weekday evenings"
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note TEXT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Organization -> Register as Police/Hospital/Fire -> Admin Review -> Approved/Rejected.
-- Mirrors helper_applications; kept separate because the fields genuinely
-- differ (an org name + jurisdiction, not skills + availability).
CREATE TABLE IF NOT EXISTS authority_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  authority_type TEXT NOT NULL CHECK (authority_type IN ('police','hospital','fire')),
  org_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT,
  lat REAL,
  lng REAL,
  license_or_badge_id TEXT,         -- optional for now, no govt verification yet
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note TEXT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Expo push tokens, one row per device.
CREATE TABLE IF NOT EXISTS push_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Server-side alerts: SOS (need a physical responder fast) and citizen
-- incident reports (a record, with optional evidence, not necessarily an
-- active dispatch). A Helper and an Authority can both be attached to the
-- same alert at once — a citizen physically helping doesn't replace police
-- being notified, and vice versa — tracked as two independent response
-- tracks (see 'status' vs 'authority_status' below).
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'manual_sos', -- manual_sos | citizen_report | camera_ai
  category TEXT,                    -- medical | accident | harassment | violence | fire | theft | suspicious_activity | other
  description TEXT,
  photo_url TEXT,
  video_url TEXT,
  voice_url TEXT,
  lat REAL,
  lng REAL,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','completed','cancelled')),
  report_status TEXT NOT NULL DEFAULT 'submitted',
  severity TEXT,
  admin_note TEXT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  assigned_helper_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_authority_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  authority_status TEXT,            -- NULL until an authority engages, then accepted | en_route | on_scene | investigating | closed
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Full lifecycle timeline per alert — shared by both the Helper track
-- (accepted/on_the_way/arrived/assisting/completed) and the Authority track
-- (accepted/en_route/on_scene/investigating/closed); the actor tells you
-- which track a given event belongs to.
CREATE TABLE IF NOT EXISTS alert_status_events (
  id TEXT PRIMARY KEY,
  alert_id TEXT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,                  -- 'helper' | 'authority' | 'reporter' | 'system'
  status TEXT NOT NULL,
  note TEXT,
  lat REAL,
  lng REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Public users can see nearby coverage counts/status, but not streams.
-- This table lets an SOS preserve which registered cameras were nearby at
-- dispatch time for authorized backend/admin workflows without exposing
-- feed URLs or owner details to the reporter.
CREATE TABLE IF NOT EXISTS alert_camera_links (
  id TEXT PRIMARY KEY,
  alert_id TEXT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  camera_id TEXT NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  distance_km REAL,
  ai_available INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Live location sharing — a Helper's or Authority's live location while
-- responding to an alert, or a user sharing their live location with an
-- emergency contact. Read via the public, token-secured GET /share/:token
-- page/API so a recipient without the app can watch it.
CREATE TABLE IF NOT EXISTS live_shares (
  id TEXT PRIMARY KEY,
  share_token TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('helper_mission','authority_case','contact_share')),
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_id TEXT REFERENCES alerts(id) ON DELETE SET NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','stopped')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  stopped_at TEXT
);

CREATE TABLE IF NOT EXISTS live_share_pings (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL REFERENCES live_shares(id) ON DELETE CASCADE,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- CCTV camera registry — Phase 4: registration + management only. No AI
-- backend is connected to these yet (ai_status stays 'not_connected' until
-- that future system exists); this table is exactly the record format that
-- system will read from, so wiring it up later doesn't need a schema change.
CREATE TABLE IF NOT EXISTS cameras (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  lat REAL,
  lng REAL,
  placement TEXT NOT NULL CHECK (placement IN ('indoor','outdoor')),
  direction TEXT,                   -- compass-ish free text, e.g. "Facing north, toward the main road"
  coverage_notes TEXT,               -- free-text description of what the camera covers
  coverage_radius_m INTEGER,
  owner_name TEXT,
  owner_phone TEXT,
  terms_accepted INTEGER NOT NULL DEFAULT 0,
  terms_accepted_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  ai_status TEXT NOT NULL DEFAULT 'not_connected', -- reserved: 'not_connected' until the separate AI CCTV system is wired up
  stream_url TEXT,                   -- optional: RTSP/HTTP feed the AI service reads from. NULL = registration only, no feed configured
  ai_last_seen_at TEXT,               -- set by the AI service's own heartbeat when it actually processes a frame from this camera — not a flag anyone can just flip
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Missing person reports — synced server-side (unlike purely personal data)
-- because family/police visibility across devices is the entire point, and
-- because face_embedding_status is exactly the hook the future AI system
-- needs. face_embedding_status stays 'pending' — generating a real
-- embedding needs an actual face-recognition model (e.g. via a Python
-- service), which doesn't exist yet; storing a fake vector here would be
-- worse than not having one.
CREATE TABLE IF NOT EXISTS missing_persons (
  id TEXT PRIMARY KEY,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  age INTEGER,
  gender TEXT,
  description TEXT,
  last_seen_location TEXT,
  last_seen_lat REAL,
  last_seen_lng REAL,
  last_seen_date TEXT,
  search_radius_km REAL,
  contact_phone TEXT,
  photo_url TEXT,
  face_embedding_status TEXT NOT NULL DEFAULT 'pending', -- pending | generated | not_applicable
  status TEXT NOT NULL DEFAULT 'missing' CHECK (status IN ('missing','found')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Face-match hits from the AI CCTV service. One row per detection event,
-- not deduplicated server-side — the same person walking past the same
-- camera twice makes two rows, which is exactly the timeline the mobile
-- app and dashboard are meant to show.
CREATE TABLE IF NOT EXISTS missing_person_matches (
  id TEXT PRIMARY KEY,
  missing_person_id TEXT NOT NULL REFERENCES missing_persons(id) ON DELETE CASCADE,
  camera_id TEXT REFERENCES cameras(id) ON DELETE SET NULL,
  confidence REAL NOT NULL,          -- 0-1, from the AI service's own similarity score
  local_feature_score REAL,
  ssim_score REAL,
  final_confidence REAL,
  match_label TEXT,
  snapshot_url TEXT,                 -- frame captured at match time, via /api/uploads
  matched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_helper_apps_status ON helper_applications(status);
CREATE INDEX IF NOT EXISTS idx_authority_apps_status ON authority_applications(status);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alert_events_alert ON alert_status_events(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_camera_links_alert ON alert_camera_links(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_camera_links_camera ON alert_camera_links(camera_id);
CREATE INDEX IF NOT EXISTS idx_live_shares_token ON live_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_live_share_pings_share ON live_share_pings(share_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_cameras_owner ON cameras(owner_id);
CREATE INDEX IF NOT EXISTS idx_cameras_status ON cameras(status);
CREATE INDEX IF NOT EXISTS idx_missing_status ON missing_persons(status);
CREATE INDEX IF NOT EXISTS idx_matches_missing_person ON missing_person_matches(missing_person_id, matched_at);
CREATE INDEX IF NOT EXISTS idx_matches_camera ON missing_person_matches(camera_id);
`);

for (const col of [
  "report_status TEXT NOT NULL DEFAULT 'submitted'",
  'severity TEXT',
  'admin_note TEXT',
  'reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL',
  'reviewed_at TEXT',
]) {
  try {
    db.exec(`ALTER TABLE alerts ADD COLUMN ${col}`);
  } catch {
    // Column already exists on an upgraded database.
  }
}

db.exec('CREATE INDEX IF NOT EXISTS idx_alerts_report_status ON alerts(report_status)');

// Defensive migrations for anyone upgrading a Phase 2 database in place:
// adds the new nullable columns Phase 3 needs. SQLite has no "ADD COLUMN IF
// NOT EXISTS", so each is just attempted and the "duplicate column" error
// ignored on repeat runs. NOTE: the `role` and `alerts.source` CHECK
// constraints baked into an existing Phase 2 table can't be altered this
// way — if you have a database from before Phase 3, delete
// backend/rescuewave.db* once and re-register; there's no real user data
// at stake yet.
const migrations = [
  `ALTER TABLE users ADD COLUMN authority_type TEXT`,
  `ALTER TABLE users ADD COLUMN authority_org TEXT`,
  `ALTER TABLE users ADD COLUMN authority_verified INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN authority_lat REAL`,
  `ALTER TABLE users ADD COLUMN authority_lng REAL`,
  `ALTER TABLE users ADD COLUMN authority_location_updated_at TEXT`,
  `ALTER TABLE users ADD COLUMN cases_closed INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE alerts ADD COLUMN photo_url TEXT`,
  `ALTER TABLE alerts ADD COLUMN video_url TEXT`,
  `ALTER TABLE alerts ADD COLUMN voice_url TEXT`,
  `ALTER TABLE alerts ADD COLUMN assigned_authority_id TEXT REFERENCES users(id) ON DELETE SET NULL`,
  `ALTER TABLE alerts ADD COLUMN authority_status TEXT`,
  `ALTER TABLE alert_status_events ADD COLUMN actor_role TEXT`,
  `ALTER TABLE cameras ADD COLUMN stream_url TEXT`,
  `ALTER TABLE cameras ADD COLUMN ai_last_seen_at TEXT`,
  // Final-audit Phase 3.8: match metadata. face_detection_score is SCRFD's
  // own detection confidence for the matched face, distinct from
  // `confidence` above (which is the ArcFace similarity score) — kept as
  // a separate nullable column rather than overloading `confidence`,
  // since the two measure different things and a UI showing both needs
  // them separable.
  `ALTER TABLE missing_person_matches ADD COLUMN face_detection_score REAL`,
  `ALTER TABLE missing_person_matches ADD COLUMN local_feature_score REAL`,
  `ALTER TABLE missing_person_matches ADD COLUMN ssim_score REAL`,
  `ALTER TABLE missing_person_matches ADD COLUMN final_confidence REAL`,
  `ALTER TABLE missing_person_matches ADD COLUMN match_label TEXT`,
  // Final-audit Phase 8: the admin dashboard's AI Monitoring page can only
  // show real Voice/Emotion "Configured" status if the AI service itself
  // reports it — VOSK_MODEL_PATH/EMOTION_MODEL_PATH live in the AI
  // service's own .env, invisible to the backend otherwise. Nullable so a
  // heartbeat that doesn't report these (an older ai-service build) just
  // leaves them NULL, which the dashboard displays as "not reported"
  // rather than fabricating a false "not configured".
  `ALTER TABLE cameras ADD COLUMN ai_voice_enabled INTEGER`,
  `ALTER TABLE cameras ADD COLUMN ai_emotion_enabled INTEGER`,
  `ALTER TABLE cameras ADD COLUMN ai_fall_enabled INTEGER`,
  // Final-audit Phase 4: a human admin action on a potential match — never
  // set by the AI service itself (nothing in ai-service/ writes this
  // column). Starts 'pending' for every match; an admin can move it to
  // 'verified' / 'rejected' / 'confirmed_sighting' from the dashboard's
  // AI Sightings view. Deliberately does NOT cascade into changing the
  // missing person's own `status` — "confirmed sighting of them at this
  // camera" and "case closed, they're found" are different admin
  // decisions, made separately.
  `ALTER TABLE missing_person_matches ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'pending'`,
  // Follow-up to final-audit Phase 3.1: the AI service already validates a
  // reference photo (exactly one face, large/sharp enough) and logs a
  // specific reason when it rejects one, but that reason had nowhere to
  // go — it stopped at the AI service's own log file. These two columns
  // let it report back through the backend so the reporter can actually
  // see why and fix it. Deliberately separate from `face_embedding_status`
  // (which stays "pending"/"not_applicable" — the backend still never
  // generates its own embedding, see that column's own comment above)
  // — this is about photo QUALITY, not embedding generation.
  `ALTER TABLE missing_persons ADD COLUMN face_validation_status TEXT`,
  `ALTER TABLE missing_persons ADD COLUMN face_validation_reason TEXT`,
  `ALTER TABLE missing_persons ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))`,
];
for (const sql of migrations) {
  try {
    db.exec(sql);
  } catch {
    // column already exists — fine
  }
}

module.exports = db;
