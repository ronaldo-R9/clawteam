import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  DatabaseShape,
  MatchRecord,
  ProfilePayload,
  PublicUser,
  UserRecord
} from './models.js';

const EMPTY_DB: DatabaseShape = {
  users: [],
  matches: []
};

export class FileDatabase {
  private readonly filePath: string;
  private data: DatabaseShape;

  constructor(filePath: string) {
    this.filePath = filePath;
    mkdirSync(dirname(filePath), { recursive: true });

    try {
      const raw = readFileSync(filePath, 'utf8');
      this.data = JSON.parse(raw) as DatabaseShape;
    } catch {
      this.data = EMPTY_DB;
      this.persist();
    }
  }

  listUsers(): PublicUser[] {
    return this.data.users.map((user) => this.toPublicUser(user));
  }

  findUserByUsername(username: string): UserRecord | undefined {
    const usernameLower = username.trim().toLowerCase();
    return this.data.users.find((user) => user.usernameLower === usernameLower);
  }

  findUserById(userId: string): UserRecord | undefined {
    return this.data.users.find((user) => user.id === userId);
  }

  createUser(username: string, passwordHash: string): PublicUser {
    const usernameLower = username.trim().toLowerCase();
    const existing = this.data.users.find((user) => user.usernameLower === usernameLower);

    if (existing) {
      throw new Error('用户名已存在');
    }

    const newUser: UserRecord = {
      id: randomUUID(),
      username: username.trim(),
      usernameLower,
      passwordHash,
      createdAt: new Date().toISOString(),
      bestScore: 0,
      wins: 0,
      losses: 0
    };

    this.data.users.push(newUser);
    this.persist();

    return this.toPublicUser(newUser);
  }

  buildProfile(userId: string): ProfilePayload {
    const user = this.findUserById(userId);

    if (!user) {
      throw new Error('用户不存在');
    }

    const recentMatches = this.data.matches
      .filter((match) => match.participants.some((participant) => participant.userId === userId))
      .sort((left, right) => right.playedAt.localeCompare(left.playedAt))
      .slice(0, 6);

    return {
      user: this.toPublicUser(user),
      recentMatches
    };
  }

  recordMatch(match: Omit<MatchRecord, 'id' | 'playedAt'>): MatchRecord {
    const savedMatch: MatchRecord = {
      id: randomUUID(),
      playedAt: new Date().toISOString(),
      ...match
    };

    this.data.matches.unshift(savedMatch);
    this.data.matches = this.data.matches.slice(0, 50);

    for (const participant of savedMatch.participants) {
      const user = this.findUserById(participant.userId);

      if (!user) {
        continue;
      }

      user.bestScore = Math.max(user.bestScore, participant.score);

      if (participant.outcome === 'win') {
        user.wins += 1;
      } else if (participant.outcome === 'loss') {
        user.losses += 1;
      }
    }

    this.persist();
    return savedMatch;
  }

  private toPublicUser(user: UserRecord): PublicUser {
    return {
      id: user.id,
      username: user.username,
      createdAt: user.createdAt,
      bestScore: user.bestScore,
      wins: user.wins,
      losses: user.losses
    };
  }

  private persist(): void {
    const tempPath = `${this.filePath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(this.data, null, 2));
    renameSync(tempPath, this.filePath);

    try {
      unlinkSync(tempPath);
    } catch {
      // temp file is normally removed by rename; ignore cleanup failure
    }
  }
}
