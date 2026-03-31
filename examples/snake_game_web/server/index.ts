import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// In-memory user store
const users: any[] = [];
// Lobby for multiplayer
let waitingPlayer: { id: string, username: string } | null = null;
const rooms: Map<string, any> = new Map();

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ message: 'User already exists' });
  }
  users.push({ username, password });
  res.status(201).json({ message: 'User registered' });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  res.status(200).json({ message: 'Login successful', username });
});

io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);

  socket.on('join_match', (username: string) => {
    if (waitingPlayer && waitingPlayer.id !== socket.id) {
      const roomID = `room_${waitingPlayer.id}_${socket.id}`;
      const opponent = waitingPlayer;
      waitingPlayer = null;

      socket.join(roomID);
      io.to(opponent.id).emit('match_found', { roomID, opponent: username, playerNum: 2 });
      socket.emit('match_found', { roomID, opponent: opponent.username, playerNum: 1 });
      
      console.log(`Match found: ${roomID}`);
      rooms.set(roomID, {
        players: [opponent.id, socket.id],
        snakes: {
          [opponent.id]: [{ x: 5, y: 10 }],
          [socket.id]: [{ x: 15, y: 10 }]
        },
        food: { x: 10, y: 5 },
        scores: { [opponent.id]: 0, [socket.id]: 0 }
      });
    } else {
      waitingPlayer = { id: socket.id, username };
      socket.emit('waiting', 'Searching for opponent...');
    }
  });

  socket.on('update_direction', (data: { roomID: string, direction: { x: number, y: number } }) => {
    const room = rooms.get(data.roomID);
    if (room) {
      // Logic to handle direction updates and sync
      socket.to(data.roomID).emit('opponent_move', { direction: data.direction });
    }
  });

  socket.on('game_state', (data: { roomID: string, snake: any[], score: number }) => {
    socket.to(data.roomID).emit('opponent_state', data);
  });

  socket.on('game_over', (data: { roomID: string, winner: string }) => {
      io.to(data.roomID).emit('match_result', { winner: data.winner });
      rooms.delete(data.roomID);
  });

  socket.on('disconnect', () => {
    if (waitingPlayer?.id === socket.id) {
        waitingPlayer = null;
    }
    console.log('user disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
