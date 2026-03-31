import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Database, open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

let db: Database;

async function setupDb() {
  db = await open({
    filename: path.join(__dirname, '../database.sqlite'),
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    );

    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      score INTEGER,
      game_mode TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);
}

// Auth Routes
app.post('/api/register', async (req: express.Request, res: express.Response) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
    res.status(201).json({ message: 'User registered' });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/login', async (req: express.Request, res: express.Response) => {
  const { username, password } = req.body;
  const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, username: user.username });
});

app.get('/api/scores', async (_req, res) => {
  const scores = await db.all(`
    SELECT users.username, scores.score, scores.created_at 
    FROM scores 
    JOIN users ON scores.user_id = users.id 
    ORDER BY scores.score DESC 
    LIMIT 10
  `);
  res.json(scores);
});

// Socket logic for multiplayer
interface Player {
  id: string;
  username: string;
  snake: { x: number; y: number }[];
  direction: string;
  score: number;
}

interface Room {
  players: Player[];
  food: { x: number; y: number };
}

const rooms: Record<string, Room> = {};

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('joinRoom', ({ username }) => {
    let roomId = Object.keys(rooms).find(id => {
      const r = rooms[id];
      return r && r.players.length === 1;
    });

    if (!roomId) {
      roomId = `room_${Date.now()}`;
      rooms[roomId] = {
        players: [],
        food: { x: 10, y: 10 },
      };
    }

    const room = rooms[roomId];
    if (!room) return;

    const player: Player = {
      id: socket.id,
      username,
      snake: [{ x: 5, y: 5 }],
      direction: 'RIGHT',
      score: 0,
    };

    room.players.push(player);
    socket.join(roomId);

    if (room.players.length === 2) {
      io.to(roomId).emit('gameStart', { players: room.players, food: room.food });
      startGameLoop(roomId);
    } else {
      socket.emit('waitingForPlayer');
    }
  });

  socket.on('move', ({ direction }) => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (!room) continue;
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        player.direction = direction;
        break;
      }
    }
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (!room) continue;
      const index = room.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        room.players.splice(index, 1);
        if (room.players.length === 0) {
          delete rooms[roomId];
        } else {
          io.to(roomId).emit('playerLeft');
        }
        break;
      }
    }
  });
});

function startGameLoop(roomId: string) {
  const interval = setInterval(() => {
    const room = rooms[roomId];
    if (!room || room.players.length < 2) {
      clearInterval(interval);
      return;
    }

    room.players.forEach(player => {
      const firstSegment = player.snake[0];
      if (!firstSegment) return;
      const head = { ...firstSegment };
      if (player.direction === 'UP') head.y -= 1;
      if (player.direction === 'DOWN') head.y += 1;
      if (player.direction === 'LEFT') head.x -= 1;
      if (player.direction === 'RIGHT') head.x += 1;

      player.snake.unshift(head);

      if (head.x === room.food.x && head.y === room.food.y) {
        player.score += 10;
        room.food = {
          x: Math.floor(Math.random() * 20),
          y: Math.floor(Math.random() * 20),
        };
      } else {
        player.snake.pop();
      }
    });

    let gameOver = false;
    room.players.forEach(player => {
      const head = player.snake[0];
      if (!head) return;
      if (head.x < 0 || head.x >= 20 || head.y < 0 || head.y >= 20) {
        gameOver = true;
      }
      for (let i = 1; i < player.snake.length; i++) {
        const seg = player.snake[i];
        if (seg && head.x === seg.x && head.y === seg.y) {
          gameOver = true;
        }
      }
      const otherPlayer = room.players.find(p => p.id !== player.id);
      if (otherPlayer) {
        otherPlayer.snake.forEach(seg => {
          if (head.x === seg.x && head.y === seg.y) {
            gameOver = true;
          }
        });
      }
    });

    if (gameOver) {
      io.to(roomId).emit('gameOver', { players: room.players });
      room.players.forEach(async p => {
        const user = await db.get('SELECT id FROM users WHERE username = ?', [p.username]);
        if (user) {
          await db.run('INSERT INTO scores (user_id, score, game_mode) VALUES (?, ?, ?)', [user.id, p.score, 'multiplayer']);
        }
      });
      clearInterval(interval);
      delete rooms[roomId];
    } else {
      io.to(roomId).emit('gameUpdate', { players: room.players, food: room.food });
    }
  }, 200);
}

setupDb().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
