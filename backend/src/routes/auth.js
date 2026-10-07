const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id }, // role/admin/helper-status are re-read fresh from DB on every request, not trusted from the token
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

function toPublicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}

router.post('/register', (req, res) => {
  const { name, email, password, phone } = req.body || {};
  const forbiddenRoleFields = ['role', 'is_admin', 'helper_verified', 'authority_verified', 'helper_status', 'authority_type', 'authority_org'];
  const attemptedElevation = forbiddenRoleFields.some((field) => Object.prototype.hasOwnProperty.call(req.body || {}, field));
  if (attemptedElevation) {
    return res.status(400).json({ error: 'Public signup cannot set roles or verification fields' });
  }
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (exists) return res.status(409).json({ error: 'An account with this email already exists' });

  const id = uuid();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(`INSERT INTO users (id, name, email, phone, password_hash, role, is_admin, helper_verified, authority_verified) VALUES (?,?,?,?,?, 'user', 0, 0, 0)`)
    .run(id, name.trim(), normalizedEmail, phone || null, hash);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.status(201).json({ token: signToken(user), user: toPublicUser(user) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json({ token: signToken(user), user: toPublicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: toPublicUser(user) });
});

router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  }
  if (newPassword.length < 6) return res.status(400).json({ error: 'newPassword must be at least 6 characters' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), req.user.id);
  res.json({ ok: true });
});

module.exports = { router, toPublicUser };
