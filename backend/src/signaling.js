/**
 * WebSocket Signaling Server for Video Conference Application
 * 
 * This module handles real-time communication for video conferencing using Socket.IO.
 * It manages:
 * - User authentication via Clerk
 * - Room joining with a lobby/approval system
 * - WebRTC signaling (offers, answers, ICE candidates)
 * - User management (kicking, accepting/rejecting join requests)
 * - Participant tracking and presence
 */

import { Server } from 'socket.io';
import { verifyToken } from '@clerk/backend';
import { getRoom } from './db/index.js';

/**
 * Lobby Map: Stores pending join requests for rooms
 * 
 * Structure: Map<roomId, Array<{socketId, userId, displayName}>>
 * 
 * When a non-owner user tries to join a room, they are added to the lobby
 * and must wait for the room owner to approve their request.
 */
const lobby = new Map();

/**
 * Extracts authentication token from socket handshake
 * 
 * Checks multiple possible locations for the token:
 * 1. auth.token (direct token property)
 * 2. auth.Authorization header (Bearer token format)
 * 
 * @param {Socket} socket - Socket.IO socket instance
 * @returns {string|null} - The authentication token or null if not found
 */
function getToken(socket) {
  const auth = socket.handshake.auth;
  return auth?.token ?? auth?.Authorization?.replace?.(/^Bearer\s+/i, '') ?? null;
}

/**
 * Adds a user to the lobby (waiting room) for a specific room
 * 
 * Users are added to the lobby when they request to join a room but are not the owner.
 * The room owner will receive a notification and can approve or reject the request.
 * 
 * @param {string} roomId - The ID of the room
 * @param {string} socketId - The socket ID of the requesting user
 * @param {string} userId - The Clerk user ID
 * @param {string|null} displayName - Optional display name for the user
 */
function addToLobby(roomId, socketId, userId, displayName) {
  // Initialize lobby array for room if it doesn't exist
  if (!lobby.has(roomId)) lobby.set(roomId, []);
  const list = lobby.get(roomId);
  // Prevent duplicate entries
  if (list.some((p) => p.socketId === socketId)) return;
  // Add user to lobby
  list.push({ socketId, userId, displayName });
}

/**
 * Removes a user from the lobby for a specific room
 * 
 * Called when:
 * - User's join request is accepted or rejected
 * - User disconnects while in lobby
 * - User is manually removed
 * 
 * Also cleans up empty lobby entries to prevent memory leaks.
 * 
 * @param {string} roomId - The ID of the room
 * @param {string} socketId - The socket ID to remove
 */
function removeFromLobby(roomId, socketId) {
  const list = lobby.get(roomId);
  if (!list) return;
  // Find and remove the user from the lobby
  const idx = list.findIndex((p) => p.socketId === socketId);
  if (idx >= 0) list.splice(idx, 1);
  // Clean up empty lobby entries
  if (list.length === 0) lobby.delete(roomId);
}

/**
 * Retrieves all pending join requests for a specific room
 * 
 * @param {string} roomId - The ID of the room
 * @returns {Array} - Array of pending user objects {socketId, userId, displayName}
 */
function getPendingForRoom(roomId) {
  return lobby.get(roomId) || [];
}

/**
 * Sets up and configures the Socket.IO signaling server
 * 
 * This function initializes the WebSocket server, sets up authentication middleware,
 * and registers all event handlers for room management and WebRTC signaling.
 * 
 * @param {http.Server} httpServer - HTTP server instance to attach Socket.IO to
 * @returns {Server} - Configured Socket.IO server instance
 */
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

  /**
   * Authentication Middleware
   * 
   * Runs before each socket connection is established.
   * Verifies the JWT token using Clerk's verification service.
   * If valid, attaches the userId to the socket for later use.
   * If invalid, rejects the connection.
   */
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

  /**
   * Connection Event Handler
   * 
   * Fired when a new client successfully connects (after authentication).
   * Registers all event listeners for this specific socket connection.
   */
  io.on('connection', (socket) => {
    /**
     * Join Room Event
     * 
     * Handles room joining logic with two different paths:
     * 1. Room Owner: Immediately joins the room and receives any pending requests
     * 2. Regular User: Added to lobby and must wait for owner approval
     * 
     * @param {string} roomId - The ID of the room to join
     * @param {string} displayName - Optional display name for the user
     */
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

    /**
     * Accept Join Request Event
     * 
     * Allows the room owner to approve a pending join request.
     * When accepted, the requesting user is moved from lobby to the room.
     * 
     * Security: Only the room owner can accept join requests.
     * 
     * @param {string} requestingSocketId - Socket ID of the user requesting to join
     */
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

    /**
     * Reject Join Request Event
     * 
     * Allows the room owner to reject a pending join request.
     * The requesting user is removed from the lobby and notified.
     * 
     * Security: Only the room owner can reject join requests.
     * 
     * @param {string} requestingSocketId - Socket ID of the user to reject
     */
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

    /**
     * Kick User Event
     * 
     * Allows the room owner to forcibly remove a user from the room.
     * The kicked user is disconnected from the room and notified.
     * 
     * Security: Only the room owner can kick users.
     * 
     * @param {string} targetSocketId - Socket ID of the user to kick
     */
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

    /**
     * Get Pending Requests Event
     * 
     * Returns all pending join requests for the current room.
     * Used by room owners to see who is waiting to join.
     * 
     * @param {Function} cb - Callback function to return the pending requests array
     */
    socket.on('get-pending-requests', (cb) => {
      const roomId = socket.roomId;
      if (!roomId) return cb?.([]);
      cb?.(getPendingForRoom(roomId));
    });

    /**
     * WebRTC Offer Event
     * 
     * Forwards WebRTC offer SDP (Session Description Protocol) from one peer to another.
     * This is part of the WebRTC signaling process to establish peer-to-peer connections.
     * 
     * @param {Object} data - Offer data
     * @param {string} data.to - Socket ID of the target peer
     * @param {RTCSessionDescriptionInit} data.sdp - SDP offer object
     */
    socket.on('offer', ({ to, sdp }) => {
      if (to) io.to(to).emit('offer', { from: socket.id, sdp });
    });

    /**
     * WebRTC Answer Event
     * 
     * Forwards WebRTC answer SDP from one peer to another.
     * Sent in response to an offer to complete the WebRTC handshake.
     * 
     * @param {Object} data - Answer data
     * @param {string} data.to - Socket ID of the target peer
     * @param {RTCSessionDescriptionInit} data.sdp - SDP answer object
     */
    socket.on('answer', ({ to, sdp }) => {
      if (to) io.to(to).emit('answer', { from: socket.id, sdp });
    });

    /**
     * ICE Candidate Event
     * 
     * Forwards ICE (Interactive Connectivity Establishment) candidates between peers.
     * ICE candidates are used to establish the best network path for peer-to-peer communication,
     * handling NAT traversal and firewall issues.
     * 
     * @param {Object} data - ICE candidate data
     * @param {string} data.to - Socket ID of the target peer
     * @param {RTCIceCandidateInit} data.candidate - ICE candidate object
     */
    socket.on('ice-candidate', ({ to, candidate }) => {
      if (to) io.to(to).emit('ice-candidate', { from: socket.id, candidate });
    });

    /**
     * Get Participants Event
     * 
     * Returns a list of all participants currently in a room.
     * Used to discover other users in the room for establishing WebRTC connections.
     * 
     * @param {string} roomId - The ID of the room to get participants from
     * @param {Function} cb - Callback function to return the participants array
     */
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

    /**
     * Disconnect Event
     * 
     * Handles cleanup when a socket disconnects:
     * - Removes user from lobby if they were waiting
     * - Notifies room participants that user left
     * 
     * This ensures the room state stays consistent when users disconnect unexpectedly.
     */
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