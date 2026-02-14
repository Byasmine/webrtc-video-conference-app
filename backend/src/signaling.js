import { Server } from 'socket.io';
import { verifyToken } from '@clerk/backend';
import { getRoom } from './db/index.js';

const lobby = new Map();

function getToken(socket) {
  const auth = socket.handshake.auth;
  return auth?.token ?? auth?.Authorization?.replace?.(/^Bearer\s+/i, '') ?? null;
}


function addToLobby(roomId, socketId, userId, displayName) {
  // Initialize lobby array for room if it doesn't exist
  if (!lobby.has(roomId)) lobby.set(roomId, []);
  const list = lobby.get(roomId);
  // Prevent duplicate entries
  if (list.some((p) => p.socketId === socketId)) return;
  // Add user to lobby
  list.push({ socketId, userId, displayName });
}


function removeFromLobby(roomId, socketId) {
  const list = lobby.get(roomId);
  if (!list) return;
  // Find and remove the user from the lobby
  const idx = list.findIndex((p) => p.socketId === socketId);
  if (idx >= 0) list.splice(idx, 1);
  // Clean up empty lobby entries
  if (list.length === 0) lobby.delete(roomId);
}


function getPendingForRoom(roomId) {
  return lobby.get(roomId) || [];
}


export function setupSignaling(httpServer) {
  // Normalize FRONTEND_URL: strip trailing slash (CORS requires exact origin match)
  const frontendOrigin = process.env.FRONTEND_URL?.replace(/\/+$/, '') || '*';

  // Initialize Socket.IO server with CORS configuration
  const io = new Server(httpServer, {
    cors: {
      origin: frontendOrigin, // Allow connections from frontend URL
      methods: ['GET', 'POST'],
    },
  });

 
  io.use(async (socket, next) => {
    const token = getToken(socket);
    if (!token) return next(new Error('Authentication required'));
    try {
      // Verify token with Clerk backend service
      const verified = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });
      // Attach user ID to socket for authorization checks
      socket.userId = verified.sub;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  // Handle socket connections and events
  io.on('connection', (socket) => {
    
    socket.on('join-room', async (roomId, displayName) => {
      if (!roomId) return;
      // Store display name on socket for later use
      socket.displayName = typeof displayName === 'string' ? displayName : null;

      try {
        // Verify room exists in database
        const room = await getRoom(roomId);
        if (!room) {
          socket.emit('join-error', { message: 'Room not found' });
          return;
        }

        // Check if user is the room owner
        const isOwner = socket.userId === room.created_by;

        if (isOwner) {
          // Owner path: immediate join
          socket.join(roomId);
          socket.roomId = roomId;
          // Notify existing participants that owner joined
          socket.to(roomId).emit('user-joined', {
            userId: socket.userId,
            socketId: socket.id,
            displayName: socket.displayName,
          });
          // Confirm join to owner
          socket.emit('room-joined', { roomId, isOwner: true });
          // Send any pending join requests to owner
          const pending = getPendingForRoom(roomId);
          if (pending.length > 0) socket.emit('pending-requests', pending);
        } else {
          // Non-owner path: add to lobby and request approval
          addToLobby(roomId, socket.id, socket.userId, socket.displayName);
          // Find room owner's socket and notify them of the join request
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
          // Notify requesting user they're waiting for approval
          socket.emit('waiting-for-host');
        }
      } catch (err) {
        socket.emit('join-error', { message: 'Failed to join room' });
      }
    });

    socket.on('accept-join', async (requestingSocketId) => {
      const roomId = socket.roomId;
      if (!roomId) return;
      // Verify room exists and user is the owner
      const room = await getRoom(roomId);
      if (!room || room.created_by !== socket.userId) return;

      // Find the pending request in lobby
      const list = lobby.get(roomId);
      const pending = list?.find((p) => p.socketId === requestingSocketId);
      if (!pending) return;

      // Get the requesting user's socket
      const targetSocket = io.sockets.sockets.get(requestingSocketId);
      if (!targetSocket) {
        // Socket disconnected, clean up lobby entry
        removeFromLobby(roomId, requestingSocketId);
        return;
      }

      // Remove from lobby and add to room
      removeFromLobby(roomId, requestingSocketId);
      targetSocket.displayName = pending.displayName;
      targetSocket.join(roomId);
      targetSocket.roomId = roomId;

      // Notify all room participants that user joined
      socket.to(roomId).emit('user-joined', {
        userId: pending.userId,
        socketId: targetSocket.id,
        displayName: pending.displayName,
      });
      // Confirm join to the newly accepted user
      targetSocket.emit('room-joined', { roomId, isOwner: false });
    });

    socket.on('reject-join', async (requestingSocketId) => {
      const roomId = socket.roomId;
      if (!roomId) return;
      // Verify room exists and user is the owner
      const room = await getRoom(roomId);
      if (!room || room.created_by !== socket.userId) return;

      // Remove from lobby and notify user
      removeFromLobby(roomId, requestingSocketId);
      io.to(requestingSocketId).emit('join-rejected');
    });

  
    socket.on('kick-user', async (targetSocketId) => {
      const roomId = socket.roomId;
      if (!roomId) return;
      // Verify room exists and user is the owner
      const room = await getRoom(roomId);
      if (!room || room.created_by !== socket.userId) return;

      // Get target socket and verify they're in the room
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket && targetSocket.roomId === roomId) {
        // Remove from room
        targetSocket.leave(roomId);
        targetSocket.roomId = null;
        // Notify kicked user
        targetSocket.emit('you-were-kicked');
        // Notify remaining participants
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
      // Build participants list from all sockets in the room
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
      // Remove from lobby if they were waiting for approval
      removeFromLobby(socket.roomId, socket.id);
      // If they were in a room, notify other participants
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