import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import { VideoGrid } from '../components/VideoGrid';
import { RoomControls } from '../components/RoomControls';
import { RecordingsList } from '../components/RecordingsList';
import { ThemeToggle } from '../components/ThemeToggle';
import { Toast } from '../components/Toast';
import { useSignaling } from '../hooks/useSignaling';
import { useWebRTC } from '../hooks/useWebRTC';
import { useMediaRecorder } from '../hooks/useMediaRecorder';
import { useToast } from '../hooks/useToast';
import { getRoom, uploadRecording, getRecordingsByRoom } from '../api/client';
import type { Recording } from '../api/client';

export function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { getToken, userId } = useAuth();
  const { user } = useUser();
  const displayName = user?.firstName || user?.username || user?.primaryEmailAddress?.emailAddress || undefined;
  const avatarUrl = user?.imageUrl ?? null;
  const [token, setToken] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [room, setRoom] = useState<{ id: string; name: string; room_code?: string; created_by: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [showRecordings, setShowRecordings] = useState(false);
  const [mediaErrorType, setMediaErrorType] = useState<'media' | 'room' | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const { toast, show: showToast, hide: hideToast } = useToast();

  const requestMedia = useCallback(async () => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setError(null);
    setMediaErrorType(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Your browser does not support camera or microphone access. Please use a modern browser like Chrome or Firefox.');
      setMediaErrorType('media');
      return;
    }

    const videoConstraints: MediaStreamConstraints[] = [
      { video: true, audio: false },
      { video: { facingMode: 'user' }, audio: false },
    ];
    const audioConstraints: MediaStreamConstraints[] = [
      { video: false, audio: true },
    ];

    let videoStream: MediaStream | null = null;
    let audioStream: MediaStream | null = null;
    let videoError: string | null = null;
    let audioError: string | null = null;

    // Try to get video
    for (const c of videoConstraints) {
      try {
        videoStream = await navigator.mediaDevices.getUserMedia(c);
        break;
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        console.warn('getUserMedia (video) failed', c, err.name, err.message);
        if (err.name === 'NotAllowedError') {
          videoError = 'Camera access was denied.';
          break;
        }
        if (err.name === 'NotFoundError') {
          videoError = 'No camera found.';
          break;
        }
        if (err.name === 'NotReadableError') {
          videoError = 'Camera is in use by another application.';
          break;
        }
        if (err.name === 'OverconstrainedError') continue;
        videoError = err.message;
        break;
      }
    }
    if (!videoStream) videoError = videoError || 'Could not access camera.';

    // Try to get audio
    for (const c of audioConstraints) {
      try {
        audioStream = await navigator.mediaDevices.getUserMedia(c);
        break;
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        console.warn('getUserMedia (audio) failed', c, err.name, err.message);
        if (err.name === 'NotAllowedError') {
          audioError = 'Microphone access was denied.';
          break;
        }
        if (err.name === 'NotFoundError') {
          audioError = 'No microphone found.';
          break;
        }
        if (err.name === 'NotReadableError') {
          audioError = 'Microphone is in use by another application.';
          break;
        }
        if (err.name === 'OverconstrainedError') continue;
        audioError = err.message;
        break;
      }
    }
    if (!audioStream) audioError = audioError || 'Could not access microphone.';

    // Both failed — block and show error
    if (!videoStream && !audioStream) {
      const parts: string[] = [];
      if (videoError) parts.push(`Camera: ${videoError}`);
      if (audioError) parts.push(`Microphone: ${audioError}`);
      setError(`Both camera and microphone are unavailable. ${parts.join(' ')} Connect at least one device to join.`);
      setMediaErrorType('media');
      return;
    }

    // At least one works — combine streams and proceed
    const combined = new MediaStream();
    videoStream?.getVideoTracks().forEach((t) => combined.addTrack(t));
    audioStream?.getAudioTracks().forEach((t) => combined.addTrack(t));
    mediaStreamRef.current = combined;
    setLocalStream(combined);

    // Reflect video-off state when no camera
    if (!videoStream) setIsVideoOff(true);

    // Notify which device is missing
    if (!videoStream && audioStream) {
      showToast(`Camera unavailable: ${videoError} You can join with audio only.`, 'info');
    } else if (videoStream && !audioStream) {
      showToast(`Microphone unavailable: ${audioError} You can join with video only.`, 'info');
    }
  }, [showToast]);

  useEffect(() => {
    requestMedia();
    return () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    };
  }, [requestMedia]);

  const fetchRecordings = useCallback(async () => {
    if (!roomId || !token) return;
    setRecordingsLoading(true);
    try {
      const list = await getRecordingsByRoom(roomId, token);
      setRecordings(list);
    } catch {
      // Ignore
    } finally {
      setRecordingsLoading(false);
    }
  }, [roomId, token]);

  useEffect(() => {
    getToken().then(setToken);
  }, [getToken]);

  const signaling = useSignaling(token);

  const peerStreams = useWebRTC(
    localStream,
    signaling.participants,
    signaling.socketId,
    signaling
  );

  const handleRecordingComplete = useCallback(
    async (blob: Blob, durationMs: number, startedAt: Date, endedAt: Date) => {
      console.log('Recording complete:', { size: blob.size, durationMs, type: blob.type });

      if (blob.size === 0) {
        showToast('Recording too short or no data captured. Try recording a bit longer.', 'error');
        return;
      }

      const t = await getToken();
      if (!t) {
        showToast('Authentication expired. Please refresh and try again.', 'error');
        return;
      }
      if (!roomId) {
        showToast('Room not found. Cannot upload recording.', 'error');
        return;
      }

      const durationSec = Math.max(1, Math.round(durationMs / 1000));
      showToast('Uploading recording...', 'info');

      const attempt = async (retries = 2): Promise<void> => {
        try {
          await uploadRecording(blob, roomId, durationSec, startedAt, endedAt, t);
          showToast('Recording uploaded successfully!', 'success');
          fetchRecordings();
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          console.error('Recording upload failed:', msg, `(retries left: ${retries})`);
          if (retries > 0) {
            await attempt(retries - 1);
          } else {
            showToast(`Upload failed: ${msg}`, 'error');
          }
        }
      };
      await attempt();
    },
    [getToken, roomId, showToast, fetchRecordings]
  );

  const recorder = useMediaRecorder(localStream, handleRecordingComplete);

  useEffect(() => {
    if (!roomId || !token) return;
    getRoom(roomId, token)
      .then((r) => {
        if (!r) {
          setError('Room not found');
          setMediaErrorType('room');
        } else {
          setRoom(r);
        }
      })
      .catch(() => {
        setError('Could not load room. Please check your connection and try again.');
        setMediaErrorType('room');
      });
  }, [roomId, token]);


  useEffect(() => {
    if (!roomId || !signaling.socket || !room) return;
    signaling.joinRoom(roomId, displayName);
    return () => signaling.leaveRoom();
  }, [roomId, signaling.socket, displayName, room?.id]);

  useEffect(() => {
    if (signaling.status === 'rejected') {
      showToast('Your request to join was declined', 'error');
      setTimeout(() => navigate('/'), 2000);
    }
    if (signaling.status === 'kicked') {
      showToast('You were removed from the meeting', 'error');
      setTimeout(() => navigate('/'), 2000);
    }
    if (signaling.status === 'room-deleted') {
      showToast('The host ended and deleted this meeting', 'error');
      localStream?.getTracks().forEach((t) => t.stop());
      setTimeout(() => navigate('/'), 2500);
    }
  }, [signaling.status, showToast, navigate, localStream]);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  useEffect(() => {
    signaling.onRecordingUploaded(() => {
      fetchRecordings();
    });
  }, [signaling.onRecordingUploaded, fetchRecordings]);

  const leaveRoom = useCallback(() => {
    localStream?.getTracks().forEach((t) => t.stop());
    signaling.leaveRoom();
    navigate('/');
  }, [localStream, signaling, navigate]);

  const toggleMute = useCallback(() => {
    localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsMuted((m) => !m);
  }, [localStream]);

  const toggleVideo = useCallback(() => {
    localStream?.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsVideoOff((v) => !v);
  }, [localStream]);

  /* ─── Error screen ─── */
  if (error) {
    return (
      <div className="h-screen bg-surface-900 flex items-center justify-center text-primary">
        <div className="text-center p-8 bg-surface-800 rounded-2xl border border-surface-border max-w-md">
          <p className="text-red-400 mb-6">{error}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {mediaErrorType === 'media' && (
              <button
                type="button"
                onClick={() => requestMedia()}
                className="px-6 py-3 rounded-xl bg-brand hover:bg-brand-light text-white text-sm font-medium transition-colors"
              >
                Try again
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/')}
              className="px-6 py-3 rounded-xl bg-surface-700 hover:bg-surface-600 text-primary text-sm transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Waiting for host ─── */
  if (signaling.status === 'waiting') {
    return (
      <div className="h-screen bg-surface-900 flex items-center justify-center text-primary">
        <div className="text-center p-8 bg-surface-800 backdrop-blur rounded-2xl border border-surface-border max-w-md shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-brand/20 flex items-center justify-center mx-auto mb-6 animate-pulse">
            <svg className="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-primary mb-2 font-heading">Waiting for host</h2>
          <p className="text-muted text-sm mb-6">
            The meeting host will admit you shortly. Please wait...
          </p>
          <button
            type="button"
            onClick={() => {
              signaling.leaveRoom();
              navigate('/');
            }}
            className="px-6 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-primary text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const isMediaLoading = !localStream && !error;
  const isRoomOwner = room?.created_by === userId;

  return (
    <div className="h-screen bg-surface-900 text-primary flex flex-col overflow-hidden">
      {/* Loading overlay */}
      {isMediaLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/95 backdrop-blur">
          <div className="text-center">
            <div className="w-14 h-14 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-secondary">Requesting camera and microphone access...</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between gap-4 px-5 py-3 bg-surface-800 border-b border-surface-border shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-brand font-bold text-sm tracking-wide font-heading">DulfiTech</span>
          <span className="text-surface-400">|</span>
          <h1 className="text-sm font-semibold truncate font-heading text-primary">{room?.name || 'Meeting'}</h1>
          {room?.room_code && (
            <span className="px-2 py-0.5 rounded-md bg-surface-700 text-muted font-mono text-xs">
              {room.room_code}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => {
              const url = window.location.href;
              navigator.clipboard.writeText(url).then(() => showToast('Link copied', 'success'));
            }}
            className="px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-primary text-xs flex items-center gap-1.5 transition-colors"
            title="Copy invite link"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy Link
          </button>
          <span
            className={`text-xs px-2 py-1 rounded-md ${
              signaling.connected ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'
            }`}
          >
            {signaling.connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </header>

      {/* Pending requests banner */}
      {signaling.status === 'joined' && isRoomOwner && signaling.pendingRequests.length > 0 && (
        <div className="mx-4 mt-3 p-3 bg-amber-900/30 border border-amber-700/50 rounded-xl shrink-0">
          <h3 className="text-xs font-semibold text-amber-200 mb-2 font-heading">People waiting to join</h3>
          <div className="space-y-1.5">
            {signaling.pendingRequests.map((p) => (
              <div key={p.socketId} className="flex items-center justify-between gap-4 py-1.5">
                <span className="text-secondary text-sm truncate">{p.displayName || p.userId}</span>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => signaling.acceptJoin(p.socketId)}
                    className="px-3 py-1 rounded-lg bg-brand hover:bg-brand-light text-white text-xs transition-colors"
                  >
                    Admit
                  </button>
                  <button
                    type="button"
                    onClick={() => signaling.rejectJoin(p.socketId)}
                    className="px-3 py-1 rounded-lg bg-surface-600 hover:bg-surface-500 text-white text-xs transition-colors"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main video area — fills remaining space */}
      <main className="flex-1 min-h-0 relative overflow-hidden">
        {/* Recordings side panel — toggled */}
        {showRecordings && (
          <div className="absolute top-3 right-3 z-20 w-60">
            <RecordingsList
              recordings={recordings}
              loading={recordingsLoading}
              onRefresh={fetchRecordings}
              token={token}
              onClose={() => setShowRecordings(false)}
            />
          </div>
        )}
        <VideoGrid
          localStream={localStream}
          peerStreams={peerStreams}
          currentDisplayName={displayName}
          currentUserId={userId ?? 'You'}
          currentAvatarUrl={avatarUrl}
          isVideoOff={isVideoOff}
          roomCreatedBy={room?.created_by}
          onKick={isRoomOwner ? signaling.kickUser : undefined}
        />
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      {/* Controls bar — stays at bottom */}
      <footer className="py-3 px-4 flex justify-center bg-surface-800 border-t border-surface-border shrink-0">
        <RoomControls
          isRecording={recorder.isRecording}
          isMuted={isMuted}
          isVideoOff={isVideoOff}
          hasMicrophone={!!localStream?.getAudioTracks().length}
          hasCamera={!!localStream?.getVideoTracks().length}
          onMuteToggle={toggleMute}
          onVideoToggle={toggleVideo}
          onRecordStart={recorder.startRecording}
          onRecordStop={recorder.stopRecording}
          onLeave={leaveRoom}
          showRecordings={showRecordings}
          onToggleRecordings={() => setShowRecordings((v) => !v)}
          recordingsCount={recordings.length}
        />
      </footer>
    </div>
  );
}
