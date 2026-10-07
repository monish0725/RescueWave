const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { toPublicUser } = require('./auth');

const router = express.Router();
router.use(requireAuth);

router.get('/me', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: toPublicUser(user) });
});

// Profile fields that live on the account (so they follow the user across
// devices). Everything else — contacts, alerts, missing persons — stays in
// the on-device SQLite database.
router.patch('/me', (req, res) => {
  const { name, phone, blood_group, medical_info } = req.body || {};
  db.prepare(
    `UPDATE users SET
       name = COALESCE(?, name),
       phone = COALESCE(?, phone),
       blood_group = COALESCE(?, blood_group),
       medical_info = COALESCE(?, medical_info)
     WHERE id = ?`
  ).run(name ?? null, phone ?? null, blood_group ?? null, medical_info ?? null, req.user.id);
  res.json({ user: toPublicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

module.exports = router;
