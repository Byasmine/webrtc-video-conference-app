import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { createRecording, getRecordingById, getRecordingsByRoom, getRecordingsByUser, getRoom, ensureUser } from '../db/index.js';
import { requireAuth, getUserId } from '../auth.js';

const router = Router();
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

// Ensure upload directory exists (multer won't create it)
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const MAX_FILE_SIZE = 500 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const userId = getUserId(req);
    const roomId = req.body.roomId || 'unknown';
    const ext = path.extname(file.originalname) || '.webm';
    const safeExt = ['.webm', '.mp4'].includes(ext.toLowerCase()) ? ext : '.webm';
    const name = `${roomId}_${userId}_${Date.now()}${safeExt}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const mt = (file.mimetype || '').toLowerCase();
    const origName = (file.originalname || '').toLowerCase();
    console.log('Upload file filter:', { mimetype: mt, originalname: origName });

    // Accept video MIME types, application/octet-stream (common for Blob uploads),
    // and known recording file extensions
    const isVideo = mt.startsWith('video/');
    const isOctetStream = mt === 'application/octet-stream' || mt === '';
    const hasVideoExt = origName.endsWith('.webm') || origName.endsWith('.mp4');

    if (isVideo || isOctetStream || hasVideoExt) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type "${mt}". Only video (webm/mp4) are allowed.`));
    }
  },
});

router.use(requireAuth());

router.post('/upload', (req, res, next) => {
  upload.single('recording')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err.code, err.message);
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Max 500MB.' });
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    if (err) {
      console.error('Upload error:', err.message);
      return res.status(400).json({ error: err.message || 'Invalid file' });
    }
    next();
  });
}, async (req, res) => {
  const userId = getUserId(req);
  const { roomId, durationSeconds, startedAt, endedAt } = req.body;

  console.log('Recording upload request:', { userId, roomId, durationSeconds, hasFile: !!req.file });

  if (!roomId || durationSeconds == null || !startedAt || !endedAt) {
    return res.status(400).json({
      error: 'roomId, durationSeconds, startedAt, endedAt are required',
    });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No recording file uploaded' });
  }
  try {
    await ensureUser(userId);
    const room = await getRoom(roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const recording = await createRecording({
      userId,
      roomId,
      filePath: req.file.filename,
      durationSeconds: parseInt(durationSeconds, 10),
      startedAt: new Date(startedAt),
      endedAt: new Date(endedAt),
    });

    console.log('Recording saved:', recording.id, 'file:', req.file.filename);

    // Notify all users in the room about the new recording
    const io = req.app.get('io');
    if (io) {
      io.to(roomId).emit('recording-uploaded', recording);
    }

    res.status(201).json(recording);
  } catch (err) {
    console.error('Recording save error:', err);
    res.status(500).json({ error: 'Failed to save recording metadata' });
  }
});

router.get('/:id/file', async (req, res) => {
  const { id } = req.params;
  try {
    const recording = await getRecordingById(id);
    if (!recording) return res.status(404).json({ error: 'Recording not found' });

    const filePath = path.join(uploadDir, recording.file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Recording file not found on disk' });
    }

    const ext = path.extname(recording.file_path).toLowerCase();
    const mimeType = ext === '.mp4' ? 'video/mp4' : 'video/webm';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${recording.file_path}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve recording file' });
  }
});

router.get('/room/:roomId', async (req, res) => {
  const { roomId } = req.params;
  try {
    const room = await getRoom(roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const recordings = await getRecordingsByRoom(roomId);
    res.json(recordings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list recordings' });
  }
});

router.get('/me', async (req, res) => {
  const userId = getUserId(req);
  try {
    const recordings = await getRecordingsByUser(userId);
    res.json(recordings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list recordings' });
  }
});

export default router;
