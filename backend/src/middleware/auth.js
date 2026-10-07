const jwt = require('jsonwebtoken');
const db = require('../db');

// requireAuth verifies the JWT for identity (its `id` claim) but always
// re-reads the user's role/admin/helper-status fresh from the database
// before attaching req.user. Roles can change after a token was issued
// (e.g. a helper application gets approved) and tokens live up to 30 days,
// so trusting stale claims baked into the JWT would let a promoted/demoted
// user's permissions lag behind reality.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    const { password_hash, ...safeUser } = user;
    req.user = safeUser;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
}

// A helper who was approved but has since gone offline can still manage
// their profile/status — this only gates actions that require an active,
// verified helper (accepting a mission, etc).
function requireVerifiedHelper(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.user.role !== 'helper' || !req.user.helper_verified) {
    return res.status(403).json({ error: 'Requires an approved Helper account' });
  }
  next();
}

function requireVerifiedAuthority(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.user.role !== 'authority' || !req.user.authority_verified) {
    return res.status(403).json({ error: 'Requires an approved Authority account' });
  }
  next();
}

// The AI service has no separate service-account mechanism (see
// ai-service/rescuewave_ai/api_client.py) — it authenticates as a normal
// user, specifically the owner of the camera(s) it's processing. That's
// the same trust boundary GET /cameras/streaming/all and POST
// /missing-persons/:id/matches already use (admin OR camera ownership) —
// reuse it here instead of inventing a new auth system, so an ordinary
// account that has never registered an active camera can't call
// service-only endpoints like PATCH /missing-persons/:id/validation.
function requireCameraOperator(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.user.is_admin) return next();
  const owns = db
    .prepare(`SELECT 1 FROM cameras WHERE owner_id = ? AND status = 'active' AND stream_url IS NOT NULL LIMIT 1`)
    .get(req.user.id);
  if (!owns) return res.status(403).json({ error: 'Requires an active registered camera (AI service account)' });
  next();
}

module.exports = { requireAuth, requireRole, requireAdmin, requireVerifiedHelper, requireVerifiedAuthority, requireCameraOperator };
