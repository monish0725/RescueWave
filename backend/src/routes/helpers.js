const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth, requireAdmin, requireVerifiedHelper } = require('../middleware/auth');
const { toPublicUser } = require('./auth');

const router = express.Router();
router.use(requireAuth);

const SKILLS = ['first_aid', 'medical', 'security', 'general_volunteer'];

function parseSkills(input) {
  const arr = Array.isArray(input) ? input : [];
  return arr.filter((s) => SKILLS.includes(s));
}

// Public User -> Apply to become a Helper. One pending application at a time;
// a rejected application can be re-submitted (a fresh row, so the review
// trail on the old one is preserved).
router.post('/apply', (req, res) => {
  const { full_name, phone, email, address, id_proof_uri, skills, availability, emergency_contact_name, emergency_contact_phone } = req.body || {};
  if (!full_name || !phone || !email) {
    return res.status(400).json({ error: 'full_name, phone and email are required' });
  }
  const parsedSkills = parseSkills(skills);
  if (parsedSkills.length === 0) {
    return res.status(400).json({ error: `Select at least one skill: ${SKILLS.join(', ')}` });
  }
  const existingPending = db
    .prepare(`SELECT id FROM helper_applications WHERE user_id = ? AND status = 'pending'`)
    .get(req.user.id);
  if (existingPending) return res.status(409).json({ error: 'You already have a pending Helper application' });
  if (req.user.role === 'helper' && req.user.helper_verified) {
    return res.status(409).json({ error: 'You are already an approved Helper' });
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO helper_applications
      (id, user_id, full_name, phone, email, address, id_proof_uri, skills, availability, emergency_contact_name, emergency_contact_phone, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, 'pending')`
  ).run(id, req.user.id, full_name.trim(), phone.trim(), email.trim(), address || null, id_proof_uri || null, JSON.stringify(parsedSkills), availability || null, emergency_contact_name || null, emergency_contact_phone || null);

  const application = db.prepare('SELECT * FROM helper_applications WHERE id = ?').get(id);
  res.status(201).json({ application: { ...application, skills: JSON.parse(application.skills) } });
});

// My latest application + my helper profile (if approved).
router.get('/me', (req, res) => {
  const application = db
    .prepare('SELECT * FROM helper_applications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(req.user.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({
    application: application ? { ...application, skills: JSON.parse(application.skills) } : null,
    profile: toPublicUser(user),
  });
});

// Approved-helper self-management -------------------------------------------------
router.patch('/me/status', requireVerifiedHelper, (req, res) => {
  const { status } = req.body || {};
  if (!['available', 'busy', 'offline'].includes(status)) {
    return res.status(400).json({ error: "status must be 'available', 'busy' or 'offline'" });
  }
  db.prepare('UPDATE users SET helper_status = ? WHERE id = ?').run(status, req.user.id);
  res.json({ ok: true, helper_status: status });
});

router.post('/me/location', requireVerifiedHelper, (req, res) => {
  const { lat, lng } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat and lng (numbers) are required' });
  }
  db.prepare(`UPDATE users SET helper_lat = ?, helper_lng = ?, helper_location_updated_at = datetime('now') WHERE id = ?`)
    .run(lat, lng, req.user.id);
  res.json({ ok: true });
});

// Admin review queue ---------------------------------------------------------------
// No separate admin dashboard exists yet (Phase 5) — these endpoints are
// exactly what it will call. Until then, use backend/src/admin-cli.js to
// review applications from the terminal with the same effect.
router.get('/admin/applications', requireAdmin, (req, res) => {
  const { status = 'pending' } = req.query;
  const rows = db.prepare('SELECT * FROM helper_applications WHERE status = ? ORDER BY created_at ASC').all(status);
  res.json({ applications: rows.map((a) => ({ ...a, skills: JSON.parse(a.skills) })) });
});

router.post('/admin/applications/:id/approve', requireAdmin, (req, res) => {
  const app = db.prepare('SELECT * FROM helper_applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  if (app.status !== 'pending') return res.status(409).json({ error: `Application is already ${app.status}` });

  db.prepare(`UPDATE helper_applications SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now'), admin_note = ? WHERE id = ?`)
    .run(req.user.id, req.body?.note || null, req.params.id);
  db.prepare(`UPDATE users SET role = 'helper', helper_verified = 1, helper_skills = ?, helper_status = 'offline' WHERE id = ?`)
    .run(app.skills, app.user_id);

  res.json({ ok: true });
});

router.post('/admin/applications/:id/reject', requireAdmin, (req, res) => {
  const app = db.prepare('SELECT * FROM helper_applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  if (app.status !== 'pending') return res.status(409).json({ error: `Application is already ${app.status}` });

  db.prepare(`UPDATE helper_applications SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now'), admin_note = ? WHERE id = ?`)
    .run(req.user.id, req.body?.note || null, req.params.id);
  res.json({ ok: true });
});

module.exports = { router, SKILLS };
