import { useRef, useEffect } from 'react';

type ParticipantVideoProps = {
  stream: MediaStream;
  label: string;
  muted?: boolean;
  isLocal?: boolean;
  connectionState?: RTCPeerConnectionState;
  avatarUrl?: string | null;
  showAvatar?: boolean;
  isOwner?: boolean;
  onKick?: () => void;
  canKick?: boolean;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return name.slice(0, 2).toUpperCase() || '?';
}

function getConnectionLabel(state?: RTCPeerConnectionState): string | null {
  if (!state || state === 'connected') return null;
  if (state === 'connecting' || state === 'new') return 'Connecting...';
  if (state === 'disconnected') return 'Reconnecting...';
  if (state === 'failed') return 'Connection failed';
  return null;
}

export function ParticipantVideo({
  stream,
  label,
  muted,
  isLocal,
  connectionState,
  avatarUrl,
  showAvatar = false,
  isOwner,
  onKick,
  canKick,
}: ParticipantVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoTracks = stream.getVideoTracks();
  const hasVideo = videoTracks.some((t) => t.enabled);
  const displayAvatar = showAvatar || !hasVideo;

  // Single video element: keep stream attached and re-play when track is re-enabled
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
    videoRef.current.play().catch(() => {});
  }, [stream]);

  useEffect(() => {
    if (hasVideo && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [hasVideo, stream]);

  const statusLabel = getConnectionLabel(connectionState);

  return (
    <div className="relative w-full h-full min-h-0 min-w-0 rounded-2xl overflow-hidden bg-black shadow-xl group">
      {/* Layer 1: Video — fills tile, no letterboxing */}
      {videoTracks.length > 0 && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted ?? isLocal}
          className={`absolute inset-0 z-0 w-full h-full object-cover transition-opacity duration-200 ${
            displayAvatar && !hasVideo ? 'opacity-0 pointer-events-none' : hasVideo && displayAvatar ? 'opacity-20' : 'opacity-100'
          }`}
        />
      )}

      {/* Layer 2: Avatar (camera off or forced) */}
      {displayAvatar && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface-800/98">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-20 h-20 rounded-full object-cover ring-2 ring-white/20 shrink-0" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-brand flex items-center justify-center text-2xl font-bold text-white shadow-lg shrink-0">
              {getInitials(label)}
            </div>
          )}
          <span className="text-sm font-medium text-white/90 truncate max-w-full px-4 text-center">
            {label}
            {isLocal && ' (You)'}
          </span>
        </div>
      )}

      {/* Layer 3: Footer bar */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex items-end">
        <div className="w-full bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 py-2.5 min-h-[52px] flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 flex flex-col gap-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold text-white truncate">
                {label}
                {isLocal && ' (You)'}
              </span>
              {isOwner && (
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-brand bg-brand/20 px-1.5 py-0.5 rounded">
                  Host
                </span>
              )}
            </div>
            {statusLabel && (
              <span className="text-[11px] text-amber-300/90">{statusLabel}</span>
            )}
          </div>
          {canKick && onKick && !isLocal && (
            <button
              type="button"
              onClick={onKick}
              className="shrink-0 opacity-0 group-hover:opacity-100 px-2.5 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-500 text-white text-xs font-medium transition-opacity"
              title="Remove participant"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
