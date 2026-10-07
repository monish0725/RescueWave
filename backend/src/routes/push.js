const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.post('/register', (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token is required' });
  db.prepare(
    `INSERT INTO push_tokens (token, user_id, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, updated_at = datetime('now')`
  ).run(token, req.user.id);
  res.status(201).json({ ok: true });
});

router.post('/unregister', (req, res) => {
  const { token } = req.body || {};
  if (token) db.prepare('DELETE FROM push_tokens WHERE token = ? AND user_id = ?').run(token, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
