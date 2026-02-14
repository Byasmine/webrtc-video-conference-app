-- Users: linked to Clerk userId
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rooms
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  room_code TEXT UNIQUE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: add room_code to existing rooms (runs first for old DBs)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_room_code ON rooms(room_code) WHERE room_code IS NOT NULL;

-- Recordings metadata
CREATE TABLE IF NOT EXISTS recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(clerk_user_id),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recordings_room ON recordings(room_id);
CREATE INDEX IF NOT EXISTS idx_recordings_user ON recordings(user_id);
