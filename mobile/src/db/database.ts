import * as SQLite from 'expo-sqlite';
import type {
  AlertCategory,
  AlertRecord,
  AlertStatus,
  AlertType,
  AppNotification,
  Contact,
  MissingPerson,
  MissingStatus,
  NotificationType,
} from '@/types';

// Single on-device database. Everything here works with zero network access —
// this is what makes RescueWave usable offline (SOS logging, contacts,
// missing person records, notification history, settings all live here).
const db = SQLite.openDatabaseSync('rescuewave.db');

export function initDatabase() {
  db.execSync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      relation TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      category TEXT,
      description TEXT,
      lat REAL,
      lng REAL,
      address TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      server_alert_id TEXT,
      photo_uri TEXT,
      video_uri TEXT,
      voice_uri TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS missing_persons (
      id TEXT PRIMARY KEY,
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
      photo_uri TEXT,
      status TEXT NOT NULL DEFAULT 'missing',
      server_id TEXT,
      face_embedding_status TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT,
      type TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Defensive migration for anyone who installed before Phase 2: adds the
  // column if it's missing. SQLite has no "ADD COLUMN IF NOT EXISTS", so we
  // just try it and ignore the "duplicate column" error on repeat runs.
  try {
    db.execSync('ALTER TABLE alerts ADD COLUMN server_alert_id TEXT');
  } catch {
    // already exists — fine
  }
  for (const col of ['photo_uri', 'video_uri', 'voice_uri']) {
    try {
      db.execSync(`ALTER TABLE alerts ADD COLUMN ${col} TEXT`);
    } catch {
      // already exists — fine
    }
  }
  for (const col of ['last_seen_lat REAL', 'last_seen_lng REAL', 'search_radius_km REAL', 'server_id TEXT', 'face_embedding_status TEXT']) {
    try {
      db.execSync(`ALTER TABLE missing_persons ADD COLUMN ${col}`);
    } catch {
      // already exists — fine
    }
  }
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function nowIso() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------
export const ContactsRepo = {
  all(): Contact[] {
    return db.getAllSync<Contact>('SELECT * FROM contacts ORDER BY created_at DESC');
  },
  create(input: { name: string; phone: string; relation?: string | null }): Contact {
    const row: Contact = { id: uid(), name: input.name, phone: input.phone, relation: input.relation ?? null, created_at: nowIso() };
    db.runSync('INSERT INTO contacts (id, name, phone, relation, created_at) VALUES (?,?,?,?,?)', [
      row.id, row.name, row.phone, row.relation, row.created_at,
    ]);
    return row;
  },
  update(id: string, input: { name: string; phone: string; relation?: string | null }) {
    db.runSync('UPDATE contacts SET name = ?, phone = ?, relation = ? WHERE id = ?', [input.name, input.phone, input.relation ?? null, id]);
  },
  remove(id: string) {
    db.runSync('DELETE FROM contacts WHERE id = ?', [id]);
  },
};

// ---------------------------------------------------------------------------
// Alerts (SOS + incident reports)
// ---------------------------------------------------------------------------
export const AlertsRepo = {
  all(): AlertRecord[] {
    return db.getAllSync<AlertRecord>('SELECT * FROM alerts ORDER BY created_at DESC');
  },
  get(id: string): AlertRecord | null {
    return db.getFirstSync<AlertRecord>('SELECT * FROM alerts WHERE id = ?', [id]) ?? null;
  },
  create(input: {
    type: AlertType;
    category?: AlertCategory | null;
    description?: string | null;
    lat?: number | null;
    lng?: number | null;
    address?: string | null;
    photo_uri?: string | null;
    video_uri?: string | null;
    voice_uri?: string | null;
  }): AlertRecord {
    const row: AlertRecord = {
      id: uid(),
      type: input.type,
      category: input.category ?? null,
      description: input.description ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      address: input.address ?? null,
      status: 'active',
      photo_uri: input.photo_uri ?? null,
      video_uri: input.video_uri ?? null,
      voice_uri: input.voice_uri ?? null,
      server_alert_id: null,
      created_at: nowIso(),
    };
    db.runSync(
      `INSERT INTO alerts (id, type, category, description, lat, lng, address, status, photo_uri, video_uri, voice_uri, server_alert_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [row.id, row.type, row.category, row.description, row.lat, row.lng, row.address, row.status, row.photo_uri, row.video_uri, row.voice_uri, row.server_alert_id, row.created_at]
    );
    return row;
  },
  setServerAlertId(id: string, serverAlertId: string) {
    db.runSync('UPDATE alerts SET server_alert_id = ? WHERE id = ?', [serverAlertId, id]);
  },
  setStatus(id: string, status: AlertStatus) {
    db.runSync('UPDATE alerts SET status = ? WHERE id = ?', [status, id]);
  },
  remove(id: string) {
    db.runSync('DELETE FROM alerts WHERE id = ?', [id]);
  },
  countActive(): number {
    return db.getFirstSync<{ c: number }>("SELECT COUNT(*) c FROM alerts WHERE status = 'active'")?.c ?? 0;
  },
};

// ---------------------------------------------------------------------------
// Missing persons
// ---------------------------------------------------------------------------
export const MissingRepo = {
  all(): MissingPerson[] {
    return db.getAllSync<MissingPerson>('SELECT * FROM missing_persons ORDER BY created_at DESC');
  },
  get(id: string): MissingPerson | null {
    return db.getFirstSync<MissingPerson>('SELECT * FROM missing_persons WHERE id = ?', [id]) ?? null;
  },
  create(input: Omit<MissingPerson, 'id' | 'created_at' | 'status' | 'server_id' | 'face_embedding_status'> & { status?: MissingStatus }): MissingPerson {
    const row: MissingPerson = {
      id: uid(),
      name: input.name,
      age: input.age ?? null,
      gender: input.gender ?? null,
      description: input.description ?? null,
      last_seen_location: input.last_seen_location ?? null,
      last_seen_lat: input.last_seen_lat ?? null,
      last_seen_lng: input.last_seen_lng ?? null,
      last_seen_date: input.last_seen_date ?? null,
      search_radius_km: input.search_radius_km ?? null,
      contact_phone: input.contact_phone ?? null,
      photo_uri: input.photo_uri ?? null,
      status: input.status ?? 'missing',
      server_id: null,
      face_embedding_status: input.photo_uri ? 'pending' : 'not_applicable',
      created_at: nowIso(),
    };
    db.runSync(
      `INSERT INTO missing_persons
        (id, name, age, gender, description, last_seen_location, last_seen_lat, last_seen_lng, last_seen_date, search_radius_km, contact_phone, photo_uri, status, server_id, face_embedding_status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [row.id, row.name, row.age, row.gender, row.description, row.last_seen_location, row.last_seen_lat, row.last_seen_lng, row.last_seen_date, row.search_radius_km, row.contact_phone, row.photo_uri, row.status, row.server_id, row.face_embedding_status, row.created_at]
    );
    return row;
  },
  setServerId(id: string, serverId: string) {
    db.runSync('UPDATE missing_persons SET server_id = ? WHERE id = ?', [serverId, id]);
  },
  update(id: string, input: Partial<Omit<MissingPerson, 'id' | 'created_at'>>) {
    const current = MissingRepo.get(id);
    if (!current) return;
    const merged = { ...current, ...input };
    db.runSync(
      `UPDATE missing_persons SET name=?, age=?, gender=?, description=?, last_seen_location=?, last_seen_lat=?, last_seen_lng=?, last_seen_date=?, search_radius_km=?, contact_phone=?, photo_uri=?, status=? WHERE id=?`,
      [merged.name, merged.age, merged.gender, merged.description, merged.last_seen_location, merged.last_seen_lat, merged.last_seen_lng, merged.last_seen_date, merged.search_radius_km, merged.contact_phone, merged.photo_uri, merged.status, id]
    );
  },
  remove(id: string) {
    db.runSync('DELETE FROM missing_persons WHERE id = ?', [id]);
  },
};

// ---------------------------------------------------------------------------
// Notifications (in-app history; mirrors what expo-notifications fired)
// ---------------------------------------------------------------------------
export const NotificationsRepo = {
  all(): AppNotification[] {
    return db.getAllSync<AppNotification>('SELECT * FROM notifications ORDER BY created_at DESC');
  },
  create(input: { title: string; body?: string | null; type: NotificationType }): AppNotification {
    const row: AppNotification = { id: uid(), title: input.title, body: input.body ?? null, type: input.type, is_read: 0, created_at: nowIso() };
    db.runSync('INSERT INTO notifications (id, title, body, type, is_read, created_at) VALUES (?,?,?,?,?,?)', [
      row.id, row.title, row.body, row.type, row.is_read, row.created_at,
    ]);
    return row;
  },
  markRead(id: string) {
    db.runSync('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
  },
  markAllRead() {
    db.runSync('UPDATE notifications SET is_read = 1');
  },
  unreadCount(): number {
    return db.getFirstSync<{ c: number }>('SELECT COUNT(*) c FROM notifications WHERE is_read = 0')?.c ?? 0;
  },
  clear() {
    db.runSync('DELETE FROM notifications');
  },
};

// ---------------------------------------------------------------------------
// Settings (key/value)
// ---------------------------------------------------------------------------
export const SettingsRepo = {
  get(key: string, fallback: string | null = null): string | null {
    const row = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    return row ? row.value : fallback;
  },
  set(key: string, value: string) {
    db.runSync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  },
};

export function wipeAllLocalData() {
  db.execSync(`
    DELETE FROM contacts;
    DELETE FROM alerts;
    DELETE FROM missing_persons;
    DELETE FROM notifications;
    DELETE FROM settings;
  `);
}

// The device database is intentionally offline-first, but it is shared by
// every account that signs in on this phone. Bind it to one account before
// showing personal records so emergency contacts, saved alerts, and draft
// reports can never bleed into another person's session.
export function activateLocalUser(userId: string) {
  const ownerId = SettingsRepo.get('local_data_owner_id');
  if (ownerId !== userId) {
    wipeAllLocalData();
    SettingsRepo.set('local_data_owner_id', userId);
  }
}

export default db;
