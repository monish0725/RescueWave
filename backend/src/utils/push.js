const db = require('../db');

// Sends real push notifications via Expo's push service (no Firebase — the
// Expo Go / EAS-built app already has a push channel wired up by default).
// This performs a real network call to Expo when the backend is deployed
// with internet access; nothing here is simulated.
async function sendPushToUser(userId, { title, body, data }) {
  const tokens = db.prepare('SELECT token FROM push_tokens WHERE user_id = ?').all(userId);
  if (tokens.length === 0) return { sent: 0 };
  return sendPushToTokens(tokens.map((t) => t.token), { title, body, data });
}

async function sendPushToTokens(tokens, { title, body, data }) {
  if (tokens.length === 0) return { sent: 0 };
  const messages = tokens.map((to) => ({
    to,
    sound: 'default',
    title,
    body,
    data: data || {},
    priority: 'high',
  }));
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      console.error('Expo push send failed', res.status, await res.text().catch(() => ''));
      return { sent: 0, error: true };
    }
    return { sent: messages.length };
  } catch (err) {
    console.error('Expo push send error', err.message);
    return { sent: 0, error: true };
  }
}

module.exports = { sendPushToUser, sendPushToTokens };
