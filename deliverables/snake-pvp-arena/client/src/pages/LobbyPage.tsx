import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../hooks/useSocket';

export default function LobbyPage() {
  const { user, logout } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();

  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);
  const [matchmaking, setMatchmaking] = useState(false);
  const [matchStatus, setMatchStatus] = useState('');

  useEffect(() => {
    if (!socket) return;

    socket.on('online:count', (count: number) => setOnlineCount(count));

    socket.on('match:found', (data: { roomCode: string }) => {
      setMatchmaking(false);
      navigate(`/game/${data.roomCode}`);
    });

    socket.on('match:status', (data: { position: number }) => {
      setMatchStatus(`队列中，你是第 ${data.position} 位`);
    });

    socket.emit('lobby:join');

    return () => {
      socket.off('online:count');
      socket.off('match:found');
      socket.off('match:status');
      socket.emit('lobby:leave');
    };
  }, [socket, navigate]);

  const handleCreate = useCallback(() => {
    if (!socket) return;
    socket.emit('room:create', (res: any) => {
      if (res.ok) {
        navigate(`/game/${res.roomCode}`);
      } else {
        setError(res.error || '创建房间失败');
      }
    });
  }, [socket, navigate]);

  const handleJoin = useCallback(() => {
    if (!socket) return;
    const code = roomCode.trim().toUpperCase();
    if (!code) return setError('请输入房间码');
    socket.emit('room:join', { roomCode: code }, (res: any) => {
      if (res.ok) {
        navigate(`/game/${res.roomCode}`);
      } else {
        setError(res.error || '加入房间失败');
      }
    });
  }, [socket, roomCode, navigate]);

  const handleQuickMatch = useCallback(() => {
    if (!socket) return;
    if (matchmaking) {
      socket.emit('match:cancel');
      setMatchmaking(false);
      setMatchStatus('');
    } else {
      socket.emit('match:join');
      setMatchmaking(true);
      setMatchStatus('正在匹配...');
    }
  }, [socket, matchmaking]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-orange-400">Snake PvP Arena</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1"></span>
            在线 {onlineCount}
          </span>
          <Link to="/stats" className="text-sm text-slate-400 hover:text-white transition">
            战绩
          </Link>
          <span className="text-sm text-slate-300">{user?.username}</span>
          <button
            onClick={logout}
            className="text-sm text-slate-500 hover:text-red-400 transition"
          >
            退出
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6">
          {/* Quick Match */}
          <div className="bg-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-4">快速匹配</h2>
            <button
              onClick={handleQuickMatch}
              className={`w-full py-3 rounded-lg font-bold text-lg transition ${
                matchmaking
                  ? 'bg-red-600 hover:bg-red-500'
                  : 'bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400'
              }`}
            >
              {matchmaking ? '取消匹配' : '快速匹配'}
            </button>
            {matchStatus && (
              <p className="text-center text-sm text-slate-400 mt-2 animate-pulse">
                {matchStatus}
              </p>
            )}
          </div>

          {/* Room Code */}
          <div className="bg-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-4">房间对战</h2>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={roomCode}
                onChange={(e) => {
                  setRoomCode(e.target.value.toUpperCase());
                  setError('');
                }}
                placeholder="输入房间码"
                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white uppercase tracking-widest text-center focus:outline-none focus:border-orange-500 transition"
                maxLength={5}
              />
              <button
                onClick={handleJoin}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 rounded-lg font-semibold transition"
              >
                加入
              </button>
            </div>
            <button
              onClick={handleCreate}
              className="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition text-slate-300"
            >
              创建房间
            </button>
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-300 text-sm px-3 py-2 rounded-lg text-center">
              {error}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
