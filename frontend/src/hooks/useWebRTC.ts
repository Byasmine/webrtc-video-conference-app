import { useEffect, useRef, useState, useCallback } from 'react';
import type { Participant } from './useSignaling';

export type PeerStream = {
  socketId: string;
  userId: string;
  displayName?: string | null;
  stream: MediaStream;
  connectionState?: RTCPeerConnectionState;
};

const ICE_SERVERS: RTCConfiguration['iceServers'] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

export function useWebRTC(
  localStream: MediaStream | null,
  participants: Participant[],
  socketId: string | null,
  signaling: {
    sendOffer: (to: string, sdp: RTCSessionDescriptionInit) => void;
    sendAnswer: (to: string, sdp: RTCSessionDescriptionInit) => void;
    sendIceCandidate: (to: string, candidate: RTCIceCandidateInit) => void;
    onOffer: (handler: (from: string, sdp: RTCSessionDescriptionInit) => void) => void;
    onAnswer: (handler: (from: string, sdp: RTCSessionDescriptionInit) => void) => void;
    onIceCandidate: (handler: (from: string, candidate: RTCIceCandidateInit) => void) => void;
  }
) {
  const [peerStreams, setPeerStreams] = useState<PeerStream[]>([]);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const setupRef = useRef(false);

  localStreamRef.current = localStream;

  const removePeer = useCallback((socketIdToRemove: string) => {
    const pc = peersRef.current.get(socketIdToRemove);
    if (pc) {
      pc.close();
      peersRef.current.delete(socketIdToRemove);
    }
    setPeerStreams((prev) => prev.filter((p) => p.socketId !== socketIdToRemove));
  }, []);

  const createPeer = useCallback(
    async (
      remoteSocketId: string,
      userId: string,
      displayName: string | null | undefined,
      initiator: boolean
    ): Promise<RTCPeerConnection> => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current!));
      }

      pc.ontrack = (e) => {
        const stream = e.streams[0];
        if (stream) {
          setPeerStreams((prev) => {
            const filtered = prev.filter((p) => p.socketId !== remoteSocketId);
            return [...filtered, { socketId: remoteSocketId, userId, displayName, stream, connectionState: pc.connectionState }];
          });
        }
      };

      pc.onconnectionstatechange = () => {
        setPeerStreams((prev) =>
          prev.map((p) =>
            p.socketId === remoteSocketId ? { ...p, connectionState: pc.connectionState } : p
          )
        );
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          removePeer(remoteSocketId);
        }
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) signaling.sendIceCandidate(remoteSocketId, e.candidate);
      };

      peersRef.current.set(remoteSocketId, pc);

      if (initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        signaling.sendOffer(remoteSocketId, offer);
      }

      return pc;
    },
    [signaling.sendOffer, signaling.sendIceCandidate, removePeer]
  );

  useEffect(() => {
    if (!socketId || !localStream) return;

    const others = participants.filter((p) => p.socketId !== socketId);
    others.forEach(async (p) => {
      if (peersRef.current.has(p.socketId)) return;
      await createPeer(p.socketId, p.userId, p.displayName, true);
    });
  }, [participants, socketId, localStream, createPeer]);

  useEffect(() => {
    if (!socketId) return;

    signaling.onOffer(async (from, sdp) => {
      if (peersRef.current.has(from)) return;
      const p = participants.find((x) => x.socketId === from);
      const pc = await createPeer(from, p?.userId ?? 'unknown', p?.displayName, false);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signaling.sendAnswer(from, answer);
    });

    signaling.onAnswer(async (from, sdp) => {
      const pc = peersRef.current.get(from);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    });

    signaling.onIceCandidate(async (from, candidate) => {
      const pc = peersRef.current.get(from);
      if (pc && candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
    });
  }, [socketId, signaling, createPeer, participants]);

  useEffect(() => {
    if (setupRef.current) return;
    setupRef.current = true;

    return () => {
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      setPeerStreams([]);
    };
  }, []);

  return peerStreams;
}
