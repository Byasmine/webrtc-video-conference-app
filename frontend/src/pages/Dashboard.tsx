import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useClerk, useUser } from '@clerk/clerk-react';
import { listRooms, createRoom, deleteRoom, getRoomByCode } from '../api/client';
import { ThemeToggle } from '../components/ThemeToggle';

export function Dashboard() {
  const { getToken, userId } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Awaited<ReturnType<typeof listRooms>>>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchRooms = async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const data = await listRooms(token);
      setRooms(data);
    } catch (e) {
      setError('Could not load rooms. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, [getToken]);

  const handleCreate = async () => {
    const name = newRoomName.trim();
    if (!name) return;
    const token = await getToken();
    if (!token) return;
    setCreating(true);
    setError(null);
    try {
      const room = await createRoom(name, token);
      navigate(`/room/${room.id}`);
    } catch (e) {
      setError('Could not create room. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinByCode = async () => {
    const code = roomCode.trim().toUpperCase();
    if (!code) return;
    const token = await getToken();
    if (!token) return;
    setJoining(true);
    setError(null);
    try {
      const room = await getRoomByCode(code, token);
      if (!room) {
        setError('Room not found. Check the code and try again.');
        return;
      }
      navigate(`/room/${room.id}`);
    } catch (e) {
      setError('Could not join room. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  const handleDelete = async (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const token = await getToken();
    if (!token) return;
    if (!confirm('Delete this room? This cannot be undone.')) return;
    try {
      await deleteRoom(roomId, token);
      fetchRooms();
    } catch (e) {
      setError('Could not delete room. You may only delete rooms you created.');
    }
  };

  return (
    <div className="min-h-screen bg-surface-900 text-primary">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 bg-surface-800 border-b border-surface-border">
        <div className="flex items-center gap-3">
          <span className="text-brand font-bold text-lg tracking-wide font-heading">DulfiTech</span>
          <span className="text-surface-400">|</span>
          <span className="text-muted text-sm">Meet</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <span className="text-sm text-muted truncate max-w-[200px]">
            {user?.firstName || user?.username || user?.primaryEmailAddress?.emailAddress || 'User'}
          </span>
          <button
            type="button"
            onClick={() => signOut()}
            className="px-4 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-sm text-secondary transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-primary mb-2 font-heading">
            DulfiTech <span className="text-brand">Meet</span>
          </h1>
          <p className="text-muted">Secure video meetings, powered by DulfiTech</p>
        </div>

        <div className="space-y-8">
          {/* New Meeting */}
          <div className="bg-surface-800 rounded-2xl border border-surface-border p-6">
            <h2 className="text-lg font-semibold text-primary mb-4 flex items-center gap-3 font-heading">
              <span className="w-8 h-8 rounded-lg bg-brand/15 flex items-center justify-center text-brand text-sm font-bold">+</span>
              New Meeting
            </h2>
            <div className="flex gap-3">
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="Meeting name"
                className="flex-1 px-4 py-3 rounded-xl bg-surface-700 border border-surface-border text-primary placeholder-muted focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || !newRoomName.trim()}
                className="px-6 py-3 rounded-xl bg-brand hover:bg-brand-light disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-colors shadow-lg shadow-brand/20"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-surface-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-surface-900 px-4 text-sm text-muted">or</span>
            </div>
          </div>

          {/* Join with Code */}
          <div className="bg-surface-800 rounded-2xl border border-surface-border p-6">
            <h2 className="text-lg font-semibold text-primary mb-4 flex items-center gap-3 font-heading">
              <span className="w-8 h-8 rounded-lg bg-brand/15 flex items-center justify-center text-brand text-sm font-bold">#</span>
              Join with Code
            </h2>
            <div className="flex gap-3">
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="Enter 6-character code"
                maxLength={6}
                className="flex-1 px-4 py-3 rounded-xl bg-surface-700 border border-surface-border text-primary placeholder-muted focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent font-mono text-lg tracking-widest uppercase"
                onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
              />
              <button
                type="button"
                onClick={handleJoinByCode}
                disabled={joining || roomCode.trim().length < 6}
                className="px-6 py-3 rounded-xl bg-surface-700 hover:bg-surface-600 text-primary disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-colors"
              >
                {joining ? 'Joining...' : 'Join'}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 rounded-xl bg-red-900/30 border border-red-800/50 text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Recent Meetings */}
          <div className="bg-surface-800 rounded-2xl border border-surface-border p-6">
            <h2 className="text-lg font-semibold text-primary mb-4 flex items-center gap-3 font-heading">
              <span className="w-8 h-8 rounded-lg bg-surface-600 flex items-center justify-center text-muted text-sm">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" />
                  <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" />
                </svg>
              </span>
              Recent Meetings
            </h2>
            {loading ? (
              <div className="space-y-3 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-xl bg-surface-700" />
                ))}
              </div>
            ) : rooms.length === 0 ? (
              <p className="text-muted py-4 text-center">No meetings yet</p>
            ) : (
              <ul className="space-y-2">
                {rooms.map((room) => (
                  <li
                    key={room.id}
                    className="flex items-center justify-between gap-4 p-4 rounded-xl bg-surface-700/50 border border-surface-border hover:border-brand/30 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-primary truncate block">{room.name}</span>
                      {room.room_code && (
                        <span className="text-xs text-muted font-mono">Code: {room.room_code}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => navigate(`/room/${room.id}`)}
                        className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-light text-white text-sm font-medium transition-colors"
                      >
                        Join
                      </button>
                      {room.created_by === userId && (
                        <button
                          type="button"
                          onClick={(e) => handleDelete(room.id, e)}
                          className="px-3 py-2 rounded-lg bg-red-900/30 hover:bg-red-800/50 text-red-300 text-sm transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete room"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-muted text-xs">
          Powered by <span className="text-brand font-semibold">DulfiTech</span>
        </div>
      </div>
    </div>
  );
}
