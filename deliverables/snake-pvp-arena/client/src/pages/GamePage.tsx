import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import GameCanvas from '../components/GameCanvas';
import { useAuth } from '../contexts/AuthContext';
import { useSfx } from '../hooks/useSfx';
import { useSocket } from '../hooks/useSocket';

interface RoomSnapshot {
  roomCode: string;
  status: 'waiting' | 'countdown' | 'playing' | 'finished';
  tick: number;
  countdown: number | null;
  grid: { width: number; height: number };
  players: Array<{ userId: string; username: string; color: string; connected: boolean }>;
  snakes: Array<{
    userId: string;
    username: string;
    color: string;
    body: Array<{ x: number; y: number }>;
    direction: string;
    score: number;
    alive: boolean;
  }>;
  food: { x: number; y: number } | null;
  speed: number;
  winner: { userId: string; username: string } | null;
  reason: string | null;
}

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const socket = useSocket();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<RoomSnapshot | null>(null);
  const [joined, setJoined] = useState(false);
  const [rematchSent, setRematchSent] = useState(false);
  const [rematchPending, setRematchPending] = useState<string | null>(null);
  const sfx = useSfx();
  const prevStateRef = useRef<RoomSnapshot | null>(null);

  // Join or reconnect to room
  useEffect(() => {
    if (!socket || !roomCode || joined) return;

    socket.emit('room:watch', { roomCode }, (res: any) => {
      if (res.ok) {
        setState(res.state);
        setJoined(true);
      }
    });
  }, [socket, roomCode, joined]);

  // Listen for updates
  useEffect(() => {
    if (!socket) return;

    socket.on('room:update', (snapshot: RoomSnapshot) => {
      setState((prev) => {
        // Reset rematch state on new game
        if (prev?.status === 'finished' && snapshot.status !== 'finished') {
          setRematchSent(false);
          setRematchPending(null);
        }

        // Sound effects based on state transitions
        if (prev) {
          // Countdown tick
          if (snapshot.status === 'countdown' && snapshot.countdown !== null &&
              snapshot.countdown !== prev.countdown) {
            sfx.countdownTick();
          }
          // Game start
          if (prev.status === 'countdown' && snapshot.status === 'playing') {
            sfx.gameStart();
          }
          // Food eaten (total score increased)
          if (snapshot.status === 'playing' && prev.status === 'playing') {
            const prevTotal = prev.snakes.reduce((s, sn) => s + sn.score, 0);
            const curTotal = snapshot.snakes.reduce((s, sn) => s + sn.score, 0);
            if (curTotal > prevTotal) {
              sfx.eatFood();
            }
          }
          // Death
          if (snapshot.status === 'finished' && prev.status === 'playing') {
            const isWinner = snapshot.winner?.userId === user?.id;
            if (snapshot.winner) {
              if (isWinner) sfx.win();
              else sfx.lose();
            } else {
              sfx.death();
            }
          }
        }

        prevStateRef.current = snapshot;
        return snapshot;
      });
    });

    socket.on('rematch:requested', (data: { userId: string }) => {
      if (data.userId !== user?.id) {
        setRematchPending(data.userId);
      }
    });

    return () => {
      socket.off('room:update');
      socket.off('rematch:requested');
    };
  }, [socket, user?.id]);

  // Keyboard controls
  useEffect(() => {
    if (!socket) return;

    function handleKey(e: KeyboardEvent) {
      const keyMap: Record<string, string> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        w: 'up',
        s: 'down',
        a: 'left',
        d: 'right',
        W: 'up',
        S: 'down',
        A: 'left',
        D: 'right'
      };
      const direction = keyMap[e.key];
      if (direction && socket) {
        e.preventDefault();
        socket.emit('direction:set', { direction });
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [socket]);

  // Touch controls
  const touchRef = useRef({ x: 0, y: 0 });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!socket) return;
      const dx = e.changedTouches[0].clientX - touchRef.current.x;
      const dy = e.changedTouches[0].clientY - touchRef.current.y;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      const direction =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      socket.emit('direction:set', { direction });
    },
    [socket]
  );

  const handleLeave = useCallback(() => {
    if (socket) socket.emit('room:leave');
    navigate('/');
  }, [socket, navigate]);

  const handleRematch = useCallback(() => {
    if (!socket || rematchSent) return;
    socket.emit('rematch:request');
    setRematchSent(true);
  }, [socket, rematchSent]);

  return (
    <div
      className="min-h-screen flex flex-col bg-slate-900"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top bar */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex items-center justify-between">
        <button onClick={handleLeave} className="text-sm text-slate-400 hover:text-white transition">
          &larr; 返回大厅
        </button>
        <span className="text-sm text-slate-400 font-mono">房间 {state?.roomCode ?? roomCode}</span>
        <span className="text-sm text-slate-500">
          {state?.status === 'waiting' && '等待对手...'}
          {state?.status === 'countdown' && '即将开始'}
          {state?.status === 'playing' && (
            <>
              Tick {state.tick}
              {state.speed < 150 && (
                <span className="ml-2 text-orange-400">
                  {state.speed <= 100 ? '⚡⚡' : '⚡'}
                </span>
              )}
            </>
          )}
          {state?.status === 'finished' && '已结束'}
        </span>
      </header>

      {/* Score board */}
      {state && state.snakes.length > 0 && (
        <div className="flex justify-center gap-8 py-3">
          {state.snakes.map((snake) => (
            <div key={snake.userId} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: snake.color, opacity: snake.alive ? 1 : 0.3 }}
              />
              <span className={`font-semibold ${snake.userId === user?.id ? 'text-white' : 'text-slate-300'}`}>
                {snake.username}
              </span>
              <span className="text-orange-400 font-mono text-lg">{snake.score}</span>
              {!snake.alive && <span className="text-red-400 text-xs">OUT</span>}
            </div>
          ))}
        </div>
      )}

      {/* Game area */}
      <div className="flex-1 flex items-center justify-center relative">
        {state?.status === 'waiting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-slate-900/80">
            <div className="text-2xl font-bold mb-4">等待对手加入</div>
            <div className="bg-slate-800 px-6 py-3 rounded-lg mb-2">
              <span className="text-sm text-slate-400 mr-2">房间码</span>
              <span className="text-2xl font-mono font-bold text-orange-400 tracking-widest">
                {state.roomCode}
              </span>
            </div>
            <p className="text-sm text-slate-500">分享房间码给你的对手</p>
          </div>
        )}

        {state?.status === 'countdown' && state.countdown !== null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-slate-900/60">
            <div className="text-8xl font-black text-orange-400 animate-bounce drop-shadow-lg">
              {state.countdown}
            </div>
            <div className="text-lg text-slate-300 mt-4">准备战斗!</div>
          </div>
        )}

        {state?.status === 'finished' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-slate-900/80">
            <div className="bg-slate-800 rounded-2xl p-8 shadow-2xl text-center max-w-sm">
              <h2 className="text-3xl font-bold mb-2">
                {state.winner
                  ? state.winner.userId === user?.id
                    ? '🏆 胜利!'
                    : '💀 失败'
                  : '🤝 平局'}
              </h2>
              {state.winner && (
                <p className="text-slate-400 mb-4">
                  {state.winner.username} 获胜
                  {state.reason === 'disconnect' && ' (对手断线)'}
                  {state.reason === 'opponent_left' && ' (对手离开)'}
                </p>
              )}
              <div className="flex justify-center gap-6 mb-6">
                {state.snakes.map((snake) => (
                  <div key={snake.userId} className="text-center">
                    <div className="text-sm text-slate-400">{snake.username}</div>
                    <div className="text-2xl font-bold text-orange-400">{snake.score}</div>
                    <div className={`text-xs mt-1 ${
                      state.winner?.userId === snake.userId ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {state.winner?.userId === snake.userId ? '胜' : state.winner ? '负' : '平'}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleRematch}
                  disabled={rematchSent}
                  className={`px-6 py-2 rounded-lg font-semibold transition ${
                    rematchSent
                      ? 'bg-slate-600 text-slate-400'
                      : 'bg-green-600 hover:bg-green-500'
                  }`}
                >
                  {rematchSent ? '等待对手...' : '再来一局'}
                </button>
                <button
                  onClick={handleLeave}
                  className="px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition"
                >
                  返回大厅
                </button>
              </div>
              {rematchPending && !rematchSent && (
                <p className="text-sm text-green-400 mt-2 animate-pulse">
                  对手请求再来一局!
                </p>
              )}
            </div>
          </div>
        )}

        <GameCanvas state={state} />
      </div>

      {/* Mobile controls hint */}
      <div className="text-center text-xs text-slate-600 py-2 md:hidden">滑动屏幕控制方向</div>
      <div className="text-center text-xs text-slate-600 py-2 hidden md:block">
        方向键 / WASD 控制移动
      </div>
    </div>
  );
}
