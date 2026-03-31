import { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';

const API_URL = 'http://localhost:4000';

const Login = ({ setAuth }: { setAuth: (token: string, username: string) => void }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const res = await axios.post(`${API_URL}/api/login`, { username, password });
      setAuth(res.data.token, res.data.username);
      navigate('/game');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Login failed');
    }
  };

  return (
    <div>
      <h1>Login</h1>
      <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
      <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
      <button onClick={handleLogin}>Login</button>
      <p onClick={() => navigate('/register')} style={{ cursor: 'pointer', color: '#1a73e8' }}>No account? Register</p>
    </div>
  );
};

const Register = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleRegister = async () => {
    try {
      await axios.post(`${API_URL}/api/register`, { username, password });
      alert('Registered successfully!');
      navigate('/login');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Registration failed');
    }
  };

  return (
    <div>
      <h1>Register</h1>
      <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
      <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
      <button onClick={handleRegister}>Register</button>
      <p onClick={() => navigate('/login')} style={{ cursor: 'pointer', color: '#1a73e8' }}>Back to Login</p>
    </div>
  );
};

const SnakeGame = ({ username }: { username: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [status, setStatus] = useState('Connecting...');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  const fetchScores = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/scores`);
      setLeaderboard(res.data);
    } catch (err) {
      console.error('Failed to fetch scores');
    }
  };

  useEffect(() => {
    fetchScores();
    const s = io(API_URL);
    setSocket(s);

    s.on('connect', () => {
      s.emit('joinRoom', { username });
    });

    s.on('waitingForPlayer', () => setStatus('Waiting for another player...'));
    s.on('gameStart', (data) => {
      setStatus('Game Started!');
      setGameState(data);
    });
    s.on('gameUpdate', (data) => setGameState(data));
    s.on('gameOver', () => {
      setStatus('Game Over!');
      setGameState(null);
      fetchScores();
    });
    s.on('playerLeft', () => {
      setStatus('Other player left. Waiting for new player...');
      setGameState(null);
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      let direction = '';
      if (e.key === 'ArrowUp') direction = 'UP';
      if (e.key === 'ArrowDown') direction = 'DOWN';
      if (e.key === 'ArrowLeft') direction = 'LEFT';
      if (e.key === 'ArrowRight') direction = 'RIGHT';
      if (direction) s.emit('move', { direction });
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      s.disconnect();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [username]);

  useEffect(() => {
    if (!gameState || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 400, 400);

    // Draw food
    ctx.fillStyle = 'red';
    ctx.fillRect(gameState.food.x * 20, gameState.food.y * 20, 18, 18);

    // Draw players
    gameState.players.forEach((p: any, index: number) => {
      ctx.fillStyle = index === 0 ? 'green' : 'blue';
      p.snake.forEach((seg: any) => {
        ctx.fillRect(seg.x * 20, seg.y * 20, 18, 18);
      });
    });
  }, [gameState]);

  return (
    <div className="game-container">
      <h1>Online Snake</h1>
      <p>Status: {status}</p>
      {status === 'Game Over!' && (
        <button onClick={() => socket?.emit('joinRoom', { username })}>Join Again</button>
      )}
      {gameState && (
        <div className="score-board">
          {gameState.players.map((p: any) => (
            <div key={p.id}>{p.username}: {p.score}</div>
          ))}
        </div>
      )}
      <canvas ref={canvasRef} width={400} height={400} />
      <p>Use Arrow Keys to move</p>
      <div style={{ marginTop: '20px', textAlign: 'left', width: '100%' }}>
        <h3>Leaderboard (Top 10)</h3>
        {leaderboard.map((s, i) => (
          <div key={i}>{s.username}: {s.score} ({new Date(s.created_at).toLocaleDateString()})</div>
        ))}
      </div>
    </div>
  );
};

const App = () => {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [username, setUsername] = useState(localStorage.getItem('username'));

  const setAuth = (t: string, u: string) => {
    setToken(t);
    setUsername(u);
    localStorage.setItem('token', t);
    localStorage.setItem('username', u);
  };

  const logout = () => {
    setToken(null);
    setUsername(null);
    localStorage.removeItem('token');
    localStorage.removeItem('username');
  };

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login setAuth={setAuth} />} />
        <Route path="/register" element={<Register />} />
        <Route path="/game" element={token ? <SnakeGame username={username!} /> : <Navigate to="/login" />} />
        <Route path="/" element={<Navigate to="/game" />} />
      </Routes>
      {token && <button onClick={logout} style={{ marginTop: '20px', backgroundColor: '#666' }}>Logout</button>}
    </Router>
  );
};

export default App;
