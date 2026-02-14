import { ParticipantVideo } from './ParticipantVideo';
import type { PeerStream } from '../hooks/useWebRTC';

type VideoGridProps = {
  localStream: MediaStream | null;
  peerStreams: PeerStream[];
  currentDisplayName?: string;
  currentUserId: string;
  currentAvatarUrl?: string | null;
  isVideoOff?: boolean;
  roomCreatedBy?: string;
  onKick?: (socketId: string) => void;
};

function getDisplayLabel(p: PeerStream): string {
  return p.displayName || p.userId || 'Participant';
}

export function VideoGrid({
  localStream,
  peerStreams,
  currentDisplayName,
  currentUserId,
  currentAvatarUrl,
  isVideoOff = false,
  roomCreatedBy,
  onKick,
}: VideoGridProps) {
  const total = (localStream ? 1 : 0) + peerStreams.length;
  const cols = total <= 1 ? 1 : total <= 4 ? 2 : Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / cols);
  const isAlone = total === 1;
  const isRoomOwner = roomCreatedBy === currentUserId;

  return (
    <div className="flex flex-col w-full h-full relative">
      {isAlone && (
        <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none">
          <p className="text-muted text-sm bg-surface-800 px-5 py-3 rounded-2xl border border-surface-border">
            You&apos;re the only one here. Share the link or room code to invite others.
          </p>
        </div>
      )}
      <div
        className="grid gap-2 p-2 w-full h-full relative z-10 min-h-0"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {localStream && (
          <div className="min-h-0 min-w-0">
            <ParticipantVideo
            stream={localStream}
            label={currentDisplayName || currentUserId}
            muted
            isLocal
            showAvatar={isVideoOff}
            avatarUrl={currentAvatarUrl}
            isOwner={isRoomOwner}
          />
          </div>
        )}
        {peerStreams.map((p) => (
          <div key={p.socketId} className="min-h-0 min-w-0">
            <ParticipantVideo
            key={p.socketId}
            stream={p.stream}
            label={getDisplayLabel(p)}
            connectionState={p.connectionState}
            showAvatar={!p.stream.getVideoTracks().some((t) => t.enabled)}
            canKick={isRoomOwner}
            onKick={onKick ? () => onKick(p.socketId) : undefined}
          />
          </div>
        ))}
      </div>
    </div>
  );
}
