import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupClerk } from './auth.js';
import { initDb } from './db/index.js';
import roomsRouter from './routes/rooms.js';
import recordingsRouter from './routes/recordings.js';
import { setupSignaling } from './signaling.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '5000', 10);

const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: process.env.FRONTEND_URL || true, credentials: true }));
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
});
app.use('/api', apiLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

setupClerk(app);

const io = setupSignaling(httpServer);
app.set('io', io);

app.use('/api/rooms', roomsRouter);
app.use('/api/recordings', recordingsRouter);

async function start() {
  try {
    await initDb();
  } catch (e) {
    console.error('DB init error:', e);
  }
  httpServer.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
  });
}

start().catch(console.error);
