import { Server } from 'socket.io';
import { verifyToken } from '@clerk/backend';
import { getRoom } from './db/index.js';

const lobby = new Map();

function getToken(socket) {
  const auth = socket.handshake.auth;
  return auth?.token ?? auth?.Authorization?.replace?.(/^Bearer\s+/i, '') ?? null;
}

function addToLobby(roomId, socketId, userId, displayName) {
  if (!lobby.has(roomId)) lobby.set(roomId, []);
  const list = lobby.get(roomId);
  if (list.some((p) => p.socketId === socketId)) return;
  list.push({ socketId, userId, displayName });
}

function removeFromLobby(roomId, socketId) {
  const list = lobby.get(roomId);
  if (!list) return;
  const idx = list.findIndex((p) => p.socketId === socketId);
  if (idx >= 0) list.splice(idx, 1);
  if (list.length === 0) lobby.delete(roomId);
}

function getPendingForRoom(roomId) {
  return lobby.get(roomId) || [];
}

export function setupSignaling(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || '*',
      methods: ['GET', 'POST'],
    },
  });

  io.use(async (socket, next) => {
    const token = getToken(socket);
    if (!token) return next(new Error('Authentication required'));
    try {
      const verified = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });
      socket.userId = verified.sub;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('join-room', async (roomId, displayName) => {
      if (!roomId) return;
      socket.displayName = typeof displayName === 'string' ? displayName : null;

      try {
        const room = await getRoom(roomId);
        if (!room) {
          socket.emit('join-error', { message: 'Room not found' });
          return;
        }

        const isOwner = socket.userId === room.created_by;

        if (isOwner) {
          socket.join(roomId);
          socket.roomId = roomId;
          socket.to(roomId).emit('user-joined', {
            userId: socket.userId,
            socketId: socket.id,
            displayName: socket.displayName,
          });
          socket.emit('room-joined', { roomId, isOwner: true });
          const pending = getPendingForRoom(roomId);
          if (pending.length > 0) socket.emit('pending-requests', pending);
        } else {
          addToLobby(roomId, socket.id, socket.userId, socket.displayName);
          const roomSet = io.sockets.adapter.rooms.get(roomId);
          if (roomSet) {
            for (const sid of roomSet) {
              const s = io.sockets.sockets.get(sid);
              if (s?.userId === room.created_by) {
                s.emit('pending-join-request', {
                  socketId: socket.id,
                  userId: socket.userId,
                  displayName: socket.displayName,
                });
                break;
              }
            }
          }
          socket.emit('waiting-for-host');
        }
      } catch (err) {
        socket.emit('join-error', { message: 'Failed to join room' });
      }
    });

    socket.on('accept-join', async (requestingSocketId) => {
      const roomId = socket.roomId;
      if (!roomId) return;
      const room = await getRoom(roomId);
      if (!room || room.created_by !== socket.userId) return;

      const list = lobby.get(roomId);
      const pending = list?.find((p) => p.socketId === requestingSocketId);
      if (!pending) return;

      const targetSocket = io.sockets.sockets.get(requestingSocketId);
      if (!targetSocket) {
        removeFromLobby(roomId, requestingSocketId);
        return;
      }

      removeFromLobby(roomId, requestingSocketId);
      targetSocket.displayName = pending.displayName;
      targetSocket.join(roomId);
      targetSocket.roomId = roomId;

      socket.to(roomId).emit('user-joined', {
        userId: pending.userId,
        socketId: targetSocket.id,
        displayName: pending.displayName,
      });
      targetSocket.emit('room-joined', { roomId, isOwner: false });
    });

    socket.on('reject-join', async (requestingSocketId) => {
      const roomId = socket.roomId;
      if (!roomId) return;
      const room = await getRoom(roomId);
      if (!room || room.created_by !== socket.userId) return;

      removeFromLobby(roomId, requestingSocketId);
      io.to(requestingSocketId).emit('join-rejected');
    });

    socket.on('kick-user', async (targetSocketId) => {
      const roomId = socket.roomId;
      if (!roomId) return;
      const room = await getRoom(roomId);
      if (!room || room.created_by !== socket.userId) return;

      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket && targetSocket.roomId === roomId) {
        targetSocket.leave(roomId);
        targetSocket.roomId = null;
        targetSocket.emit('you-were-kicked');
        socket.to(roomId).emit('user-left', {
          userId: targetSocket.userId,
          socketId: targetSocket.id,
          displayName: targetSocket.displayName,
        });
      }
    });

    socket.on('get-pending-requests', (cb) => {
      const roomId = socket.roomId;
      if (!roomId) return cb?.([]);
      cb?.(getPendingForRoom(roomId));
    });

    socket.on('offer', ({ to, sdp }) => {
      if (to) io.to(to).emit('offer', { from: socket.id, sdp });
    });

    socket.on('answer', ({ to, sdp }) => {
      if (to) io.to(to).emit('answer', { from: socket.id, sdp });
    });

    socket.on('ice-candidate', ({ to, candidate }) => {
      if (to) io.to(to).emit('ice-candidate', { from: socket.id, candidate });
    });

    socket.on('get-participants', (roomId, cb) => {
      const room = roomId ? io.sockets.adapter.rooms.get(roomId) : null;
      if (!room) return cb?.([]);
      const participants = [];
      for (const sid of room) {
        const s = io.sockets.sockets.get(sid);
        if (s?.userId)
          participants.push({
            socketId: s.id,
            userId: s.userId,
            displayName: s.displayName ?? null,
          });
      }
      cb?.(participants);
    });

    socket.on('disconnect', () => {
      removeFromLobby(socket.roomId, socket.id);
      if (socket.roomId) {
        socket.to(socket.roomId).emit('user-left', {
          userId: socket.userId,
          socketId: socket.id,
          displayName: socket.displayName,
        });
      }
    });
  });

  return io;
}
