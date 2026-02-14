import { useState, useCallback } from 'react';
import type { Recording } from '../api/client';
import { fetchRecordingBlob } from '../api/client';

type RecordingsListProps = {
  recordings: Recording[];
  loading?: boolean;
  onRefresh: () => void;
  token: string | null;
  onClose?: () => void;
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function RecordingsList({ recordings, loading, onRefresh, token, onClose }: RecordingsListProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const [loadingBlob, setLoadingBlob] = useState<string | null>(null);

  const handlePlay = useCallback(
    async (recordingId: string) => {
      if (playingId === recordingId) {
        setPlayingId(null);
        return;
      }
      if (!token) return;
      if (blobUrls[recordingId]) {
        setPlayingId(recordingId);
        return;
      }
      setLoadingBlob(recordingId);
      try {
        const blobUrl = await fetchRecordingBlob(recordingId, token);
        setBlobUrls((prev) => ({ ...prev, [recordingId]: blobUrl }));
        setPlayingId(recordingId);
      } catch (err) {
        console.error('Failed to load recording:', err);
      } finally {
        setLoadingBlob(null);
      }
    },
    [playingId, token, blobUrls]
  );

  const handleDownload = useCallback(
    async (recordingId: string, filename: string) => {
      if (!token) return;
      let url = blobUrls[recordingId];
      if (!url) {
        try {
          url = await fetchRecordingBlob(recordingId, token);
          setBlobUrls((prev) => ({ ...prev, [recordingId]: url }));
        } catch (err) {
          console.error('Failed to download recording:', err);
          return;
        }
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `recording-${recordingId}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
    [token, blobUrls]
  );

  return (
    <div className="bg-surface-800/95 backdrop-blur rounded-xl p-4 border border-surface-border shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm text-primary font-heading">Recordings</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="text-xs text-brand hover:text-brand-light disabled:opacity-50 transition-colors"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-muted hover:text-secondary transition-colors"
              title="Close"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {recordings.length === 0 ? (
        <p className="text-sm text-muted">No recordings yet</p>
      ) : (
        <ul className="space-y-2 max-h-64 overflow-y-auto">
          {recordings.map((r) => (
            <li
              key={r.id}
              className="text-xs text-secondary py-1.5 border-b border-surface-border last:border-0"
            >
              <div className="flex justify-between items-center">
                <span>{formatDuration(r.duration_seconds)}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePlay(r.id)}
                    disabled={loadingBlob === r.id}
                    className="text-brand hover:text-brand-light transition-colors disabled:opacity-50"
                    title={playingId === r.id ? 'Close' : 'Play'}
                  >
                    {loadingBlob === r.id ? '...' : playingId === r.id ? 'Close' : 'Play'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(r.id, `recording-${r.id}.webm`)}
                    className="p-1 text-green-400 hover:text-green-300 transition-colors rounded"
                    title="Download"
                    aria-label="Download"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                </div>
              </div>
              <span className="text-muted block truncate">
                {formatDate(r.started_at)}
              </span>
              {playingId === r.id && blobUrls[r.id] && (
                <video
                  src={blobUrls[r.id]}
                  controls
                  autoPlay
                  className="mt-2 w-full rounded-lg"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
