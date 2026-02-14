import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:5000';

export type Participant = {
  socketId: string;
  userId: string;
  displayName?: string | null;
};

export type PendingRequest = {
  socketId: string;
  userId: string;
  displayName?: string | null;
};

export function useSignaling(token: string | null) {
  const [socket, setSocket] = useState<ReturnType<typeof io> | null>(null);
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [status, setStatus] = useState<'idle' | 'waiting' | 'joined' | 'rejected' | 'kicked' | 'room-deleted'>('idle');
  const roomIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const s = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on('user-joined', (p: Participant) => {
      setParticipants((prev) => {
        if (prev.some((x) => x.socketId === p.socketId)) return prev;
        return [...prev, p];
      });
    });

    s.on('user-left', (p: { socketId: string }) => {
      setParticipants((prev) => prev.filter((x) => x.socketId !== p.socketId));
    });

    s.on('room-joined', (data: { roomId: string; isOwner?: boolean }) => {
      setStatus('joined');
      roomIdRef.current = data?.roomId;
      if (data?.roomId) {
        s.emit('get-participants', data.roomId, (list: Participant[]) => {
          setParticipants(list ?? []);
        });
        s.emit('get-pending-requests', (list: PendingRequest[]) => {
          setPendingRequests(list ?? []);
        });
      }
    });

    s.on('waiting-for-host', () => setStatus('waiting'));
    s.on('join-rejected', () => setStatus('rejected'));
    s.on('you-were-kicked', () => setStatus('kicked'));
    s.on('join-error', () => setStatus('rejected'));

    s.on('pending-join-request', (p: PendingRequest) => {
      setPendingRequests((prev) => {
        if (prev.some((x) => x.socketId === p.socketId)) return prev;
        return [...prev, p];
      });
    });

    s.on('pending-requests', (list: PendingRequest[]) => {
      setPendingRequests(list ?? []);
    });

    s.on('room-deleted', () => {
      setStatus('room-deleted');
    });

    s.on('recording-uploaded', () => {
      // Handled via onRecordingUploaded callback
    });

    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
      setParticipants([]);
      setPendingRequests([]);
      setStatus('idle');
    };
  }, [token]);

  const joinRoom = useCallback(
    (roomId: string, displayName?: string) => {
      if (!socket) return;
      roomIdRef.current = roomId;
      setStatus('idle');
      socket.emit('join-room', roomId, displayName);
    },
    [socket]
  );

  const leaveRoom = useCallback(() => {
    roomIdRef.current = null;
    setParticipants([]);
    setPendingRequests([]);
    setStatus('idle');
  }, []);

  const acceptJoin = useCallback(
    (socketId: string) => {
      socket?.emit('accept-join', socketId);
      setPendingRequests((prev) => prev.filter((p) => p.socketId !== socketId));
    },
    [socket]
  );

  const rejectJoin = useCallback(
    (socketId: string) => {
      socket?.emit('reject-join', socketId);
      setPendingRequests((prev) => prev.filter((p) => p.socketId !== socketId));
    },
    [socket]
  );

  const kickUser = useCallback(
    (socketId: string) => {
      socket?.emit('kick-user', socketId);
    },
    [socket]
  );

  const refreshPending = useCallback(() => {
    if (socket && roomIdRef.current) {
      socket.emit('get-pending-requests', (list: PendingRequest[]) => {
        setPendingRequests(list ?? []);
      });
    }
  }, [socket]);

  const sendOffer = useCallback(
    (to: string, sdp: RTCSessionDescriptionInit) => {
      socket?.emit('offer', { to, sdp });
    },
    [socket]
  );

  const sendAnswer = useCallback(
    (to: string, sdp: RTCSessionDescriptionInit) => {
      socket?.emit('answer', { to, sdp });
    },
    [socket]
  );

  const sendIceCandidate = useCallback(
    (to: string, candidate: RTCIceCandidateInit) => {
      socket?.emit('ice-candidate', { to, candidate });
    },
    [socket]
  );

  const onOffer = useCallback(
    (handler: (from: string, sdp: RTCSessionDescriptionInit) => void) => {
      socket?.on('offer', ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => handler(from, sdp));
    },
    [socket]
  );

  const onAnswer = useCallback(
    (handler: (from: string, sdp: RTCSessionDescriptionInit) => void) => {
      socket?.on('answer', ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => handler(from, sdp));
    },
    [socket]
  );

  const onIceCandidate = useCallback(
    (handler: (from: string, candidate: RTCIceCandidateInit) => void) => {
      socket?.on('ice-candidate', ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => handler(from, candidate));
    },
    [socket]
  );

  const onRecordingUploaded = useCallback(
    (handler: () => void) => {
      if (!socket) return;
      socket.off('recording-uploaded');
      socket.on('recording-uploaded', handler);
    },
    [socket]
  );

  return {
    socket,
    connected,
    participants,
    pendingRequests,
    status,
    socketId: socket?.id ?? null,
    joinRoom,
    leaveRoom,
    acceptJoin,
    rejectJoin,
    kickUser,
    refreshPending,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    onOffer,
    onAnswer,
    onIceCandidate,
    onRecordingUploaded,
  };
}
