require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { router: authRouter } = require('./routes/auth');
const usersRouter = require('./routes/users');
const pushRouter = require('./routes/push');
const { router: helpersRouter } = require('./routes/helpers');
const { router: authoritiesRouter } = require('./routes/authorities');
const alertsRouter = require('./routes/alerts');
const uploadsRouter = require('./routes/uploads');
const camerasRouter = require('./routes/cameras');
const missingPersonsRouter = require('./routes/missingPersons');
const adminRouter = require('./routes/admin');
const { authedRouter: liveSharesRouter, publicRouter: shareViewerRouter } = require('./routes/liveShares');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim());
app.use(cors({ origin: allowedOrigins.includes('*') ? true : allowedOrigins }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) =>
  res.json({ ok: true, service: 'rescuewave-backend', time: new Date().toISOString() })
);

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/push-tokens', pushRouter);
app.use('/api/helpers', helpersRouter);
app.use('/api/authorities', authoritiesRouter);
app.use('/api/alerts', alertsRouter());
app.use('/api/live-shares', liveSharesRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/cameras', camerasRouter);
app.use('/api/missing-persons', missingPersonsRouter);
app.use('/api/admin', adminRouter);

// Uploaded report evidence (photo/video/voice) — served back from the same
// disk location the uploads route writes to.
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Public, unauthenticated live-location viewer — this is the link an
// emergency contact (who doesn't have the app) opens over SMS, and what a
// reporter's in-app "view responder" screen embeds.
app.use('/share', shareViewerRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`RescueWave backend listening on http://localhost:${PORT}`);
});
