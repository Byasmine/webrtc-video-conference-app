import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initDb() {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  await pool.query(schema);
  try {
    const res = await pool.query('SELECT id FROM rooms WHERE room_code IS NULL');
    for (const row of res.rows) {
      let code;
      for (let i = 0; i < 10; i++) {
        code = generateRoomCode();
        try {
          await pool.query('UPDATE rooms SET room_code = $1 WHERE id = $2', [code, row.id]);
          break;
        } catch {
          continue;
        }
      }
    }
  } catch {
    /* column may not exist yet */
  }
}

export async function ensureUser(clerkUserId) {
  const res = await pool.query(
    `INSERT INTO users (clerk_user_id) VALUES ($1)
     ON CONFLICT (clerk_user_id) DO NOTHING
     RETURNING id, clerk_user_id`,
    [clerkUserId]
  );
  if (res.rows.length) return res.rows[0];
  const existing = await pool.query(
    'SELECT id, clerk_user_id FROM users WHERE clerk_user_id = $1',
    [clerkUserId]
  );
  return existing.rows[0];
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function createRoom(name, clerkUserId) {
  await ensureUser(clerkUserId);
  let room;
  for (let attempt = 0; attempt < 10; attempt++) {
    const roomCode = generateRoomCode();
    try {
      const res = await pool.query(
        `INSERT INTO rooms (name, room_code, created_by) VALUES ($1, $2, $3)
         RETURNING id, name, room_code, created_by, created_at`,
        [name, roomCode, clerkUserId]
      );
      room = res.rows[0];
      break;
    } catch (err) {
      if (err.code === '23505') continue;
      throw err;
    }
  }
  if (!room) throw new Error('Could not generate unique room code');
  return room;
}

export async function getRoom(roomId) {
  const res = await pool.query(
    'SELECT id, name, room_code, created_by, created_at FROM rooms WHERE id = $1',
    [roomId]
  );
  return res.rows[0] || null;
}

export async function getRoomByCode(roomCode) {
  const res = await pool.query(
    'SELECT id, name, room_code, created_by, created_at FROM rooms WHERE upper(room_code) = upper($1)',
    [String(roomCode).trim()]
  );
  return res.rows[0] || null;
}

export async function listRooms() {
  const res = await pool.query(
    'SELECT id, name, room_code, created_by, created_at FROM rooms ORDER BY created_at DESC'
  );
  return res.rows;
}

export async function deleteRoom(roomId, clerkUserId) {
  const res = await pool.query(
    'DELETE FROM rooms WHERE id = $1 AND created_by = $2 RETURNING id',
    [roomId, clerkUserId]
  );
  return res.rowCount > 0;
}

export async function createRecording(data) {
  const res = await pool.query(
    `INSERT INTO recordings (user_id, room_id, file_path, duration_seconds, started_at, ended_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, room_id, file_path, duration_seconds, started_at, ended_at, created_at`,
    [
      data.userId,
      data.roomId,
      data.filePath,
      data.durationSeconds,
      data.startedAt,
      data.endedAt,
    ]
  );
  return res.rows[0];
}

export async function getRecordingById(recordingId) {
  const res = await pool.query(
    `SELECT id, user_id, room_id, file_path, duration_seconds, started_at, ended_at, created_at
     FROM recordings WHERE id = $1`,
    [recordingId]
  );
  return res.rows[0] || null;
}

export async function getRecordingsByRoom(roomId) {
  const res = await pool.query(
    `SELECT id, user_id, room_id, file_path, duration_seconds, started_at, ended_at, created_at
     FROM recordings WHERE room_id = $1 ORDER BY created_at DESC`,
    [roomId]
  );
  return res.rows;
}

export async function getRecordingsByUser(clerkUserId) {
  const res = await pool.query(
    `SELECT id, user_id, room_id, file_path, duration_seconds, started_at, ended_at, created_at
     FROM recordings WHERE user_id = $1 ORDER BY created_at DESC`,
    [clerkUserId]
  );
  return res.rows;
}

export { pool };
