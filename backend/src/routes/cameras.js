const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { haversineKm } = require('../utils/geo');

const router = express.Router();
router.use(requireAuth);

const NEARBY_CCTV_RADIUS_KM = 6;
const MAX_NEARBY_CCTV = 50;
const STALE_AFTER_MS = 2 * 60 * 1000;

function isAiAvailable(camera, now = Date.now()) {
  return Boolean(
    camera.status === 'active' &&
    camera.stream_url &&
    camera.ai_status === 'connected' &&
    camera.ai_last_seen_at &&
    now - new Date(camera.ai_last_seen_at + 'Z').getTime() <= STALE_AFTER_MS
  );
}

function publicCameraStatus(camera, now = Date.now()) {
  if (camera.status !== 'active') return 'offline';
  if (isAiAvailable(camera, now)) return 'online';
  return camera.stream_url ? 'registered' : 'registered';
}

function approximateCoord(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

// Public CCTV registry — anyone can register a camera they own. `stream_url`
// is optional and separate from registration itself: a camera can be
// registered (for the future network) without ever exposing a feed, or an
// owner can add a stream_url later for the AI service to actually read
// frames from (see ai-service/). ai_status only ever flips via the AI
// service's own heartbeat (see /:id/ai-heartbeat below) — never something
// this endpoint or its owner can just declare true.
router.post('/', (req, res) => {
  const { name, address, lat, lng, placement, direction, coverage_notes, coverage_radius_m, owner_name, owner_phone, terms_accepted, stream_url } = req.body || {};
  if (!name || !placement) return res.status(400).json({ error: 'name and placement are required' });
  if (!['indoor', 'outdoor'].includes(placement)) return res.status(400).json({ error: "placement must be 'indoor' or 'outdoor'" });
  if (!terms_accepted) return res.status(400).json({ error: 'You must accept the Terms & Conditions to register a camera' });

  const id = uuid();
  db.prepare(
    `INSERT INTO cameras (id, owner_id, name, address, lat, lng, placement, direction, coverage_notes, coverage_radius_m, owner_name, owner_phone, terms_accepted, terms_accepted_at, status, stream_url)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1, datetime('now'), 'active', ?)`
  ).run(id, req.user.id, name.trim(), address || null, lat ?? null, lng ?? null, placement, direction || null, coverage_notes || null, coverage_radius_m ?? null, owner_name || req.user.name, owner_phone || req.user.phone || null, stream_url || null);

  res.status(201).json({ camera: db.prepare('SELECT * FROM cameras WHERE id = ?').get(id) });
});

router.get('/mine', (req, res) => {
  res.json({ cameras: db.prepare('SELECT * FROM cameras WHERE owner_id = ? ORDER BY created_at DESC').all(req.user.id) });
});

// Used by the AI service to know which of the camera owner's cameras have
// a stream configured to actually process — it authenticates as the
// camera owner (see ai-service/README.md), so "mine" is the right scope.
router.get('/mine/streaming', (req, res) => {
  res.json({
    cameras: db.prepare(`SELECT * FROM cameras WHERE owner_id = ? AND status = 'active' AND stream_url IS NOT NULL`).all(req.user.id),
  });
});

// Admin-operated AI service can monitor every active registered stream.
// Non-admin camera owners still use /mine/streaming above.
router.get('/streaming/all', requireAdmin, (req, res) => {
  res.json({
    cameras: db.prepare(`SELECT * FROM cameras WHERE status = 'active' AND stream_url IS NOT NULL ORDER BY created_at DESC`).all(),
  });
});

// Read-only, whole-network AI status for any authenticated user — this is
// what the mobile app's missing-person screens use to show honest
// "AI monitoring is/isn't active" copy instead of guessing from a single
// case's match count. "Actively monitoring" means the camera reported a
// heartbeat recently (see /:id/ai-heartbeat above); the AI service sends
// one every ~30s while running, so anything older than STALE_AFTER_MS is
// treated as not currently monitoring rather than left looking "connected"
// forever after a service crash or camera outage.
router.get('/monitoring-status', (req, res) => {
  const candidates = db
    .prepare(`SELECT ai_last_seen_at FROM cameras WHERE status = 'active' AND stream_url IS NOT NULL AND ai_status = 'connected' AND ai_last_seen_at IS NOT NULL`)
    .all();

  const now = Date.now();
  const active = candidates.filter((c) => now - new Date(c.ai_last_seen_at + 'Z').getTime() <= STALE_AFTER_MS);
  const lastHeartbeatAt = candidates.reduce((latest, c) => (!latest || c.ai_last_seen_at > latest ? c.ai_last_seen_at : latest), null);

  res.json({
    activeCameraCount: active.length,
    lastHeartbeatAt,
  });
});

// Public-safe nearby CCTV coverage. This deliberately does NOT return
// stream_url, owner details, credentials, exact admin metadata, or detection
// logs. It exists so normal authenticated users can understand coverage
// around them without becoming camera viewers/operators.
router.get('/nearby', (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radiusKm = Math.min(Number(req.query.radiusKm) || NEARBY_CCTV_RADIUS_KM, 15);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng query parameters are required' });
  }

  const candidates = db
    .prepare(
      `SELECT id, name, address, lat, lng, placement, direction, coverage_notes, coverage_radius_m, status,
              ai_status, ai_last_seen_at, stream_url
       FROM cameras
       WHERE lat IS NOT NULL AND lng IS NOT NULL`
    )
    .all();

  const now = Date.now();
  const cameras = candidates
    .map((camera) => ({
      camera,
      distanceKm: haversineKm(lat, lng, camera.lat, camera.lng),
    }))
    .filter((item) => item.distanceKm !== null && item.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_NEARBY_CCTV)
    .map(({ camera, distanceKm }) => ({
      id: camera.id,
      code: `CCTV-${String(camera.id).slice(0, 6).toUpperCase()}`,
      lat: approximateCoord(camera.lat),
      lng: approximateCoord(camera.lng),
      distanceKm,
      address: camera.address || null,
      placement: camera.placement,
      coverage: camera.coverage_notes || camera.direction || (camera.placement === 'outdoor' ? 'Public area' : 'Building entrance'),
      coverage_radius_m: camera.coverage_radius_m || null,
      status: publicCameraStatus(camera, now),
      ai_available: isAiAvailable(camera, now),
      last_ai_seen_at: camera.ai_last_seen_at || null,
    }));

  res.json({
    cameras,
    radiusKm,
    registeredCount: cameras.length,
    aiAvailableCount: cameras.filter((camera) => camera.ai_available).length,
  });
});

router.get('/:id', (req, res) => {
  const camera = db.prepare('SELECT * FROM cameras WHERE id = ?').get(req.params.id);
  if (!camera) return res.status(404).json({ error: 'Camera not found' });
  if (camera.owner_id !== req.user.id && !req.user.is_admin) {
    return res.status(403).json({ error: 'Only the owner or an admin can view full camera configuration' });
  }
  res.json({ camera });
});

router.patch('/:id', (req, res) => {
  const camera = db.prepare('SELECT * FROM cameras WHERE id = ?').get(req.params.id);
  if (!camera) return res.status(404).json({ error: 'Camera not found' });
  if (camera.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can update this camera' });

  const { name, address, direction, coverage_notes, coverage_radius_m, status, stream_url } = req.body || {};
  if (status && !['active', 'inactive'].includes(status)) return res.status(400).json({ error: "status must be 'active' or 'inactive'" });

  db.prepare(
    `UPDATE cameras SET
       name = COALESCE(?, name), address = COALESCE(?, address), direction = COALESCE(?, direction),
       coverage_notes = COALESCE(?, coverage_notes), coverage_radius_m = COALESCE(?, coverage_radius_m), status = COALESCE(?, status),
       stream_url = CASE WHEN ? THEN ? ELSE stream_url END
     WHERE id = ?`
  ).run(
    name ?? null, address ?? null, direction ?? null, coverage_notes ?? null, coverage_radius_m ?? null, status ?? null,
    stream_url !== undefined ? 1 : 0, stream_url === '' ? null : stream_url ?? null,
    req.params.id
  );

  res.json({ camera: db.prepare('SELECT * FROM cameras WHERE id = ?').get(req.params.id) });
});

// AI service heartbeat — called each time it successfully reads a frame
// from this camera's stream. This is the ONLY thing that moves ai_status
// to 'connected'; it's real evidence the pipeline is actually running,
// not a manually-set flag. If no heartbeat lands for a while, the
// dashboard should treat the camera as not actively monitored (see
// ai_last_seen_at rendering in the dashboard/mobile).
router.post('/:id/ai-heartbeat', (req, res) => {
  const camera = db.prepare('SELECT * FROM cameras WHERE id = ?').get(req.params.id);
  if (!camera) return res.status(404).json({ error: 'Camera not found' });
  if (camera.owner_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'Only the owner, an admin AI service, or their AI service can heartbeat this camera' });

  // Optional — an ai-service build that doesn't send these just leaves
  // them unset, and the columns stay NULL (not "false"): the dashboard
  // distinguishes "reported not configured" from "not reported at all".
  const { voice_enabled, emotion_enabled, fall_enabled } = req.body || {};
  const voiceVal = typeof voice_enabled === 'boolean' ? (voice_enabled ? 1 : 0) : null;
  const emotionVal = typeof emotion_enabled === 'boolean' ? (emotion_enabled ? 1 : 0) : null;
  const fallVal = typeof fall_enabled === 'boolean' ? (fall_enabled ? 1 : 0) : null;

  db.prepare(
    `UPDATE cameras SET ai_status = 'connected', ai_last_seen_at = datetime('now'),
       ai_voice_enabled = COALESCE(?, ai_voice_enabled), ai_emotion_enabled = COALESCE(?, ai_emotion_enabled),
       ai_fall_enabled = COALESCE(?, ai_fall_enabled)
     WHERE id = ?`
  ).run(voiceVal, emotionVal, fallVal, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const camera = db.prepare('SELECT * FROM cameras WHERE id = ?').get(req.params.id);
  if (!camera) return res.status(404).json({ error: 'Camera not found' });
  if (camera.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can remove this camera' });
  db.prepare('DELETE FROM cameras WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
