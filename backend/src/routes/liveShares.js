const express = require('express');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

function generateToken() {
  return crypto.randomBytes(9).toString('base64url'); // short, URL-safe
}

// Authenticated side: start/ping/stop a live share. Used for both a helper's
// live location while responding to a mission, and a user sharing their
// location with an emergency contact ("Send Live Location").
const authedRouter = express.Router();
authedRouter.use(requireAuth);

authedRouter.post('/', (req, res) => {
  const { kind, alert_id, label } = req.body || {};
  if (!['helper_mission', 'authority_case', 'contact_share'].includes(kind)) {
    return res.status(400).json({ error: "kind must be 'helper_mission', 'authority_case' or 'contact_share'" });
  }
  const id = uuid();
  const token = generateToken();
  db.prepare(`INSERT INTO live_shares (id, share_token, kind, owner_user_id, alert_id, label, status) VALUES (?,?,?,?,?,?, 'active')`)
    .run(id, token, kind, req.user.id, alert_id || null, label || null);
  res.status(201).json({ share: db.prepare('SELECT * FROM live_shares WHERE id = ?').get(id) });
});

authedRouter.post('/:token/ping', (req, res) => {
  const { lat, lng } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat and lng (numbers) are required' });
  }
  const share = db.prepare('SELECT * FROM live_shares WHERE share_token = ?').get(req.params.token);
  if (!share) return res.status(404).json({ error: 'Share not found' });
  if (share.owner_user_id !== req.user.id) return res.status(403).json({ error: 'Not your share' });
  if (share.status !== 'active') return res.status(409).json({ error: 'Share is no longer active' });

  db.prepare(`INSERT INTO live_share_pings (id, share_id, lat, lng) VALUES (?,?,?,?)`).run(uuid(), share.id, lat, lng);
  res.json({ ok: true });
});

authedRouter.post('/:token/stop', (req, res) => {
  const share = db.prepare('SELECT * FROM live_shares WHERE share_token = ?').get(req.params.token);
  if (!share) return res.status(404).json({ error: 'Share not found' });
  if (share.owner_user_id !== req.user.id) return res.status(403).json({ error: 'Not your share' });
  db.prepare(`UPDATE live_shares SET status = 'stopped', stopped_at = datetime('now') WHERE id = ?`).run(share.id);
  res.json({ ok: true });
});

authedRouter.get('/mine/active', (req, res) => {
  const rows = db.prepare(`SELECT * FROM live_shares WHERE owner_user_id = ? AND status = 'active' ORDER BY created_at DESC`).all(req.user.id);
  res.json({ shares: rows });
});

// Public side: no auth. The token itself is the secret (9 random bytes —
// unguessable), so anyone with the link (an emergency contact via SMS, or
// the reporter watching their assigned helper) can view it without an
// account. Used by both the JSON API (polled by the mobile app) and the
// plain HTML page below (for people without the app).
const publicRouter = express.Router();

function getShareData(token) {
  const share = db.prepare('SELECT * FROM live_shares WHERE share_token = ?').get(token);
  if (!share) return null;
  const owner = db.prepare('SELECT name FROM users WHERE id = ?').get(share.owner_user_id);
  const latest = db.prepare('SELECT lat, lng, recorded_at FROM live_share_pings WHERE share_id = ? ORDER BY recorded_at DESC LIMIT 1').get(share.id);
  return { share, ownerName: owner?.name || 'RescueWave user', latest: latest || null };
}

publicRouter.get('/:token.json', (req, res) => {
  const data = getShareData(req.params.token);
  if (!data) return res.status(404).json({ error: 'Share not found or expired' });
  res.json(data);
});

publicRouter.get('/:token', (req, res) => {
  const data = getShareData(req.params.token);
  if (!data) return res.status(404).send('<h1>Link not found or expired</h1>');
  const { share, ownerName } = data;
  res.setHeader('Content-Type', 'text/html');
  res.send(renderShareHtml(req.params.token, ownerName, share.status));
});

function renderShareHtml(token, ownerName, status) {
  // Plain Leaflet + OpenStreetMap tiles — no Google Maps key required. Polls
  // the JSON endpoint above every 5s while the share is active.
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${ownerName}'s live location — RescueWave</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    body { margin:0; font-family: -apple-system, Roboto, sans-serif; }
    #bar { background:#0B1E45; color:#fff; padding:14px 18px; display:flex; justify-content:space-between; align-items:center; }
    #bar h1 { font-size:15px; margin:0; font-weight:600; }
    #status { font-size:12px; color:#D4AF37; }
    #map { height: calc(100vh - 54px); width: 100%; }
    #empty { padding: 40px 20px; text-align:center; color:#334155; }
  </style>
</head>
<body>
  <div id="bar"><h1>📍 ${ownerName}'s live location</h1><span id="status">Loading…</span></div>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const token = ${JSON.stringify(token)};
    let map, marker;
    function initMap(lat, lng) {
      map = L.map('map').setView([lat, lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
      marker = L.marker([lat, lng]).addTo(map);
    }
    async function poll() {
      try {
        const res = await fetch('/share/' + token + '.json');
        if (!res.ok) { document.getElementById('status').textContent = 'Link expired'; return; }
        const data = await res.json();
        const statusEl = document.getElementById('status');
        if (!data.latest) { statusEl.textContent = 'Waiting for first location update…'; return; }
        const { lat, lng, recorded_at } = data.latest;
        if (!map) initMap(lat, lng); else marker.setLatLng([lat, lng]);
        statusEl.textContent = data.share.status === 'active'
          ? 'Live — updated ' + new Date(recorded_at).toLocaleTimeString()
          : 'Sharing stopped — last seen ' + new Date(recorded_at).toLocaleTimeString();
        if (data.share.status !== 'active') clearInterval(timer);
      } catch (e) {
        document.getElementById('status').textContent = 'Connection error';
      }
    }
    poll();
    const timer = setInterval(poll, 5000);
  </script>
</body>
</html>`;
}

module.exports = { authedRouter, publicRouter };
