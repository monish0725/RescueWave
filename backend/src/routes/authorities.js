const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth, requireAdmin, requireVerifiedAuthority } = require('../middleware/auth');
const { toPublicUser } = require('./auth');

const router = express.Router();
router.use(requireAuth);

const AUTHORITY_TYPES = ['police', 'hospital', 'fire'];

// Organization -> Register as an Authority -> Admin Review -> Approved/Rejected.
router.post('/apply', (req, res) => {
  const { authority_type, org_name, contact_name, phone, email, address, lat, lng, license_or_badge_id } = req.body || {};
  if (!AUTHORITY_TYPES.includes(authority_type)) {
    return res.status(400).json({ error: `authority_type must be one of: ${AUTHORITY_TYPES.join(', ')}` });
  }
  if (!org_name || !contact_name || !phone || !email) {
    return res.status(400).json({ error: 'org_name, contact_name, phone and email are required' });
  }
  const existingPending = db
    .prepare(`SELECT id FROM authority_applications WHERE user_id = ? AND status = 'pending'`)
    .get(req.user.id);
  if (existingPending) return res.status(409).json({ error: 'You already have a pending Authority application' });
  if (req.user.role === 'authority' && req.user.authority_verified) {
    return res.status(409).json({ error: 'This account is already an approved Authority' });
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO authority_applications
      (id, user_id, authority_type, org_name, contact_name, phone, email, address, lat, lng, license_or_badge_id, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, 'pending')`
  ).run(id, req.user.id, authority_type, org_name.trim(), contact_name.trim(), phone.trim(), email.trim(), address || null, lat ?? null, lng ?? null, license_or_badge_id || null);

  res.status(201).json({ application: db.prepare('SELECT * FROM authority_applications WHERE id = ?').get(id) });
});

router.get('/me', (req, res) => {
  const application = db
    .prepare('SELECT * FROM authority_applications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(req.user.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ application: application || null, profile: toPublicUser(user) });
});

router.post('/me/location', requireVerifiedAuthority, (req, res) => {
  const { lat, lng } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat and lng (numbers) are required' });
  }
  db.prepare(`UPDATE users SET authority_lat = ?, authority_lng = ?, authority_location_updated_at = datetime('now') WHERE id = ?`)
    .run(lat, lng, req.user.id);
  res.json({ ok: true });
});

// Admin review queue — same pattern as Helpers, same caveat: no dashboard UI
// yet (Phase 5), reviewed via backend/src/admin-cli.js in the meantime.
router.get('/admin/applications', requireAdmin, (req, res) => {
  const { status = 'pending' } = req.query;
  res.json({ applications: db.prepare('SELECT * FROM authority_applications WHERE status = ? ORDER BY created_at ASC').all(status) });
});

router.post('/admin/applications/:id/approve', requireAdmin, (req, res) => {
  const app = db.prepare('SELECT * FROM authority_applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  if (app.status !== 'pending') return res.status(409).json({ error: `Application is already ${app.status}` });

  db.prepare(`UPDATE authority_applications SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now'), admin_note = ? WHERE id = ?`)
    .run(req.user.id, req.body?.note || null, req.params.id);
  db.prepare(
    `UPDATE users SET role = 'authority', authority_verified = 1, authority_type = ?, authority_org = ?, authority_lat = ?, authority_lng = ? WHERE id = ?`
  ).run(app.authority_type, app.org_name, app.lat, app.lng, app.user_id);

  res.json({ ok: true });
});

router.post('/admin/applications/:id/reject', requireAdmin, (req, res) => {
  const app = db.prepare('SELECT * FROM authority_applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  if (app.status !== 'pending') return res.status(409).json({ error: `Application is already ${app.status}` });

  db.prepare(`UPDATE authority_applications SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now'), admin_note = ? WHERE id = ?`)
    .run(req.user.id, req.body?.note || null, req.params.id);
  res.json({ ok: true });
});

module.exports = { router, AUTHORITY_TYPES };
