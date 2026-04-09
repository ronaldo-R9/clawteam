import { createServer } from 'node:http';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';
import { SnakeArenaService } from './game.js';
import { AuthenticatedUser, Direction } from './models.js';
import { FileDatabase } from './storage.js';

dotenv.config();

const PORT = Number(process.env.PORT ?? 5000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET ?? 'snake-pvp-arena-dev-secret';
const database = new FileDatabase(join(process.cwd(), 'data', 'db.json'));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    credentials: true
  }
});

const arena = new SnakeArenaService(io, database);

app.use(
  cors({
    origin: CLIENT_ORIGIN
  })
);
app.use(express.json());

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    users: database.listUsers().length
  });
});

app.post('/api/auth/register', async (request, response) => {
  const username = normalizeUsername(request.body?.username);
  const password = String(request.body?.password ?? '');

  if (!username || !password) {
    return response.status(400).json({ message: '用户名和密码不能为空' });
  }

  if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
    return response.status(400).json({ message: '用户名需为 3-16 位字母、数字或下划线' });
  }

  if (password.length < 6) {
    return response.status(400).json({ message: '密码至少 6 位' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = database.createUser(username, passwordHash);
    const token = issueToken({ userId: user.id, username: user.username });
    return response.status(201).json({ token, user });
  } catch (error) {
    const message = error instanceof Error ? error.message : '注册失败';
    return response.status(409).json({ message });
  }
});

app.post('/api/auth/login', async (request, response) => {
  const username = normalizeUsername(request.body?.username);
  const password = String(request.body?.password ?? '');

  if (!username || !password) {
    return response.status(400).json({ message: '用户名和密码不能为空' });
  }

  const user = database.findUserByUsername(username);

  if (!user) {
    return response.status(401).json({ message: '用户名或密码错误' });
  }

  const matched = await bcrypt.compare(password, user.passwordHash);

  if (!matched) {
    return response.status(401).json({ message: '用户名或密码错误' });
  }

  const token = issueToken({ userId: user.id, username: user.username });
  return response.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      createdAt: user.createdAt,
      bestScore: user.bestScore,
      wins: user.wins,
      losses: user.losses
    }
  });
});

app.get('/api/auth/me', authenticateHttp, (request, response) => {
  const authUser = request.authUser as AuthenticatedUser;
  const profile = database.buildProfile(authUser.userId);
  response.json(profile.user);
});

app.get('/api/stats/me', authenticateHttp, (request, response) => {
  const authUser = request.authUser as AuthenticatedUser;
  const profile = database.buildProfile(authUser.userId);
  response.json(profile);
});

io.use((socket, next) => {
  try {
    const token = String(socket.handshake.auth.token ?? '');
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    const userId = String(payload.sub ?? '');
    const username = String(payload.username ?? '');

    if (!userId || !username) {
      next(new Error('登录已失效'));
      return;
    }

    socket.data.user = {
      userId,
      username
    } satisfies AuthenticatedUser;
    next();
  } catch {
    next(new Error('登录已失效'));
  }
});

io.on('connection', (socket) => {
  const user = socket.data.user as AuthenticatedUser;

  socket.on('room:create', (ack?: (payload: unknown) => void) => {
    const result = arena.createRoom(user, socket);
    ack?.(result);
  });

  socket.on('room:join', (payload: { roomCode?: string }, ack?: (body: unknown) => void) => {
    const result = arena.joinRoom(user, socket, String(payload?.roomCode ?? ''));
    ack?.(result);
  });

  socket.on('room:watch', (payload: { roomCode?: string }, ack?: (body: unknown) => void) => {
    const result = arena.watchRoom(user, socket, String(payload?.roomCode ?? ''));
    ack?.(result);
  });

  socket.on('room:leave', () => {
    arena.leaveRoom(user, socket.id);
  });

  socket.on('direction:set', (payload: { direction?: Direction }) => {
    const direction = payload?.direction;
    if (direction && ['up', 'down', 'left', 'right'].includes(direction)) {
      arena.setDirection(user, direction);
    }
  });

  socket.on('disconnect', () => {
    arena.handleDisconnect(user, socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Snake PvP Arena server listening on http://localhost:${PORT}`);
});

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
    }
  }
}

function issueToken(user: AuthenticatedUser): string {
  return jwt.sign({ username: user.username }, JWT_SECRET, {
    subject: user.userId,
    expiresIn: '7d'
  });
}

function authenticateHttp(request: Request, response: Response, next: () => void): void {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    response.status(401).json({ message: '未登录' });
    return;
  }

  try {
    const token = authorization.slice('Bearer '.length);
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    request.authUser = {
      userId: String(payload.sub ?? ''),
      username: String(payload.username ?? '')
    };
    next();
  } catch {
    response.status(401).json({ message: '登录已失效，请重新登录' });
  }
}

function normalizeUsername(value: unknown): string {
  return String(value ?? '').trim();
}
