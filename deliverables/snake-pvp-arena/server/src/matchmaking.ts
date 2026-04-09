import { Server, Socket } from 'socket.io';
import { SnakeArenaService } from './game.js';
import { AuthenticatedUser } from './models.js';

interface QueueEntry {
  user: AuthenticatedUser;
  socket: Socket;
  joinedAt: number;
}

export class MatchmakingQueue {
  private readonly io: Server;
  private readonly arena: SnakeArenaService;
  private readonly queue = new Map<string, QueueEntry>();
  private timer: NodeJS.Timeout | null = null;

  constructor(io: Server, arena: SnakeArenaService) {
    this.io = io;
    this.arena = arena;
    this.timer = setInterval(() => this.tryMatch(), 1000);
  }

  addToQueue(user: AuthenticatedUser, socket: Socket): void {
    if (this.queue.has(user.userId)) return;

    this.queue.set(user.userId, {
      user,
      socket,
      joinedAt: Date.now()
    });

    this.broadcastPositions();
    this.tryMatch();
  }

  removeFromQueue(userId: string): void {
    this.queue.delete(userId);
    this.broadcastPositions();
  }

  private tryMatch(): void {
    const entries = Array.from(this.queue.values());
    if (entries.length < 2) return;

    const [a, b] = entries;

    // Create room for player A
    const createResult = this.arena.createRoom(a.user, a.socket);
    if (!createResult.ok || !createResult.roomCode) return;

    // Player B joins
    const joinResult = this.arena.joinRoom(b.user, b.socket, createResult.roomCode);
    if (!joinResult.ok) return;

    // Notify both players
    a.socket.emit('match:found', { roomCode: createResult.roomCode });
    b.socket.emit('match:found', { roomCode: createResult.roomCode });

    this.queue.delete(a.user.userId);
    this.queue.delete(b.user.userId);
    this.broadcastPositions();
  }

  private broadcastPositions(): void {
    let position = 1;
    for (const entry of this.queue.values()) {
      entry.socket.emit('match:status', { position });
      position++;
    }
  }
}
