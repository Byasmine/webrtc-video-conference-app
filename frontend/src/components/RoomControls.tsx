type RoomControlsProps = {
  isRecording: boolean;
  onMuteToggle: () => void;
  onVideoToggle: () => void;
  onRecordStart: () => void;
  onRecordStop: () => void;
  onLeave: () => void;
  isMuted: boolean;
  isVideoOff: boolean;
  hasMicrophone?: boolean;
  hasCamera?: boolean;
  showRecordings?: boolean;
  onToggleRecordings?: () => void;
  recordingsCount?: number;
};

export function RoomControls({
  isRecording,
  onMuteToggle,
  onVideoToggle,
  onRecordStart,
  onRecordStop,
  onLeave,
  isMuted,
  isVideoOff,
  hasMicrophone = true,
  hasCamera = true,
  showRecordings,
  onToggleRecordings,
  recordingsCount = 0,
}: RoomControlsProps) {
  const btnBase = 'p-3 rounded-full transition-colors';
  const btnOff = 'bg-red-600 hover:bg-red-500 text-white';
  const btnOn = 'bg-surface-700 hover:bg-surface-600 text-primary';
  const btnDisabled = 'bg-surface-700/60 text-surface-400 cursor-not-allowed opacity-80';

  return (
    <div className="flex items-center gap-3">
      {/* Mute — disabled when no mic */}
      <button
        type="button"
        onClick={hasMicrophone ? onMuteToggle : undefined}
        disabled={!hasMicrophone}
        className={`${btnBase} ${!hasMicrophone ? btnDisabled : isMuted ? btnOff : btnOn}`}
        title={!hasMicrophone ? 'No microphone connected' : isMuted ? 'Unmute' : 'Mute'}
        aria-label={!hasMicrophone ? 'No microphone connected' : isMuted ? 'Unmute' : 'Mute'}
      >
        {!hasMicrophone ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 opacity-70" aria-hidden="true">
            <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="5" y1="5" x2="19" y2="19" />
          </svg>
        ) : isMuted ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          </svg>
        )}
      </button>

      {/* Video — disabled when no camera */}
      <button
        type="button"
        onClick={hasCamera ? onVideoToggle : undefined}
        disabled={!hasCamera}
        className={`${btnBase} ${!hasCamera ? btnDisabled : isVideoOff ? btnOff : btnOn}`}
        title={!hasCamera ? 'No camera connected' : isVideoOff ? 'Turn on camera' : 'Turn off camera'}
        aria-label={!hasCamera ? 'No camera connected' : isVideoOff ? 'Turn on camera' : 'Turn off camera'}
      >
        {isVideoOff ? (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M3.53 2.47a.75.75 0 00-1.06 1.06l18 18a.75.75 0 101.06-1.06l-18-18zM22.676 12.553a.75.75 0 00-.176-.499l-4.25-4.75V6.75A2.25 2.25 0 0016 4.5H5.336L3.53 2.694zM16 19.5H4.5A2.25 2.25 0 012.25 17.25v-7.5A2.25 2.25 0 014.5 7.5h.436l11.564 13z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
          </svg>
        )}
      </button>

      {/* Record */}
      <button
        type="button"
        onClick={isRecording ? onRecordStop : onRecordStart}
        className={`${btnBase} ${isRecording ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse' : btnOn}`}
        title={isRecording ? 'Stop recording' : 'Start recording'}
        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
      >
        {isRecording ? (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="12" r="4" fill="currentColor" />
          </svg>
        )}
      </button>

      {/* Recordings toggle — "saved/recorded meetings" icon */}
      {onToggleRecordings && (
        <button
          type="button"
          onClick={onToggleRecordings}
          className={`${btnBase} relative ${showRecordings ? 'bg-brand hover:bg-brand-light text-white' : btnOn}`}
          title={showRecordings ? 'Hide recordings' : 'Show recordings'}
          aria-label={showRecordings ? 'Hide recordings' : 'Show recordings'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <rect x="2" y="3" width="9" height="6" rx="1" />
            <path d="M14 5h6M14 9h5M14 13h6" />
          </svg>
          {recordingsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand text-white text-[10px] rounded-full flex items-center justify-center font-semibold">
              {recordingsCount > 9 ? '9+' : recordingsCount}
            </span>
          )}
        </button>
      )}

      {/* Divider */}
      <div className="w-px h-8 bg-surface-border mx-1" />

      {/* Leave */}
      <button
        type="button"
        onClick={onLeave}
        className="px-5 py-3 rounded-full bg-red-600 hover:bg-red-500 text-white transition-colors font-medium text-sm"
        title="Leave call"
        aria-label="Leave call"
      >
        Leave
      </button>
    </div>
  );
}
