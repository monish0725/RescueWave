const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');

// Real file storage on the backend's own disk — no paid cloud storage
// service configured (S3/Firebase Storage etc weren't available), so this
// is the honest free equivalent: files are saved under backend/uploads/
// and served back via the static route mounted in server.js. Good enough
// for a project at this stage; swapping in real object storage later only
// means changing this one file.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/'];
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB — plenty for a photo, short clip, or voice note
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_PREFIXES.some((p) => file.mimetype.startsWith(p))) cb(null, true);
    else cb(new Error('Only image, video or audio files are allowed'));
  },
});

const router = express.Router();
router.use(requireAuth);

router.post('/', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (expected field name "file")' });
    res.status(201).json({ url: `/uploads/${req.file.filename}`, mimetype: req.file.mimetype, size: req.file.size });
  });
});

module.exports = router;
