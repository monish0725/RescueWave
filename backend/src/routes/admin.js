const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { toPublicUser } = require('./auth');
const { sendPushToUser } = require('../utils/push');

// Cross-cutting views for the Admin Dashboard (Phase 5) — everything here
// is a read (or a light promote/deactivate action) across data that
// otherwise lives scoped to "mine" in helpers.js/authorities.js/cameras.js/
// missingPersons.js. Kept in one file since the dashboard's own navigation
// is organized this way (Users, Live Alerts, Cameras, Missing Persons,
// Analytics, System Health), not by which micro-resource owns the table.
const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/stats', (req, res) => {
  const count = (sql, ...params) => db.prepare(sql).get(...params).c;
  res.json({
    users: {
      total: count("SELECT COUNT(*) c FROM users"),
      public: count("SELECT COUNT(*) c FROM users WHERE role = 'user'"),
      helpers: count("SELECT COUNT(*) c FROM users WHERE role = 'helper' AND helper_verified = 1"),
      authorities: count("SELECT COUNT(*) c FROM users WHERE role = 'authority' AND authority_verified = 1"),
      admins: count("SELECT COUNT(*) c FROM users WHERE is_admin = 1"),
    },
    applications: {
      helpersPending: count("SELECT COUNT(*) c FROM helper_applications WHERE status = 'pending'"),
      authoritiesPending: count("SELECT COUNT(*) c FROM authority_applications WHERE status = 'pending'"),
    },
    alerts: {
      open: count("SELECT COUNT(*) c FROM alerts WHERE status = 'open'"),
      assigned: count("SELECT COUNT(*) c FROM alerts WHERE status = 'assigned'"),
      completedToday: count("SELECT COUNT(*) c FROM alerts WHERE status = 'completed' AND date(updated_at) = date('now')"),
      total: count('SELECT COUNT(*) c FROM alerts'),
      sosTotal: count("SELECT COUNT(*) c FROM alerts WHERE source = 'manual_sos'"),
      reportsTotal: count("SELECT COUNT(*) c FROM alerts WHERE source = 'citizen_report'"),
    },
    cameras: {
      total: count('SELECT COUNT(*) c FROM cameras'),
      active: count("SELECT COUNT(*) c FROM cameras WHERE status = 'active'"),
    },
    missingPersons: {
      active: count("SELECT COUNT(*) c FROM missing_persons WHERE status = 'missing'"),
      found: count("SELECT COUNT(*) c FROM missing_persons WHERE status = 'found'"),
    },
  });
});

// Alert counts by category — feeds the Analytics category-breakdown chart.
router.get('/stats/categories', (req, res) => {
  const rows = db.prepare(`SELECT COALESCE(category, 'uncategorized') category, COUNT(*) c FROM alerts GROUP BY category ORDER BY c DESC`).all();
  res.json({ categories: rows });
});

// Alerts-per-day for the last 14 days — feeds the Analytics trend chart.
router.get('/stats/trend', (req, res) => {
  const rows = db.prepare(`
    SELECT date(created_at) day, COUNT(*) c
    FROM alerts
    WHERE created_at >= datetime('now', '-14 days')
    GROUP BY day
    ORDER BY day ASC
  `).all();
  res.json({ trend: rows });
});

router.get('/users', (req, res) => {
  const { role, search } = req.query;
  let sql = 'SELECT * FROM users';
  const clauses = [];
  const params = [];
  if (role) { clauses.push('role = ?'); params.push(role); }
  if (search) { clauses.push('(name LIKE ? OR email LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT 300';
  res.json({ users: db.prepare(sql).all(...params).map(toPublicUser) });
});

router.post('/users/:id/make-admin', (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/users/:id/revoke-admin', (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "You can't revoke your own admin access" });
  db.prepare('UPDATE users SET is_admin = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

const REPORT_STATUSES = ['submitted', 'under_review', 'verified', 'resolved', 'rejected'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];

router.get('/alerts', (req, res) => {
  const { status, source, category, report_status } = req.query;
  let sql = 'SELECT * FROM alerts';
  const clauses = [];
  const params = [];
  if (status) { clauses.push('status = ?'); params.push(status); }
  if (source) { clauses.push('source = ?'); params.push(source); }
  if (category) { clauses.push('category = ?'); params.push(category); }
  if (report_status) { clauses.push('report_status = ?'); params.push(report_status); }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT 300';
  res.json({ alerts: db.prepare(sql).all(...params) });
});

router.patch('/alerts/:id/review', (req, res) => {
  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });

  const { report_status, severity, note } = req.body || {};
  if (!REPORT_STATUSES.includes(report_status)) {
    return res.status(400).json({ error: `report_status must be one of: ${REPORT_STATUSES.join(', ')}` });
  }
  if (severity && !SEVERITIES.includes(severity)) {
    return res.status(400).json({ error: `severity must be one of: ${SEVERITIES.join(', ')}` });
  }

  const nextStatus = report_status === 'resolved'
    ? 'completed'
    : report_status === 'rejected'
      ? 'cancelled'
      : alert.status;

  db.prepare(
    `UPDATE alerts
     SET report_status = ?, severity = COALESCE(?, severity), admin_note = ?, reviewed_by = ?, reviewed_at = datetime('now'), status = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(report_status, severity || null, note || null, req.user.id, nextStatus, req.params.id);
  db.prepare(`INSERT INTO alert_status_events (id, alert_id, actor_id, actor_role, status, note) VALUES (?,?,?,?,?,?)`)
    .run(uuid(), req.params.id, req.user.id, 'system', `review_${report_status}`, note || `Admin marked report ${report_status.replace(/_/g, ' ')}`);

  res.json({ alert: db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id) });
});

router.get('/cameras', (req, res) => {
  res.json({ cameras: db.prepare('SELECT * FROM cameras ORDER BY created_at DESC LIMIT 300').all() });
});

router.get('/missing-persons', (req, res) => {
  const { status } = req.query;
  const sql = status
    ? 'SELECT * FROM missing_persons WHERE status = ? ORDER BY created_at DESC LIMIT 300'
    : 'SELECT * FROM missing_persons ORDER BY created_at DESC LIMIT 300';
  res.json({ missingPersons: status ? db.prepare(sql).all(status) : db.prepare(sql).all() });
});

router.patch('/missing-persons/:id/status', (req, res) => {
  const record = db.prepare('SELECT * FROM missing_persons WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Missing person record not found' });

  const { status } = req.body || {};
  if (!['missing', 'found'].includes(status)) {
    return res.status(400).json({ error: "status must be 'missing' or 'found'" });
  }

  db.prepare("UPDATE missing_persons SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
  if (status === 'found') {
    db.prepare(
      `UPDATE missing_person_matches
       SET verification_status = 'confirmed_sighting'
       WHERE missing_person_id = ? AND verification_status IN ('pending', 'verified')`
    ).run(req.params.id);
    if (record.status !== 'found' && record.reporter_id) {
      sendPushToUser(record.reporter_id, {
        title: '✅ Missing person found',
        body: `${record.name} has been marked found by RescueWave admin. AI camera matching has stopped for this case.`,
        data: { type: 'missing_found', missingPersonId: req.params.id },
      }).catch(() => {});
    }
  }

  res.json({ missingPerson: db.prepare('SELECT * FROM missing_persons WHERE id = ?').get(req.params.id) });
});

// Final-audit Phase 4 — "View AI Sightings": every camera-AI match for one
// missing person, camera name joined in, newest first. Same shape the
// mobile app's own /missing-persons/:id/matches returns, just without the
// "does this admin own a camera on the case" gate the mobile route has —
// an admin can see every case's sightings, not just ones involving their
// own cameras.
router.get('/missing-persons/:id/matches', (req, res) => {
  const record = db.prepare('SELECT * FROM missing_persons WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Missing person record not found' });
  const matches = db
    .prepare(`SELECT * FROM missing_person_matches WHERE missing_person_id = ? ORDER BY matched_at DESC`)
    .all(req.params.id);
  const withCameraNames = matches.map((m) => {
    const camera = m.camera_id ? db.prepare('SELECT name, address FROM cameras WHERE id = ?').get(m.camera_id) : null;
    return { ...m, camera_name: camera?.name ?? null, camera_address: camera?.address ?? null };
  });
  res.json({ matches: withCameraNames });
});

const MATCH_VERIFICATION_STATUSES = ['pending', 'verified', 'rejected', 'confirmed_sighting'];

// A human admin decision on one potential match. Never called by
// ai-service — that service only ever POSTs new matches at 'pending';
// this is the one place verification_status can move off of it, and it's
// gated behind requireAdmin at the top of this file, same as every other
// route here.
router.patch('/missing-persons/:id/matches/:matchId', (req, res) => {
  const match = db.prepare('SELECT * FROM missing_person_matches WHERE id = ? AND missing_person_id = ?').get(req.params.matchId, req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const { verification_status } = req.body || {};
  if (!MATCH_VERIFICATION_STATUSES.includes(verification_status)) {
    return res.status(400).json({ error: `verification_status must be one of: ${MATCH_VERIFICATION_STATUSES.join(', ')}` });
  }

  db.prepare('UPDATE missing_person_matches SET verification_status = ? WHERE id = ?').run(verification_status, req.params.matchId);
  if (verification_status === 'confirmed_sighting') {
    const record = db.prepare('SELECT * FROM missing_persons WHERE id = ?').get(req.params.id);
    db.prepare("UPDATE missing_persons SET status = 'found', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    if (record?.reporter_id) {
      sendPushToUser(record.reporter_id, {
        title: '✅ Missing person found',
        body: `${record.name} has a confirmed camera sighting. AI camera matching has stopped for this case.`,
        data: { type: 'missing_found', missingPersonId: req.params.id },
      }).catch(() => {});
    }
  }
  res.json({ match: db.prepare('SELECT * FROM missing_person_matches WHERE id = ?').get(req.params.matchId) });
});

module.exports = router;
