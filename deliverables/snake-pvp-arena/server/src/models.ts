export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Cell {
  x: number;
  y: number;
}

export interface UserRecord {
  id: string;
  username: string;
  usernameLower: string;
  passwordHash: string;
  createdAt: string;
  bestScore: number;
  wins: number;
  losses: number;
}

export interface MatchParticipant {
  userId: string;
  username: string;
  score: number;
  outcome: 'win' | 'loss' | 'draw';
}

export interface MatchRecord {
  id: string;
  roomCode: string;
  playedAt: string;
  winnerUserId: string | null;
  winnerUsername: string | null;
  reason: string;
  participants: MatchParticipant[];
}

export interface DatabaseShape {
  users: UserRecord[];
  matches: MatchRecord[];
}

export interface PublicUser {
  id: string;
  username: string;
  createdAt: string;
  bestScore: number;
  wins: number;
  losses: number;
}

export interface ProfilePayload {
  user: PublicUser;
  recentMatches: MatchRecord[];
}

export interface AuthenticatedUser {
  userId: string;
  username: string;
}

export interface RoomPlayerSnapshot {
  userId: string;
  username: string;
  color: string;
  connected: boolean;
}

export interface SnakeSnapshot {
  userId: string;
  username: string;
  color: string;
  body: Cell[];
  direction: Direction;
  score: number;
  alive: boolean;
}

export interface RoomSnapshot {
  roomCode: string;
  status: 'waiting' | 'countdown' | 'playing' | 'finished';
  createdAt: string;
  tick: number;
  countdown: number | null;
  grid: {
    width: number;
    height: number;
  };
  players: RoomPlayerSnapshot[];
  snakes: SnakeSnapshot[];
  food: Cell | null;
  winner: {
    userId: string;
    username: string;
  } | null;
  reason: string | null;
}

export const GRID_WIDTH = 24;
export const GRID_HEIGHT = 24;
export const TICK_MS = 150;
