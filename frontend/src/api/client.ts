const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export async function apiFetch(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<Response> {
  const { token, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (fetchOptions.body && typeof fetchOptions.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${API_URL}${path}`, { ...fetchOptions, headers });
}

export async function apiUpload(
  path: string,
  formData: FormData,
  token: string
): Promise<Response> {
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });
}

export type Room = {
  id: string;
  name: string;
  room_code?: string;
  created_by: string;
  created_at: string;
};

export type Recording = {
  id: string;
  user_id: string;
  room_id: string;
  file_path: string;
  duration_seconds: number;
  started_at: string;
  ended_at: string;
  created_at: string;
};

export async function listRooms(token: string): Promise<Room[]> {
  const res = await apiFetch('/api/rooms', { token });
  if (!res.ok) throw new Error('Failed to list rooms');
  return res.json();
}

export async function createRoom(name: string, token: string): Promise<Room> {
  const res = await apiFetch('/api/rooms', {
    method: 'POST',
    token,
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to create room');
  return res.json();
}

export async function getRoom(roomId: string, token: string): Promise<Room | null> {
  const res = await apiFetch(`/api/rooms/${roomId}`, { token });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to get room');
  return res.json();
}

export async function getRoomByCode(code: string, token: string): Promise<Room | null> {
  const res = await apiFetch(`/api/rooms/by-code/${encodeURIComponent(code.trim())}`, { token });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to get room');
  return res.json();
}

export async function deleteRoom(roomId: string, token: string): Promise<void> {
  const res = await apiFetch(`/api/rooms/${roomId}`, { method: 'DELETE', token });
  if (res.status === 404) throw new Error('Room not found');
  if (!res.ok) throw new Error('Failed to delete room');
}

export async function getRecordingsByRoom(roomId: string, token: string): Promise<Recording[]> {
  const res = await apiFetch(`/api/recordings/room/${roomId}`, { token });
  if (!res.ok) throw new Error('Failed to fetch recordings');
  return res.json();
}

export function getRecordingFileUrl(recordingId: string, token?: string): string {
  const base = `${API_URL}/api/recordings/${recordingId}/file`;
  if (token) return `${base}?token=${encodeURIComponent(token)}`;
  return base;
}

/** Fetch the recording file with auth and return a blob URL for playback/download */
export async function fetchRecordingBlob(recordingId: string, token: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/recordings/${recordingId}/file`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch recording file');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function uploadRecording(
  file: Blob,
  roomId: string,
  durationSeconds: number,
  startedAt: Date,
  endedAt: Date,
  token: string
): Promise<Recording> {
  const formData = new FormData();
  // IMPORTANT: text fields MUST be appended BEFORE the file so multer can
  // read req.body.roomId inside its `filename` callback.
  formData.append('roomId', roomId);
  formData.append('durationSeconds', String(durationSeconds));
  formData.append('startedAt', startedAt.toISOString());
  formData.append('endedAt', endedAt.toISOString());

  const ext = file.type?.includes('mp4') ? '.mp4' : '.webm';
  formData.append('recording', file, `recording${ext}`);

  const res = await apiUpload('/api/recordings/upload', formData, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to upload recording');
  }
  return res.json();
}
