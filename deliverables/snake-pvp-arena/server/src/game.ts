import { randomInt } from 'node:crypto';
import { Server, Socket } from 'socket.io';
import {
  AuthenticatedUser,
  Cell,
  Direction,
  GRID_HEIGHT,
  GRID_WIDTH,
  RoomPlayerSnapshot,
  RoomSnapshot,
  SnakeSnapshot,
  TICK_MS
} from './models.js';
import { FileDatabase } from './storage.js';

interface PlayerRuntime extends RoomPlayerSnapshot {
  socketId: string;
}

interface SnakeRuntime extends SnakeSnapshot {
  pendingDirection: Direction;
}

interface RoomRuntime {
  roomCode: string;
  createdAt: string;
  status: 'waiting' | 'countdown' | 'playing' | 'finished';
  players: PlayerRuntime[];
  spectators: Set<string>;
  snakes: SnakeRuntime[];
  food: Cell | null;
  tick: number;
  countdown: number | null;
  countdownTimer: NodeJS.Timeout | null;
  winner: {
    userId: string;
    username: string;
  } | null;
  reason: string | null;
  interval: NodeJS.Timeout | null;
  rematchRequests: Set<string>;
}

interface AckResponse {
  ok: boolean;
  error?: string;
  roomCode?: string;
  state?: RoomSnapshot;
}

const PLAYER_COLORS = ['#f97316', '#14b8a6'];
const STARTING_SNAKES: Array<{ body: Cell[]; direction: Direction }> = [
  {
    body: [
      { x: 5, y: 12 },
      { x: 4, y: 12 },
      { x: 3, y: 12 },
      { x: 2, y: 12 }
    ],
    direction: 'right'
  },
  {
    body: [
      { x: 18, y: 12 },
      { x: 19, y: 12 },
      { x: 20, y: 12 },
      { x: 21, y: 12 }
    ],
    direction: 'left'
  }
];

export class SnakeArenaService {
  private readonly io: Server;
  private readonly database: FileDatabase;
  private readonly rooms = new Map<string, RoomRuntime>();
  private readonly playerRooms = new Map<string, string>();

  constructor(io: Server, database: FileDatabase) {
    this.io = io;
    this.database = database;
  }

  createRoom(user: AuthenticatedUser, socket: Socket): AckResponse {
    if (this.playerRooms.has(user.userId)) {
      const roomCode = this.playerRooms.get(user.userId) as string;
      const room = this.rooms.get(roomCode);
      if (room) {
        return { ok: true, roomCode, state: this.snapshot(room) };
      }
      this.playerRooms.delete(user.userId);
    }

    const roomCode = this.generateRoomCode();
    const room: RoomRuntime = {
      roomCode,
      createdAt: new Date().toISOString(),
      status: 'waiting',
      players: [
        {
          userId: user.userId,
          username: user.username,
          color: PLAYER_COLORS[0],
          connected: true,
          socketId: socket.id
        }
      ],
      spectators: new Set(),
      snakes: [],
      food: null,
      tick: 0,
      countdown: null,
      countdownTimer: null,
      winner: null,
      reason: null,
      interval: null,
      rematchRequests: new Set()
    };

    this.rooms.set(roomCode, room);
    this.playerRooms.set(user.userId, roomCode);
    socket.join(roomCode);
    this.emitUpdate(room);
    return { ok: true, roomCode, state: this.snapshot(room) };
  }

  joinRoom(user: AuthenticatedUser, socket: Socket, requestedCode: string): AckResponse {
    const roomCode = requestedCode.trim().toUpperCase();
    const room = this.rooms.get(roomCode);

    if (!room) {
      return { ok: false, error: '房间不存在' };
    }

    if (this.playerRooms.has(user.userId) && this.playerRooms.get(user.userId) !== roomCode) {
      return { ok: false, error: '你已经在另一个房间中' };
    }

    const existingPlayer = room.players.find((player) => player.userId === user.userId);
    if (existingPlayer) {
      existingPlayer.socketId = socket.id;
      existingPlayer.connected = true;
      socket.join(roomCode);
      this.emitUpdate(room);
      return { ok: true, roomCode, state: this.snapshot(room) };
    }

    if (room.status !== 'waiting') {
      return { ok: false, error: '该房间对局已开始或结束' };
    }

    if (room.players.length >= 2) {
      return { ok: false, error: '房间已满' };
    }

    room.players.push({
      userId: user.userId,
      username: user.username,
      color: PLAYER_COLORS[1],
      connected: true,
      socketId: socket.id
    });
    this.playerRooms.set(user.userId, roomCode);
    socket.join(roomCode);
    this.startCountdown(room);
    this.emitUpdate(room);

    return { ok: true, roomCode, state: this.snapshot(room) };
  }

  watchRoom(user: AuthenticatedUser, socket: Socket, roomCode: string): AckResponse {
    const normalizedCode = roomCode.trim().toUpperCase();
    const room = this.rooms.get(normalizedCode);

    if (!room) {
      return { ok: false, error: '房间不存在或已失效' };
    }

    const player = room.players.find((entry) => entry.userId === user.userId);

    if (player) {
      player.socketId = socket.id;
      player.connected = true;
    } else {
      room.spectators.add(socket.id);
    }

    socket.join(normalizedCode);
    this.emitUpdate(room);

    return { ok: true, roomCode: normalizedCode, state: this.snapshot(room) };
  }

  requestRematch(user: AuthenticatedUser): { ok: boolean; started?: boolean } {
    const roomCode = this.playerRooms.get(user.userId);
    if (!roomCode) return { ok: false };

    const room = this.rooms.get(roomCode);
    if (!room || room.status !== 'finished') return { ok: false };

    room.rematchRequests.add(user.userId);

    // Notify room about rematch request
    this.io.to(roomCode).emit('rematch:requested', { userId: user.userId });

    // Check if all players want rematch
    const allPlayersWant = room.players.every((p) => room.rematchRequests.has(p.userId));
    if (allPlayersWant && room.players.length === 2) {
      room.rematchRequests.clear();
      this.startCountdown(room);
      return { ok: true, started: true };
    }

    return { ok: true, started: false };
  }

  setDirection(user: AuthenticatedUser, direction: Direction): void {
    const roomCode = this.playerRooms.get(user.userId);

    if (!roomCode) {
      return;
    }

    const room = this.rooms.get(roomCode);

    if (!room || room.status !== 'playing') {
      return;
    }

    const snake = room.snakes.find((entry) => entry.userId === user.userId);

    if (!snake || !snake.alive || isOpposite(snake.direction, direction)) {
      return;
    }

    snake.pendingDirection = direction;
  }

  leaveRoom(user: AuthenticatedUser, socketId?: string): void {
    const roomCode = this.playerRooms.get(user.userId);

    if (!roomCode) {
      return;
    }

    const room = this.rooms.get(roomCode);

    if (!room) {
      this.playerRooms.delete(user.userId);
      return;
    }

    const playerIndex = room.players.findIndex((player) => player.userId === user.userId);

    if (playerIndex === -1) {
      this.playerRooms.delete(user.userId);
      return;
    }

    if (socketId && room.players[playerIndex].socketId !== socketId) {
      return;
    }

    if (room.status === 'playing' || room.status === 'countdown') {
      this.finishRoom(room, 'opponent_left', user.userId);
      return;
    }

    room.players.splice(playerIndex, 1);
    this.playerRooms.delete(user.userId);

    if (room.players.length === 0) {
      this.destroyRoom(room.roomCode);
      return;
    }

    this.emitUpdate(room);
  }

  handleDisconnect(user: AuthenticatedUser, socketId: string): void {
    const roomCode = this.playerRooms.get(user.userId);

    if (!roomCode) {
      return;
    }

    const room = this.rooms.get(roomCode);

    if (!room) {
      this.playerRooms.delete(user.userId);
      return;
    }

    const player = room.players.find((entry) => entry.userId === user.userId);

    if (!player || player.socketId !== socketId) {
      return;
    }

    if (room.status === 'playing' || room.status === 'countdown') {
      this.finishRoom(room, 'disconnect', user.userId);
      return;
    }

    player.connected = false;
    this.leaveRoom(user, socketId);
  }

  private startCountdown(room: RoomRuntime): void {
    room.status = 'countdown';
    room.countdown = 3;
    room.reason = null;
    room.winner = null;
    room.snakes = room.players.map((player, index) => ({
      userId: player.userId,
      username: player.username,
      color: player.color,
      body: structuredClone(STARTING_SNAKES[index].body),
      direction: STARTING_SNAKES[index].direction,
      pendingDirection: STARTING_SNAKES[index].direction,
      score: 0,
      alive: true
    }));
    room.food = this.spawnFood(room.snakes);
    this.emitUpdate(room);

    room.countdownTimer = setInterval(() => {
      if (room.countdown === null || room.countdown <= 1) {
        if (room.countdownTimer) {
          clearInterval(room.countdownTimer);
          room.countdownTimer = null;
        }
        room.countdown = null;
        this.startGame(room);
        return;
      }
      room.countdown -= 1;
      this.emitUpdate(room);
    }, 1000);
  }

  private startGame(room: RoomRuntime): void {
    room.status = 'playing';
    room.tick = 0;
    room.countdown = null;
    room.interval = setInterval(() => this.advanceRoom(room.roomCode), TICK_MS);
    this.emitUpdate(room);
  }

  private advanceRoom(roomCode: string): void {
    const room = this.rooms.get(roomCode);

    if (!room || room.status !== 'playing' || !room.food) {
      return;
    }

    room.tick += 1;

    const livingSnakes = room.snakes.filter((snake) => snake.alive);
    const plannedMoves = livingSnakes.map((snake) => {
      const nextDirection = isOpposite(snake.direction, snake.pendingDirection)
        ? snake.direction
        : snake.pendingDirection;
      const head = moveCell(snake.body[0], nextDirection);
      const willEat = isSameCell(head, room.food as Cell);
      return {
        snake,
        nextDirection,
        head,
        willEat
      };
    });

    for (const move of plannedMoves) {
      move.snake.direction = move.nextDirection;
      move.snake.pendingDirection = move.nextDirection;
    }

    const eliminated = new Set<string>();

    for (const move of plannedMoves) {
      if (isOutOfBounds(move.head)) {
        eliminated.add(move.snake.userId);
        continue;
      }

      const selfBody = move.snake.body.slice(0, move.snake.body.length - (move.willEat ? 0 : 1));
      if (selfBody.some((cell) => isSameCell(cell, move.head))) {
        eliminated.add(move.snake.userId);
        continue;
      }

      for (const otherMove of plannedMoves) {
        if (otherMove.snake.userId === move.snake.userId) {
          continue;
        }

        const otherBody = otherMove.snake.body.slice(
          0,
          otherMove.snake.body.length - (otherMove.willEat ? 0 : 1)
        );

        if (otherBody.some((cell) => isSameCell(cell, move.head))) {
          eliminated.add(move.snake.userId);
        }
      }
    }

    for (let index = 0; index < plannedMoves.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < plannedMoves.length; nextIndex += 1) {
        if (isSameCell(plannedMoves[index].head, plannedMoves[nextIndex].head)) {
          eliminated.add(plannedMoves[index].snake.userId);
          eliminated.add(plannedMoves[nextIndex].snake.userId);
        }
      }
    }

    if (eliminated.size > 0) {
      for (const snake of room.snakes) {
        if (eliminated.has(snake.userId)) {
          snake.alive = false;
        }
      }
      this.finishRoom(room, 'collision', null);
      return;
    }

    let ateFood = false;
    for (const move of plannedMoves) {
      const updatedBody = [move.head, ...move.snake.body];
      if (!move.willEat) {
        updatedBody.pop();
      } else {
        move.snake.score += 10;
        ateFood = true;
      }
      move.snake.body = updatedBody;
    }

    if (ateFood) {
      room.food = this.spawnFood(room.snakes);
    }

    this.emitUpdate(room);
  }

  private finishRoom(room: RoomRuntime, reason: string, forcedLoserUserId: string | null): void {
    if (room.status === 'finished') {
      return;
    }

    if (room.interval) {
      clearInterval(room.interval);
      room.interval = null;
    }

    if (room.countdownTimer) {
      clearInterval(room.countdownTimer);
      room.countdownTimer = null;
    }

    room.status = 'finished';
    room.reason = reason;

    let winnerUserId: string | null = null;

    if (forcedLoserUserId) {
      const survivor = room.players.find((player) => player.userId !== forcedLoserUserId);
      winnerUserId = survivor?.userId ?? null;
    } else {
      const aliveSnakes = room.snakes.filter((snake) => snake.alive);
      winnerUserId = aliveSnakes.length === 1 ? aliveSnakes[0].userId : null;
    }

    const winnerPlayer = room.players.find((player) => player.userId === winnerUserId) ?? null;
    room.winner = winnerPlayer
      ? {
          userId: winnerPlayer.userId,
          username: winnerPlayer.username
        }
      : null;

    const participants = room.snakes.map((snake) => ({
      userId: snake.userId,
      username: snake.username,
      score: snake.score,
      outcome: room.winner
        ? snake.userId === room.winner.userId
          ? 'win'
          : 'loss'
        : 'draw'
    })) as Array<{
      userId: string;
      username: string;
      score: number;
      outcome: 'win' | 'loss' | 'draw';
    }>;

    this.database.recordMatch({
      roomCode: room.roomCode,
      reason,
      winnerUserId: room.winner?.userId ?? null,
      winnerUsername: room.winner?.username ?? null,
      participants
    });

    this.emitUpdate(room);

    // Auto-cleanup finished rooms after 30 seconds
    setTimeout(() => this.destroyRoom(room.roomCode), 30_000);
  }

  private emitUpdate(room: RoomRuntime): void {
    this.io.to(room.roomCode).emit('room:update', this.snapshot(room));
  }

  private snapshot(room: RoomRuntime): RoomSnapshot {
    return {
      roomCode: room.roomCode,
      status: room.status,
      createdAt: room.createdAt,
      tick: room.tick,
      countdown: room.countdown,
      grid: {
        width: GRID_WIDTH,
        height: GRID_HEIGHT
      },
      players: room.players.map((player) => ({
        userId: player.userId,
        username: player.username,
        color: player.color,
        connected: player.connected
      })),
      snakes: room.snakes.map((snake) => ({
        userId: snake.userId,
        username: snake.username,
        color: snake.color,
        body: snake.body,
        direction: snake.direction,
        score: snake.score,
        alive: snake.alive
      })),
      food: room.food,
      winner: room.winner,
      reason: room.reason
    };
  }

  private spawnFood(snakes: SnakeRuntime[]): Cell {
    while (true) {
      const candidate = {
        x: randomInt(0, GRID_WIDTH),
        y: randomInt(0, GRID_HEIGHT)
      };

      const occupied = snakes.some((snake) =>
        snake.body.some((segment) => isSameCell(segment, candidate))
      );

      if (!occupied) {
        return candidate;
      }
    }
  }

  private destroyRoom(roomCode: string): void {
    const room = this.rooms.get(roomCode);

    if (room?.interval) {
      clearInterval(room.interval);
    }

    if (room?.countdownTimer) {
      clearInterval(room.countdownTimer);
    }

    if (room) {
      for (const player of room.players) {
        this.playerRooms.delete(player.userId);
      }
    }

    this.rooms.delete(roomCode);
  }

  private generateRoomCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    while (true) {
      let code = '';
      for (let index = 0; index < 5; index += 1) {
        code += alphabet[randomInt(0, alphabet.length)];
      }
      if (!this.rooms.has(code)) {
        return code;
      }
    }
  }
}

function moveCell(cell: Cell, direction: Direction): Cell {
  switch (direction) {
    case 'up':
      return { x: cell.x, y: cell.y - 1 };
    case 'down':
      return { x: cell.x, y: cell.y + 1 };
    case 'left':
      return { x: cell.x - 1, y: cell.y };
    case 'right':
      return { x: cell.x + 1, y: cell.y };
  }
}

function isOutOfBounds(cell: Cell): boolean {
  return cell.x < 0 || cell.x >= GRID_WIDTH || cell.y < 0 || cell.y >= GRID_HEIGHT;
}

function isSameCell(left: Cell, right: Cell): boolean {
  return left.x === right.x && left.y === right.y;
}

function isOpposite(current: Direction, next: Direction): boolean {
  return (
    (current === 'up' && next === 'down') ||
    (current === 'down' && next === 'up') ||
    (current === 'left' && next === 'right') ||
    (current === 'right' && next === 'left')
  );
}
