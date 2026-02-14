import { Router } from 'express';
import { createRoom, getRoom, getRoomByCode, listRooms, deleteRoom } from '../db/index.js';
import { requireAuth, getUserId } from '../auth.js';

const router = Router();

// everything in this router requires authentication
router.use(requireAuth());

router.get('/', async (req, res) => {
  try {
    const rooms = await listRooms();
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list rooms' });
  }
});

router.post('/', async (req, res) => {
  const userId = getUserId(req);
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Room name is required' });
  }
  try {
    const room = await createRoom(name.trim(), userId);
    res.status(201).json(room);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

router.get('/by-code/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const room = await getRoomByCode(code);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get room' });
  }
});

router.get('/:roomId', async (req, res) => {
  const { roomId } = req.params;
  try {
    const room = await getRoom(roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get room' });
  }
});

router.delete('/:roomId', async (req, res) => {
  const userId = getUserId(req);
  const { roomId } = req.params;
  try {
    const deleted = await deleteRoom(roomId, userId);
    if (!deleted) return res.status(404).json({ error: 'Room not found or not authorized to delete' });

    // Notify all connected users that the room has been deleted
    const io = req.app.get('io');
    if (io) {
      io.to(roomId).emit('room-deleted', { roomId });
      // Force all sockets to leave the room
      const roomSet = io.sockets.adapter.rooms.get(roomId);
      if (roomSet) {
        for (const sid of roomSet) {
          const s = io.sockets.sockets.get(sid);
          if (s) {
            s.leave(roomId);
            s.roomId = null;
          }
        }
      }
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

export default router;
