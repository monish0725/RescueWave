#!/usr/bin/env node
// Minimal terminal admin tool — reviewing Helper and Authority applications —
// used until the real Admin Dashboard (Phase 5) exists. It operates on the
// exact same tables/columns the future dashboard's UI will use, so nothing
// here needs to change when that's built; the dashboard just becomes another
// caller of the same underlying data.
//
// Usage:
//   node src/admin-cli.js ensure-ai-demo [email] [password] [--camera]
//   node src/admin-cli.js make-admin <email>
//   node src/admin-cli.js list-admins
//   node src/admin-cli.js applications [pending|approved|rejected]
//   node src/admin-cli.js approve <applicationId> [note]
//   node src/admin-cli.js reject <applicationId> [note]
//   node src/admin-cli.js authority-applications [pending|approved|rejected]
//   node src/admin-cli.js authority-approve <applicationId> [note]
//   node src/admin-cli.js authority-reject <applicationId> [note]
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('./db');

const [, , cmd, ...args] = process.argv;

function printTable(rows) {
  if (rows.length === 0) {
    console.log('(none)');
    return;
  }
  console.table(rows);
}

function requireAdminAccount() {
  const admin = db.prepare('SELECT id FROM users WHERE is_admin = 1 LIMIT 1').get();
  if (!admin) {
    console.error('No admin account exists yet. Run: node src/admin-cli.js make-admin <your-email>');
    process.exit(1);
  }
  return admin;
}

function makeAdmin(email) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!user) {
    console.error(`No account found for ${email}. That person needs to register in the app first.`);
    process.exit(1);
  }
  db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
  console.log(`✔ ${user.name} <${user.email}> is now an admin.`);
}

function listAdmins() {
  printTable(db.prepare('SELECT id, name, email FROM users WHERE is_admin = 1').all());
}

function ensureAiDemo(email = 'camowner@example.com', password = 'change_me', createCamera = false) {
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!normalizedEmail || !password || password.length < 6) {
    console.error('Usage: node src/admin-cli.js ensure-ai-demo [email] [password] [--camera]');
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  if (!user) {
    const id = uuid();
    db.prepare(`INSERT INTO users (id, name, email, password_hash) VALUES (?,?,?,?)`)
      .run(id, 'AI Camera Owner', normalizedEmail, bcrypt.hashSync(password, 10));
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    console.log(`Created AI demo account: ${normalizedEmail}`);
  } else {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), user.id);
    console.log(`Updated password for AI demo account: ${normalizedEmail}`);
  }

  if (createCamera) {
    const existing = db.prepare(`SELECT * FROM cameras WHERE owner_id = ? AND stream_url = 'webcam:0'`).get(user.id);
    if (existing) {
      console.log(`Demo webcam camera already exists: ${existing.id}`);
    } else {
      const cameraId = uuid();
      db.prepare(
        `INSERT INTO cameras (id, owner_id, name, address, placement, direction, coverage_notes, owner_name, owner_phone, terms_accepted, terms_accepted_at, status, stream_url)
         VALUES (?,?,?,?,?,?,?,?,?,1, datetime('now'), 'active', ?)`
      ).run(cameraId, user.id, 'Local Demo Webcam', 'Local machine', 'indoor', 'Laptop webcam', 'Local AI service demo stream', user.name, user.phone, 'webcam:0');
      console.log(`Created demo webcam camera: ${cameraId}`);
    }
  }

  console.log('Use these values in ai-service/.env:');
  console.log(`RESCUEWAVE_EMAIL=${normalizedEmail}`);
  console.log(`RESCUEWAVE_PASSWORD=${password}`);
}

// --- Helper applications -----------------------------------------------------
function listApplications(status = 'pending') {
  const rows = db.prepare('SELECT id, full_name, phone, email, skills, status, created_at FROM helper_applications WHERE status = ? ORDER BY created_at ASC').all(status);
  printTable(rows.map((r) => ({ ...r, skills: JSON.parse(r.skills).join(', ') })));
}

function reviewApplication(id, decision, note) {
  const app = db.prepare('SELECT * FROM helper_applications WHERE id = ?').get(id);
  if (!app) {
    console.error(`No application with id ${id}. Run: node src/admin-cli.js applications`);
    process.exit(1);
  }
  if (app.status !== 'pending') {
    console.error(`Application is already ${app.status}.`);
    process.exit(1);
  }
  const admin = requireAdminAccount();
  db.prepare(`UPDATE helper_applications SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), admin_note = ? WHERE id = ?`)
    .run(decision, admin.id, note || null, id);
  if (decision === 'approved') {
    db.prepare(`UPDATE users SET role = 'helper', helper_verified = 1, helper_skills = ?, helper_status = 'offline' WHERE id = ?`)
      .run(app.skills, app.user_id);
  }
  console.log(`✔ Helper application for ${app.full_name} marked ${decision}.`);
}

// --- Authority applications ---------------------------------------------------
function listAuthorityApplications(status = 'pending') {
  const rows = db.prepare('SELECT id, authority_type, org_name, contact_name, phone, email, status, created_at FROM authority_applications WHERE status = ? ORDER BY created_at ASC').all(status);
  printTable(rows);
}

function reviewAuthorityApplication(id, decision, note) {
  const app = db.prepare('SELECT * FROM authority_applications WHERE id = ?').get(id);
  if (!app) {
    console.error(`No application with id ${id}. Run: node src/admin-cli.js authority-applications`);
    process.exit(1);
  }
  if (app.status !== 'pending') {
    console.error(`Application is already ${app.status}.`);
    process.exit(1);
  }
  const admin = requireAdminAccount();
  db.prepare(`UPDATE authority_applications SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), admin_note = ? WHERE id = ?`)
    .run(decision, admin.id, note || null, id);
  if (decision === 'approved') {
    db.prepare(
      `UPDATE users SET role = 'authority', authority_verified = 1, authority_type = ?, authority_org = ?, authority_lat = ?, authority_lng = ? WHERE id = ?`
    ).run(app.authority_type, app.org_name, app.lat, app.lng, app.user_id);
  }
  console.log(`✔ Authority application for ${app.org_name} marked ${decision}.`);
}

switch (cmd) {
  case 'ensure-ai-demo':
    ensureAiDemo(args[0] || 'camowner@example.com', args[1] || 'change_me', args.includes('--camera'));
    break;
  case 'make-admin':
    makeAdmin(args[0]);
    break;
  case 'list-admins':
    listAdmins();
    break;
  case 'applications':
    listApplications(args[0] || 'pending');
    break;
  case 'approve':
    reviewApplication(args[0], 'approved', args.slice(1).join(' '));
    break;
  case 'reject':
    reviewApplication(args[0], 'rejected', args.slice(1).join(' '));
    break;
  case 'authority-applications':
    listAuthorityApplications(args[0] || 'pending');
    break;
  case 'authority-approve':
    reviewAuthorityApplication(args[0], 'approved', args.slice(1).join(' '));
    break;
  case 'authority-reject':
    reviewAuthorityApplication(args[0], 'rejected', args.slice(1).join(' '));
    break;
  default:
    console.log(`Usage:
  node src/admin-cli.js ensure-ai-demo [email] [password] [--camera]
  node src/admin-cli.js make-admin <email>
  node src/admin-cli.js list-admins
  node src/admin-cli.js applications [pending|approved|rejected]
  node src/admin-cli.js approve <applicationId> [note]
  node src/admin-cli.js reject <applicationId> [note]
  node src/admin-cli.js authority-applications [pending|approved|rejected]
  node src/admin-cli.js authority-approve <applicationId> [note]
  node src/admin-cli.js authority-reject <applicationId> [note]`);
}
