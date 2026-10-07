const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth, requireVerifiedHelper, requireVerifiedAuthority } = require('../middleware/auth');
const { haversineKm } = require('../utils/geo');
const { sendPushToUser } = require('../utils/push');

const NEARBY_RADIUS_KM = 8;
const MAX_HELPERS_NOTIFIED = 15;
const MAX_AUTHORITIES_NOTIFIED = 5;
const CAMERA_ASSOCIATION_RADIUS_KM = 1.5;
const CAMERA_AI_STALE_AFTER_MS = 2 * 60 * 1000;
const VALID_SOURCES = ['manual_sos', 'citizen_report', 'camera_ai'];
const VALID_CATEGORIES = ['low_lighting', 'crowded_area', 'medical', 'accident', 'harassment', 'violence', 'fire', 'theft', 'suspicious_activity', 'road_hazard', 'missing_person', 'other'];
const CATEGORY_SEVERITY = {
  medical: 'high',
  accident: 'high',
  fire: 'high',
  violence: 'high',
  harassment: 'medium',
  suspicious_activity: 'medium',
  road_hazard: 'medium',
  missing_person: 'medium',
  low_lighting: 'low',
  crowded_area: 'low',
  theft: 'low',
  other: 'low',
};

// Which Authority type is most relevant to a given report category — used
// to route push notifications. Not exclusive: Police are notified by
// default for anything without a clearer match, since they're the general
// first responder.
function authorityTypeForCategory(category) {
  if (category === 'medical') return 'hospital';
  if (category === 'fire') return 'fire';
  return 'police';
}

function cameraAiAvailable(camera, now = Date.now()) {
  return Boolean(
    camera.status === 'active' &&
    camera.stream_url &&
    camera.ai_status === 'connected' &&
    camera.ai_last_seen_at &&
    now - new Date(camera.ai_last_seen_at + 'Z').getTime() <= CAMERA_AI_STALE_AFTER_MS
  );
}

function nearbyCamerasFor(lat, lng, radiusKm = CAMERA_ASSOCIATION_RADIUS_KM) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return [];
  const now = Date.now();
  return db
    .prepare(`SELECT id, lat, lng, status, stream_url, ai_status, ai_last_seen_at FROM cameras WHERE lat IS NOT NULL AND lng IS NOT NULL`)
    .all()
    .map((camera) => ({ ...camera, distanceKm: haversineKm(lat, lng, camera.lat, camera.lng) }))
    .filter((camera) => camera.distanceKm !== null && camera.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .map((camera) => ({ ...camera, aiAvailable: cameraAiAvailable(camera, now) }));
}

module.exports = function alertsRouter() {
  const router = express.Router();
  router.use(requireAuth);

  // Create a server-side alert — either an SOS (needs a responder fast) or
  // a citizen incident report (a record, optionally with evidence). This is
  // what makes it visible to Helpers/Authorities — a purely local alert
  // (see mobile AlertsRepo) never leaves the reporter's phone. The mobile
  // app calls this in addition to its local save, not instead of it, so
  // both SOS and reports still work offline (dispatch just can't happen
  // until connectivity returns).
  router.post('/', (req, res) => {
    const { category, description, lat, lng, address, source = 'manual_sos', photo_url, video_url, voice_url } = req.body || {};
    if (!VALID_SOURCES.includes(source)) {
      return res.status(400).json({ error: `source must be one of: ${VALID_SOURCES.join(', ')}` });
    }
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }
    const id = uuid();
    const severity = source === 'manual_sos' || source === 'camera_ai' ? 'critical' : CATEGORY_SEVERITY[category] || 'low';
    db.prepare(
      `INSERT INTO alerts (id, reporter_id, source, category, description, photo_url, video_url, voice_url, lat, lng, address, status, report_status, severity)
       VALUES (?,?,?,?,?,?,?,?,?,?,?, 'open', 'submitted', ?)`
    ).run(id, req.user.id, source, category || null, description || null, photo_url || null, video_url || null, voice_url || null, lat ?? null, lng ?? null, address || null, severity);
    db.prepare(`INSERT INTO alert_status_events (id, alert_id, actor_id, actor_role, status, note) VALUES (?,?,?,?,?,?)`)
      .run(uuid(), id, req.user.id, 'reporter', 'open', source === 'citizen_report' ? 'Incident reported' : 'SOS raised');

    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);

    let helpersNotified = 0;
    let authoritiesNotified = 0;
    let cameraCoverage = { nearbyCameraCount: 0, nearbyAiCameraCount: 0 };
    if (typeof lat === 'number' && typeof lng === 'number') {
      if (source !== 'citizen_report') {
        const nearbyCameras = nearbyCamerasFor(lat, lng);
        cameraCoverage = {
          nearbyCameraCount: nearbyCameras.length,
          nearbyAiCameraCount: nearbyCameras.filter((camera) => camera.aiAvailable).length,
        };
        for (const camera of nearbyCameras) {
          db.prepare(`INSERT INTO alert_camera_links (id, alert_id, camera_id, distance_km, ai_available) VALUES (?,?,?,?,?)`)
            .run(uuid(), id, camera.id, camera.distanceKm, camera.aiAvailable ? 1 : 0);
        }
        if (nearbyCameras.length > 0) {
          db.prepare(`INSERT INTO alert_status_events (id, alert_id, actor_id, actor_role, status, note) VALUES (?,?,?,?,?,?)`)
            .run(
              uuid(),
              id,
              req.user.id,
              'system',
              'nearby_cctv_checked',
              `${nearbyCameras.length} registered RescueWave CCTV camera${nearbyCameras.length === 1 ? '' : 's'} nearby; ${cameraCoverage.nearbyAiCameraCount} with active AI monitoring.`
            );
        }
      }

      // SOS dispatches to nearby available Helpers; a citizen report doesn't
      // (it isn't "come now", it's a record) — only SOS pages the volunteer network.
      if (source !== 'citizen_report') {
        const helpers = db
          .prepare(`SELECT id, helper_lat, helper_lng FROM users WHERE role = 'helper' AND helper_verified = 1 AND helper_status = 'available'`)
          .all();
        const nearbyHelpers = helpers
          .map((h) => ({ ...h, distanceKm: haversineKm(lat, lng, h.helper_lat, h.helper_lng) }))
          .filter((h) => h.distanceKm !== null && h.distanceKm <= NEARBY_RADIUS_KM)
          .sort((a, b) => a.distanceKm - b.distanceKm)
          .slice(0, MAX_HELPERS_NOTIFIED);
        for (const h of nearbyHelpers) {
          sendPushToUser(h.id, {
            title: '🚨 Emergency nearby',
            body: `An SOS was raised ${h.distanceKm.toFixed(1)} km from you. Open RescueWave to respond.`,
            data: { type: 'sos_nearby', alertId: id },
          }).catch(() => {});
        }
        helpersNotified = nearbyHelpers.length;
      }

      // Both SOS and reports notify the relevant Authority type nearby.
      const relevantType = authorityTypeForCategory(category);
      const authorities = db
        .prepare(`SELECT id, authority_lat, authority_lng FROM users WHERE role = 'authority' AND authority_verified = 1 AND authority_type = ?`)
        .all(relevantType);
      const nearbyAuthorities = authorities
        .map((a) => ({ ...a, distanceKm: haversineKm(lat, lng, a.authority_lat, a.authority_lng) }))
        .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
        .slice(0, MAX_AUTHORITIES_NOTIFIED);
      for (const a of nearbyAuthorities) {
        sendPushToUser(a.id, {
          title: source === 'citizen_report' ? '📋 New incident report' : '🚨 Emergency nearby',
          body: source === 'citizen_report' ? `A ${category || 'general'} report was filed nearby.` : `An SOS was raised nearby. Open RescueWave to respond.`,
          data: { type: source === 'citizen_report' ? 'report_nearby' : 'sos_nearby_authority', alertId: id },
        }).catch(() => {});
      }
      authoritiesNotified = nearbyAuthorities.length;
    }

    res.status(201).json({ alert, helpersNotified, authoritiesNotified, cameraCoverage });
  });

  router.get('/mine', (req, res) => {
    const rows = db.prepare('SELECT * FROM alerts WHERE reporter_id = ? ORDER BY created_at DESC LIMIT 100').all(req.user.id);
    res.json({ alerts: rows });
  });

  // Assignments a Helper can act on: open alerts near their last known
  // location, plus whatever is currently assigned to them. Reports
  // (source='citizen_report') aren't included — those aren't Helper dispatches.
  router.get('/assignments', requireVerifiedHelper, (req, res) => {
    const me = db.prepare('SELECT helper_lat, helper_lng FROM users WHERE id = ?').get(req.user.id);
    const open = db.prepare(`SELECT * FROM alerts WHERE status = 'open' AND source != 'citizen_report' ORDER BY created_at DESC LIMIT 100`).all();
    const mine = db.prepare(`SELECT * FROM alerts WHERE assigned_helper_id = ? AND status != 'completed' ORDER BY created_at DESC`).all(req.user.id);

    const openNearby = open
      .map((a) => ({ ...a, distanceKm: haversineKm(me?.helper_lat, me?.helper_lng, a.lat, a.lng) }))
      .filter((a) => a.distanceKm === null || a.distanceKm <= NEARBY_RADIUS_KM)
      .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));

    res.json({ open: openNearby, assigned: mine });
  });

  // Cases an Authority can act on: everything (SOS + reports) matching their
  // type and jurisdiction area, plus whatever's currently assigned to them.
  router.get('/authority-assignments', requireVerifiedAuthority, (req, res) => {
    const me = db.prepare('SELECT authority_type, authority_lat, authority_lng FROM users WHERE id = ?').get(req.user.id);
    const relevantCategories = me.authority_type === 'hospital' ? ['medical'] : me.authority_type === 'fire' ? ['fire'] : null; // police sees everything else
    const all = db.prepare(`SELECT * FROM alerts WHERE status IN ('open','assigned') ORDER BY created_at DESC LIMIT 200`).all();
    const relevant = all.filter((a) => (relevantCategories ? relevantCategories.includes(a.category) : true));

    const open = relevant
      .filter((a) => !a.assigned_authority_id)
      .map((a) => ({ ...a, distanceKm: haversineKm(me?.authority_lat, me?.authority_lng, a.lat, a.lng) }))
      .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
    const mine = all.filter((a) => a.assigned_authority_id === req.user.id && a.authority_status !== 'closed');

    res.json({ open, assigned: mine });
  });

  router.get('/:id', (req, res) => {
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    // Was requireAuth-only (any logged-in user could pull ANY alert's
    // status/events/helper/authority info, not just people actually
    // involved) — found while wiring the admin dashboard's alert
    // timeline. Not exploitable via the app's own UI (nothing browses by
    // ID; the mobile app's own getAlert() call was unused dead code, and
    // Helpers/Authorities get full alert data for anything relevant to
    // them via /assignments or /authority-assignments instead — so this
    // never needed broader access to work), but shouldn't have relied on
    // that. Reporter's phone/medical info already had a stricter,
    // separate `involved` check below; this brings the rest of the
    // response up to the same bar instead of leaving it open by default.
    const involved = req.user.id === alert.reporter_id || req.user.id === alert.assigned_helper_id || req.user.id === alert.assigned_authority_id;
    if (!involved && !req.user.is_admin) {
      return res.status(403).json({ error: 'Not authorized to view this alert' });
    }

    const events = db.prepare('SELECT * FROM alert_status_events WHERE alert_id = ? ORDER BY created_at ASC').all(req.params.id);

    let helper = null;
    if (alert.assigned_helper_id) {
      helper = db.prepare('SELECT id, name, phone, helper_lat, helper_lng, helper_location_updated_at, helper_rating FROM users WHERE id = ?').get(alert.assigned_helper_id) || null;
    }
    let authority = null;
    if (alert.assigned_authority_id) {
      authority = db.prepare('SELECT id, name, authority_type, authority_org, phone, authority_lat, authority_lng, authority_location_updated_at FROM users WHERE id = ?').get(alert.assigned_authority_id) || null;
    }

    // Reporter's phone is only shared with whoever is actually involved in
    // this alert (the reporter themself, an assigned responder, or an
    // admin) — same `involved` computed above, which already includes the
    // admin check via the 403 gate before this point.
    let reporter = null;
    if (alert.reporter_id && (involved || req.user.is_admin)) {
      reporter = db.prepare('SELECT id, name, phone, blood_group, medical_info FROM users WHERE id = ?').get(alert.reporter_id) || null;
    }

    // If a responder has started sharing their live location for this
    // specific case, hand the reporter the token so they can open the same
    // public tracking page without needing their own account link.
    let liveShareToken = null;
    if (alert.assigned_helper_id || alert.assigned_authority_id) {
      const share = db
        .prepare(`SELECT share_token FROM live_shares WHERE alert_id = ? AND kind IN ('helper_mission','authority_case') AND status = 'active' ORDER BY created_at DESC LIMIT 1`)
        .get(alert.id);
      liveShareToken = share?.share_token || null;
    }

    res.json({ alert, events, helper, authority, reporter, liveShareToken });
  });

  // --- Helper track ------------------------------------------------------------
  router.post('/:id/accept', requireVerifiedHelper, (req, res) => {
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    if (alert.status !== 'open') return res.status(409).json({ error: `Alert is already ${alert.status}` });

    db.prepare(`UPDATE alerts SET status = 'assigned', assigned_helper_id = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(req.user.id, req.params.id);
    db.prepare(`INSERT INTO alert_status_events (id, alert_id, actor_id, actor_role, status, note) VALUES (?,?,?,?,?,?)`)
      .run(uuid(), req.params.id, req.user.id, 'helper', 'accepted', `Accepted by ${req.user.name}`);
    db.prepare(`UPDATE users SET helper_status = 'busy' WHERE id = ?`).run(req.user.id);

    if (alert.reporter_id) {
      sendPushToUser(alert.reporter_id, {
        title: 'Helper assigned',
        body: `${req.user.name} is responding to your SOS.`,
        data: { type: 'helper_assigned', alertId: req.params.id },
      }).catch(() => {});
    }
    res.json({ alert: db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id) });
  });

  // A helper declining a specific assignment doesn't change the alert's
  // status — it stays open for other nearby helpers. Logged for the timeline.
  router.post('/:id/reject', requireVerifiedHelper, (req, res) => {
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    db.prepare(`INSERT INTO alert_status_events (id, alert_id, actor_id, actor_role, status, note) VALUES (?,?,?,?,?,?)`)
      .run(uuid(), req.params.id, req.user.id, 'helper', 'rejected_by_helper', `Declined by ${req.user.name}`);
    res.json({ ok: true });
  });

  const MISSION_STATUSES = ['on_the_way', 'arrived', 'assisting', 'completed'];
  router.post('/:id/status', requireVerifiedHelper, (req, res) => {
    const { status, note, lat, lng } = req.body || {};
    if (!MISSION_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${MISSION_STATUSES.join(', ')}` });
    }
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    if (alert.assigned_helper_id !== req.user.id) return res.status(403).json({ error: 'You are not assigned to this alert' });

    db.prepare(`INSERT INTO alert_status_events (id, alert_id, actor_id, actor_role, status, note, lat, lng) VALUES (?,?,?,?,?,?,?,?)`)
      .run(uuid(), req.params.id, req.user.id, 'helper', status, note || null, lat ?? null, lng ?? null);

    if (status === 'completed') {
      db.prepare(`UPDATE alerts SET status = 'completed', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
      db.prepare(`UPDATE users SET helper_status = 'available', emergencies_attended = emergencies_attended + 1, people_helped = people_helped + 1 WHERE id = ?`)
        .run(req.user.id);
    } else {
      db.prepare(`UPDATE alerts SET updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
    }

    if (alert.reporter_id) {
      const labels = { on_the_way: 'is on the way', arrived: 'has arrived', assisting: 'is assisting you', completed: 'marked your SOS as completed' };
      sendPushToUser(alert.reporter_id, {
        title: 'Helper update',
        body: `${req.user.name} ${labels[status]}.`,
        data: { type: 'helper_status', alertId: req.params.id, status },
      }).catch(() => {});
    }

    res.json({ alert: db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id) });
  });

  // --- Authority track -----------------------------------------------------------
  // Independent of the Helper track: an alert can have a Helper AND an
  // Authority both engaged at once. "Accept case" / "Update status" /
  // "Close case" per the brief map to accept / status / status('closed').
  router.post('/:id/authority/accept', requireVerifiedAuthority, (req, res) => {
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    if (alert.assigned_authority_id) return res.status(409).json({ error: 'This case already has an assigned Authority' });

    db.prepare(`UPDATE alerts SET assigned_authority_id = ?, authority_status = 'accepted', updated_at = datetime('now') WHERE id = ?`)
      .run(req.user.id, req.params.id);
    db.prepare(`INSERT INTO alert_status_events (id, alert_id, actor_id, actor_role, status, note) VALUES (?,?,?,?,?,?)`)
      .run(uuid(), req.params.id, req.user.id, 'authority', 'accepted', `Case accepted by ${req.user.authority_org || req.user.name}`);

    if (alert.reporter_id) {
      sendPushToUser(alert.reporter_id, {
        title: 'Authority assigned',
        body: `${req.user.authority_org || req.user.name} is now handling your case.`,
        data: { type: 'authority_assigned', alertId: req.params.id },
      }).catch(() => {});
    }
    res.json({ alert: db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id) });
  });

  const AUTHORITY_STATUSES = ['en_route', 'on_scene', 'investigating', 'closed'];
  router.post('/:id/authority/status', requireVerifiedAuthority, (req, res) => {
    const { status, note, lat, lng } = req.body || {};
    if (!AUTHORITY_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${AUTHORITY_STATUSES.join(', ')}` });
    }
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    if (alert.assigned_authority_id !== req.user.id) return res.status(403).json({ error: 'You are not assigned to this case' });

    db.prepare(`INSERT INTO alert_status_events (id, alert_id, actor_id, actor_role, status, note, lat, lng) VALUES (?,?,?,?,?,?,?,?)`)
      .run(uuid(), req.params.id, req.user.id, 'authority', status, note || null, lat ?? null, lng ?? null);
    db.prepare(`UPDATE alerts SET authority_status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, req.params.id);

    if (status === 'closed') {
      db.prepare(`UPDATE users SET cases_closed = cases_closed + 1 WHERE id = ?`).run(req.user.id);
      // If no Helper track is active either, the alert as a whole is done.
      if (!alert.assigned_helper_id || alert.status === 'completed') {
        db.prepare(`UPDATE alerts SET status = 'completed' WHERE id = ? AND status != 'cancelled'`).run(req.params.id);
      }
    }

    if (alert.reporter_id) {
      const labels = { en_route: 'is en route', on_scene: 'is on the scene', investigating: 'is investigating your case', closed: 'closed your case' };
      sendPushToUser(alert.reporter_id, {
        title: 'Authority update',
        body: `${req.user.authority_org || req.user.name} ${labels[status]}.`,
        data: { type: 'authority_status', alertId: req.params.id, status },
      }).catch(() => {});
    }

    res.json({ alert: db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id) });
  });

  router.post('/:id/cancel', (req, res) => {
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    if (alert.reporter_id !== req.user.id) return res.status(403).json({ error: 'Only the reporter can cancel this alert' });
    db.prepare(`UPDATE alerts SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
    db.prepare(`INSERT INTO alert_status_events (id, alert_id, actor_id, actor_role, status, note) VALUES (?,?,?,?,?,?)`)
      .run(uuid(), req.params.id, req.user.id, 'reporter', 'cancelled', 'Cancelled by reporter');
    if (alert.assigned_helper_id) db.prepare(`UPDATE users SET helper_status = 'available' WHERE id = ?`).run(alert.assigned_helper_id);
    res.json({ ok: true });
  });

  return router;
};
