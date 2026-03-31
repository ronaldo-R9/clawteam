import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const GRID_SIZE = 20;
const CANVAS_SIZE = 400;

interface Point {
  x: number;
  y: number;
}

const Game: React.FC<{ username: string }> = ({ username }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [snake, setSnake] = useState<Point[]>([{ x: 10, y: 10 }]);
  const [opponentSnake, setOpponentSnake] = useState<Point[]>([]);
  const [food, setFood] = useState<Point>({ x: 5, y: 5 });
  const [direction, setDirection] = useState<Point>({ x: 0, y: -1 });
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [roomID, setRoomID] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    socketRef.current = io('http://localhost:5000');
    
    socketRef.current.on('match_found', (data) => {
      setRoomID(data.roomID);
      setOpponent(data.opponent);
      setIsSearching(false);
      setMode('multi');
      setSnake(data.playerNum === 1 ? [{ x: 5, y: 10 }] : [{ x: 15, y: 10 }]);
      setDirection(data.playerNum === 1 ? { x: 1, y: 0 } : { x: -1, y: 0 });
      setGameOver(false);
      setScore(0);
    });

    socketRef.current.on('opponent_state', (data) => {
      setOpponentSnake(data.snake);
    });

    socketRef.current.on('match_result', (data) => {
        alert(data.winner === username ? "You Win!" : "You Lose!");
        resetGame();
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [username]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp': if (direction.y === 0) setDirection({ x: 0, y: -1 }); break;
        case 'ArrowDown': if (direction.y === 0) setDirection({ x: 0, y: 1 }); break;
        case 'ArrowLeft': if (direction.x === 0) setDirection({ x: -1, y: 0 }); break;
        case 'ArrowRight': if (direction.x === 0) setDirection({ x: 1, y: 0 }); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [direction]);

  useEffect(() => {
    if (gameOver) return;

    const moveSnake = () => {
      const newHead = {
        x: snake[0].x + direction.x,
        y: snake[0].y + direction.y,
      };

      // Collision check (Self & Walls)
      if (
        newHead.x < 0 || newHead.x >= CANVAS_SIZE / GRID_SIZE ||
        newHead.y < 0 || newHead.y >= CANVAS_SIZE / GRID_SIZE ||
        snake.some(segment => segment.x === newHead.x && segment.y === newHead.y)
      ) {
        if (mode === 'multi' && roomID) {
          socketRef.current?.emit('game_over', { roomID, winner: opponent });
        }
        setGameOver(true);
        return;
      }

      // Collision check (Opponent) in Multiplayer
      if (mode === 'multi' && opponentSnake.some(s => s.x === newHead.x && s.y === newHead.y)) {
          socketRef.current?.emit('game_over', { roomID, winner: opponent });
          setGameOver(true);
          return;
      }

      const newSnake = [newHead, ...snake];
      if (newHead.x === food.x && newHead.y === food.y) {
        setScore(score + 10);
        setFood({
          x: Math.floor(Math.random() * (CANVAS_SIZE / GRID_SIZE)),
          y: Math.floor(Math.random() * (CANVAS_SIZE / GRID_SIZE)),
        });
      } else {
        newSnake.pop();
      }
      setSnake(newSnake);

      if (mode === 'multi' && roomID) {
        socketRef.current?.emit('game_state', { roomID, snake: newSnake, score: score });
      }
    };

    const interval = setInterval(moveSnake, 150);
    return () => clearInterval(interval);
  }, [snake, direction, food, gameOver, score, mode, roomID, opponent, opponentSnake]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    
    // Draw My Snake
    ctx.fillStyle = 'green';
    snake.forEach(p => ctx.fillRect(p.x * GRID_SIZE, p.y * GRID_SIZE, GRID_SIZE - 2, GRID_SIZE - 2));

    // Draw Opponent Snake
    if (mode === 'multi') {
        ctx.fillStyle = 'blue';
        opponentSnake.forEach(p => ctx.fillRect(p.x * GRID_SIZE, p.y * GRID_SIZE, GRID_SIZE - 2, GRID_SIZE - 2));
    }

    // Draw Food
    ctx.fillStyle = 'red';
    ctx.fillRect(food.x * GRID_SIZE, food.y * GRID_SIZE, GRID_SIZE - 2, GRID_SIZE - 2);

  }, [snake, food, opponentSnake, mode]);

  const resetGame = () => {
    setSnake([{ x: 10, y: 10 }]);
    setOpponentSnake([]);
    setFood({ x: 5, y: 5 });
    setDirection({ x: 0, y: -1 });
    setGameOver(false);
    setScore(0);
    setRoomID(null);
    setOpponent(null);
    setMode('single');
    setIsSearching(false);
  };

  const startMatchmaking = () => {
    setIsSearching(true);
    socketRef.current?.emit('join_match', username);
  };

  return (
    <div className="game-container">
      <h2>Snake Game {mode === 'multi' ? `(PK vs ${opponent})` : '(Single Player)'}</h2>
      <div className="controls">
        {mode === 'single' && !isSearching && (
          <button onClick={startMatchmaking}>Start Online PK</button>
        )}
        {isSearching && <p>Searching for opponent...</p>}
      </div>
      <div className="status">
        <span>Score: {score}</span>
        {gameOver && <span className="game-over"> GAME OVER! <button onClick={resetGame}>Back to Menu</button></span>}
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        style={{ border: '2px solid #333', backgroundColor: '#eee' }}
      />
      <div className="instructions">
        <p>Use Arrow Keys to move. {mode === 'multi' && 'Green: You, Blue: Opponent'}</p>
      </div>
    </div>
  );
};

export default Game;
