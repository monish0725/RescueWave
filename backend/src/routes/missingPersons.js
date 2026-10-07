const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth, requireCameraOperator } = require('../middleware/auth');
const { haversineKm } = require('../utils/geo');
const { sendPushToUser } = require('../utils/push');

const MAX_POLICE_NOTIFIED = 5;
const NOTIFY_RADIUS_KM = 15; // wider than an SOS — missing person cases matter beyond the immediate block

const router = express.Router();
router.use(requireAuth);

function markMissingPersonFound(record, actorLabel, matchId = null) {
  if (record.status !== 'found') {
    db.prepare("UPDATE missing_persons SET status = 'found', updated_at = datetime('now') WHERE id = ?").run(record.id);
  }
  if (matchId) {
    db.prepare("UPDATE missing_person_matches SET verification_status = 'confirmed_sighting' WHERE id = ?").run(matchId);
  }
  if (record.reporter_id && actorLabel !== 'reporter') {
    sendPushToUser(record.reporter_id, {
      title: '✅ Missing person found',
      body: `${record.name} has been marked found by ${actorLabel}. AI camera matching has stopped for this case.`,
      data: { type: 'missing_found', missingPersonId: record.id },
    }).catch(() => {});
  }
}

router.post('/', (req, res) => {
  const { name, age, gender, description, last_seen_location, last_seen_lat, last_seen_lng, last_seen_date, search_radius_km, contact_phone, photo_url } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = uuid();
  db.prepare(
    `INSERT INTO missing_persons
      (id, reporter_id, name, age, gender, description, last_seen_location, last_seen_lat, last_seen_lng, last_seen_date, search_radius_km, contact_phone, photo_url, face_embedding_status, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, ?, 'missing')`
  ).run(
    id, req.user.id, name.trim(), age ?? null, gender || null, description || null, last_seen_location || null,
    last_seen_lat ?? null, last_seen_lng ?? null, last_seen_date || null, search_radius_km ?? null, contact_phone || null, photo_url || null,
    photo_url ? 'pending' : 'not_applicable' // no photo means there's nothing to eventually generate an embedding from
  );

  const record = db.prepare('SELECT * FROM missing_persons WHERE id = ?').get(id);

  let authoritiesNotified = 0;
  if (typeof last_seen_lat === 'number' && typeof last_seen_lng === 'number') {
    const police = db.prepare(`SELECT id, authority_lat, authority_lng FROM users WHERE role = 'authority' AND authority_verified = 1 AND authority_type = 'police'`).all();
    const nearby = police
      .map((p) => ({ ...p, distanceKm: haversineKm(last_seen_lat, last_seen_lng, p.authority_lat, p.authority_lng) }))
      .filter((p) => p.distanceKm !== null && p.distanceKm <= NOTIFY_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, MAX_POLICE_NOTIFIED);
    for (const p of nearby) {
      sendPushToUser(p.id, {
        title: '🔍 Missing person reported nearby',
        body: `${name} was reported missing near ${last_seen_location || 'your area'}.`,
        data: { type: 'missing_nearby', missingPersonId: id },
      }).catch(() => {});
    }
    authoritiesNotified = nearby.length;
  }

  res.status(201).json({ missingPerson: record, authoritiesNotified });
});

router.get('/mine', (req, res) => {
  res.json({ missingPersons: db.prepare('SELECT * FROM missing_persons WHERE reporter_id = ? ORDER BY created_at DESC').all(req.user.id) });
});

// Everyone can see active missing-person cases — that's the point of a
// public safety net — sorted newest first, capped for sanity.
router.get('/', (req, res) => {
  const { status = 'missing' } = req.query;
  res.json({ missingPersons: db.prepare('SELECT * FROM missing_persons WHERE status = ? ORDER BY created_at DESC LIMIT 100').all(status) });
});

router.get('/:id', (req, res) => {
  const record = db.prepare('SELECT * FROM missing_persons WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Missing person record not found' });
  res.json({ missingPerson: record });
});

router.patch('/:id', (req, res) => {
  const record = db.prepare('SELECT * FROM missing_persons WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Missing person record not found' });
  if (record.reporter_id !== req.user.id) return res.status(403).json({ error: 'Only the reporter can update this record' });

  const body = req.body || {};
  const { status } = body;
  if (status && !['missing', 'found'].includes(status)) return res.status(400).json({ error: "status must be 'missing' or 'found'" });

  // Field-presence-based update, not COALESCE: COALESCE(?, column) can
  // never tell "this field was intentionally cleared to null/empty" apart
  // from "this field wasn't included in the request" — both bind a NULL
  // or the same falsy value, so a genuine clear silently kept the old
  // value. Only touch a column if its key was actually present in the
  // request body, and when present, set it to exactly what was sent
  // (including null/''), so clearing a field actually clears it while
  // fields the client didn't send remain untouched.
  const EDITABLE_FIELDS = ['name', 'age', 'gender', 'description', 'last_seen_location', 'last_seen_date', 'contact_phone', 'photo_url'];
  const sets = [];
  const params = [];
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      sets.push(`${field} = ?`);
      params.push(body[field]);
    }
  }
  if (status) {
    sets.push('status = ?');
    params.push(status);
  }

  // A new photo invalidates any previous validation verdict — it
  // described the OLD photo. Reset to 'pending' rather than leaving a
  // stale 'rejected' banner showing for a photo that's already been
  // replaced; the AI service will report a fresh verdict on its next
  // reference-set refresh (see face_matcher.py: refresh_reference_set()).
  const photoChanged = Object.prototype.hasOwnProperty.call(body, 'photo_url') && body.photo_url && body.photo_url !== record.photo_url;
  if (photoChanged) {
    sets.push("face_embedding_status = 'pending'", 'face_validation_status = NULL', 'face_validation_reason = NULL');
  }

  if (sets.length > 0) {
    sets.push("updated_at = datetime('now')");
    params.push(req.params.id);
    db.prepare(`UPDATE missing_persons SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }

  res.json({ missingPerson: db.prepare('SELECT * FROM missing_persons WHERE id = ?').get(req.params.id) });
});

router.delete('/:id', (req, res) => {
  const record = db.prepare('SELECT * FROM missing_persons WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Missing person record not found' });
  if (record.reporter_id !== req.user.id) return res.status(403).json({ error: 'Only the reporter can remove this record' });
  db.prepare('DELETE FROM missing_persons WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// --- AI camera matches -----------------------------------------------------------
// Called by the AI service (ai-service/) when its face matcher finds a hit
// against a registered camera's feed — authenticated as the camera owner's
// account (see ai-service/README.md), so this checks the camera really
// belongs to whoever's asking, the same way camera management does.
router.post('/:id/matches', (req, res) => {
  const record = db.prepare('SELECT * FROM missing_persons WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Missing person record not found' });
  if (record.status !== 'missing') {
    return res.status(409).json({ error: 'This person is already marked found, so camera matching is stopped for this record' });
  }

  const { camera_id, confidence, snapshot_url, face_detection_score, local_feature_score, ssim_score, final_confidence, match_label } = req.body || {};
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    return res.status(400).json({ error: 'confidence must be a number between 0 and 1' });
  }
  if (face_detection_score != null && (typeof face_detection_score !== 'number' || face_detection_score < 0 || face_detection_score > 1)) {
    return res.status(400).json({ error: 'face_detection_score must be a number between 0 and 1, or omitted' });
  }
  for (const [field, value] of Object.entries({ local_feature_score, ssim_score, final_confidence })) {
    if (value != null && (typeof value !== 'number' || value < 0 || value > 1)) {
      return res.status(400).json({ error: `${field} must be a number between 0 and 1, or omitted` });
    }
  }
  let camera = null;
  if (camera_id) {
    camera = db.prepare('SELECT * FROM cameras WHERE id = ?').get(camera_id);
    if (!camera) return res.status(404).json({ error: 'Camera not found' });
    if (camera.owner_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'You can only report matches for cameras you own' });
    }
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO missing_person_matches
      (id, missing_person_id, camera_id, confidence, snapshot_url, face_detection_score, local_feature_score, ssim_score, final_confidence, match_label)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    req.params.id,
    camera_id || null,
    confidence,
    snapshot_url || null,
    face_detection_score ?? null,
    local_feature_score ?? null,
    ssim_score ?? null,
    final_confidence ?? confidence,
    match_label || null,
  );

  // A real hit is exactly what upgrades face_embedding_status from
  // "pending" — this is the one place that field is allowed to become
  // 'generated', because it's now backed by an actual comparison result.
  if (record.face_embedding_status === 'pending') {
    db.prepare(`UPDATE missing_persons SET face_embedding_status = 'generated' WHERE id = ?`).run(req.params.id);
  }

  if (record.reporter_id) {
    sendPushToUser(record.reporter_id, {
      title: '🔍 Possible match found',
      body: `A registered camera${camera ? ` ("${camera.name}")` : ''} may have spotted ${record.name}.`,
      data: { type: 'missing_match', missingPersonId: req.params.id },
    }).catch(() => {});
  }
  if (camera?.lat && camera?.lng) {
    const police = db.prepare(`SELECT id, authority_lat, authority_lng FROM users WHERE role = 'authority' AND authority_verified = 1 AND authority_type = 'police'`).all();
    const nearby = police
      .map((p) => ({ ...p, distanceKm: haversineKm(camera.lat, camera.lng, p.authority_lat, p.authority_lng) }))
      .filter((p) => p.distanceKm !== null && p.distanceKm <= NOTIFY_RADIUS_KM)
      .slice(0, MAX_POLICE_NOTIFIED);
    for (const p of nearby) {
      sendPushToUser(p.id, {
        title: '🔍 Possible missing-person match',
        body: `${record.name} may have been spotted near ${camera.name}.`,
        data: { type: 'missing_match', missingPersonId: req.params.id },
      }).catch(() => {});
    }
  }

  res.status(201).json({ match: db.prepare('SELECT * FROM missing_person_matches WHERE id = ?').get(id) });
});

// Visible to the reporter, an admin, or a camera owner who has at least
// one match on this case (so they can see the context their own camera
// contributed to, not every other camera's hits).
router.get('/:id/matches', (req, res) => {
  const record = db.prepare('SELECT * FROM missing_persons WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Missing person record not found' });

  const matches = db
    .prepare(`SELECT * FROM missing_person_matches WHERE missing_person_id = ? ORDER BY matched_at DESC`)
    .all(req.params.id);

  const isReporterOrAdmin = req.user.id === record.reporter_id || req.user.is_admin;
  const ownsAMatch = matches.some((m) => {
    if (!m.camera_id) return false;
    const cam = db.prepare('SELECT owner_id FROM cameras WHERE id = ?').get(m.camera_id);
    return cam?.owner_id === req.user.id;
  });
  if (!isReporterOrAdmin && !ownsAMatch) return res.status(403).json({ error: 'Not authorized to view this timeline' });

  const withCameraNames = matches.map((m) => {
    const cam = m.camera_id ? db.prepare('SELECT name, address, lat, lng FROM cameras WHERE id = ?').get(m.camera_id) : null;
    return { ...m, camera_name: cam?.name || null, camera_address: cam?.address || null, camera_lat: cam?.lat ?? null, camera_lng: cam?.lng ?? null };
  });

  res.json({ matches: withCameraNames });
});

const MATCH_VERIFICATION_STATUSES = ['pending', 'verified', 'rejected', 'confirmed_sighting'];

// The reporter who uploaded the missing-person record can review AI sightings
// from the mobile app. Admins keep their separate dashboard route.
router.patch('/:id/matches/:matchId', (req, res) => {
  const record = db.prepare('SELECT * FROM missing_persons WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Missing person record not found' });
  if (record.reporter_id !== req.user.id && !req.user.is_admin) {
    return res.status(403).json({ error: 'Only the reporter or an admin can review this sighting' });
  }

  const match = db.prepare('SELECT * FROM missing_person_matches WHERE id = ? AND missing_person_id = ?').get(req.params.matchId, req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const { verification_status } = req.body || {};
  if (!MATCH_VERIFICATION_STATUSES.includes(verification_status)) {
    return res.status(400).json({ error: `verification_status must be one of: ${MATCH_VERIFICATION_STATUSES.join(', ')}` });
  }

  db.prepare('UPDATE missing_person_matches SET verification_status = ? WHERE id = ?').run(verification_status, req.params.matchId);
  if (verification_status === 'confirmed_sighting') {
    markMissingPersonFound(record, record.reporter_id === req.user.id ? 'reporter' : 'admin', req.params.matchId);
  }
  res.json({ match: db.prepare('SELECT * FROM missing_person_matches WHERE id = ?').get(req.params.matchId) });
});

const VALIDATION_STATUSES = ['ok', 'rejected'];
const VALIDATION_REASONS = ['undecodable', 'no_face', 'multiple_faces', 'face_too_small', 'too_blurry'];

// Called by the AI service (see ai-service/rescuewave_ai/face_matcher.py:
// refresh_reference_set()) whenever it (re-)checks a missing person's
// reference photo — 'ok' clears any previous rejection (e.g. the reporter
// uploaded a better photo since), 'rejected' records why, for the mobile
// app to actually show. Gated the same way POST /:id/matches is — the AI
// service authenticates as a normal user (the camera owner), so an
// ordinary reporter account with no registered active camera can no
// longer call this and forge another user's validation verdict.
router.patch('/:id/validation', requireCameraOperator, (req, res) => {
  const record = db.prepare('SELECT id FROM missing_persons WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Missing person record not found' });

  const { status, reason } = req.body || {};
  if (!VALIDATION_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALIDATION_STATUSES.join(', ')}` });
  }
  if (status === 'rejected' && !VALIDATION_REASONS.includes(reason)) {
    return res.status(400).json({ error: `reason must be one of: ${VALIDATION_REASONS.join(', ')} when status is 'rejected'` });
  }

  db.prepare('UPDATE missing_persons SET face_validation_status = ?, face_validation_reason = ? WHERE id = ?')
    .run(status, status === 'rejected' ? reason : null, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
