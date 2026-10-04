import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Pool } from 'pg';

import type { Room } from './types';

export type GuestIdentity = {
  playerId: string;
  displayName: string;
  sessionToken: string;
};

export type StoredChatMessage = {
  playerId: string;
  playerName: string;
  message: string;
  createdAt: string;
};

export interface LudoStore {
  initialize(): Promise<void>;
  health(): Promise<boolean>;
  close(): Promise<void>;
  createGuestSession(displayName: string): Promise<GuestIdentity>;
  resolveSession(sessionToken: string): Promise<Omit<GuestIdentity, 'sessionToken'> | null>;
  loadRooms(): Promise<Room[]>;
  saveRoom(room: Room): Promise<void>;
  removeExpiredRooms(now?: number): Promise<string[]>;
  appendChat(roomCode: string, message: StoredChatMessage): Promise<void>;
  loadChat(roomCode: string, limit: number): Promise<StoredChatMessage[]>;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class MemoryLudoStore implements LudoStore {
  private readonly sessions = new Map<string, { playerId: string; displayName: string }>();
  private readonly rooms = new Map<string, Room>();
  private readonly chat = new Map<string, StoredChatMessage[]>();

  async initialize(): Promise<void> {}
  async health(): Promise<boolean> { return true; }
  async close(): Promise<void> {}

  async createGuestSession(displayName: string): Promise<GuestIdentity> {
    const playerId = randomUUID();
    const sessionToken = randomBytes(32).toString('base64url');
    this.sessions.set(hashToken(sessionToken), { playerId, displayName });
    return { playerId, displayName, sessionToken };
  }

  async resolveSession(sessionToken: string): Promise<Omit<GuestIdentity, 'sessionToken'> | null> {
    return this.sessions.get(hashToken(sessionToken)) ?? null;
  }

  async loadRooms(): Promise<Room[]> { return [...this.rooms.values()]; }
  async saveRoom(room: Room): Promise<void> { this.rooms.set(room.code, structuredClone(room)); }

  async removeExpiredRooms(now: number = Date.now()): Promise<string[]> {
    const expired = [...this.rooms.values()]
      .filter((room) => now - Date.parse(room.createdAt) >= 24 * 60 * 60 * 1000)
      .map((room) => room.code);
    expired.forEach((code) => {
      this.rooms.delete(code);
      this.chat.delete(code);
    });
    return expired;
  }

  async appendChat(roomCode: string, message: StoredChatMessage): Promise<void> {
    const history = this.chat.get(roomCode) ?? [];
    history.push(message);
    this.chat.set(roomCode, history.slice(-100));
  }

  async loadChat(roomCode: string, limit: number): Promise<StoredChatMessage[]> {
    return (this.chat.get(roomCode) ?? []).slice(-limit);
  }
}

export class PostgresLudoStore implements LudoStore {
  private readonly pool: Pool;

  constructor(connectionString: string, useTls: boolean = process.env.NODE_ENV === 'production') {
    this.pool = new Pool({
      connectionString,
      max: 20,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30_000,
      ssl: useTls ? { rejectUnauthorized: true } : undefined,
    });
  }

  async initialize(): Promise<void> {
    await this.pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
      const migration = await client.query('SELECT 1 FROM schema_migrations WHERE version = 1');
      if (migration.rowCount === 0) {
        const sql = await readFile(join(process.cwd(), 'migrations', '001_initial.sql'), 'utf8');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES (1)');
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async health(): Promise<boolean> {
    await this.pool.query('SELECT 1');
    return true;
  }

  async close(): Promise<void> { await this.pool.end(); }

  async createGuestSession(displayName: string): Promise<GuestIdentity> {
    const playerId = randomUUID();
    const sessionToken = randomBytes(32).toString('base64url');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO game_users (id, display_name, guest) VALUES ($1, $2, true)', [playerId, displayName]);
      await client.query(
        'INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval \'30 days\')',
        [hashToken(sessionToken), playerId],
      );
      await client.query('COMMIT');
      return { playerId, displayName, sessionToken };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async resolveSession(sessionToken: string): Promise<Omit<GuestIdentity, 'sessionToken'> | null> {
    const result = await this.pool.query(
      `SELECT u.id, u.display_name
       FROM user_sessions s JOIN game_users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND s.revoked_at IS NULL`,
      [hashToken(sessionToken)],
    );
    const row = result.rows[0];
    return row ? { playerId: row.id, displayName: row.display_name } : null;
  }

  async loadRooms(): Promise<Room[]> {
    const result = await this.pool.query('SELECT state FROM game_rooms WHERE expires_at > now()');
    return result.rows.map((row) => row.state as Room);
  }

  async saveRoom(room: Room): Promise<void> {
    await this.pool.query(
      `INSERT INTO game_rooms (room_code, host_user_id, state, expires_at)
       VALUES ($1, $2, $3::jsonb, to_timestamp($4 / 1000.0) + interval '24 hours')
       ON CONFLICT (room_code) DO UPDATE
       SET host_user_id = EXCLUDED.host_user_id, state = EXCLUDED.state,
           expires_at = EXCLUDED.expires_at, updated_at = now()`,
      [room.code, room.hostId, JSON.stringify(room), Date.parse(room.createdAt)],
    );
  }

  async removeExpiredRooms(now: number = Date.now()): Promise<string[]> {
    const result = await this.pool.query(
      'DELETE FROM game_rooms WHERE expires_at <= to_timestamp($1 / 1000.0) RETURNING room_code',
      [now],
    );
    return result.rows.map((row) => row.room_code as string);
  }

  async appendChat(roomCode: string, message: StoredChatMessage): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO room_messages (id, room_code, sender_user_id, sender_name, body, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [randomUUID(), roomCode, message.playerId, message.playerName, message.message, message.createdAt],
      );
      await client.query(
        `DELETE FROM room_messages WHERE room_code = $1 AND id IN (
           SELECT id FROM room_messages WHERE room_code = $1
           ORDER BY created_at DESC, id DESC OFFSET 100
         )`,
        [roomCode],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async loadChat(roomCode: string, limit: number): Promise<StoredChatMessage[]> {
    const result = await this.pool.query(
      `SELECT sender_user_id AS "playerId", sender_name AS "playerName", body AS message, created_at AS "createdAt"
       FROM (SELECT sender_user_id, sender_name, body, created_at FROM room_messages
             WHERE room_code = $1 ORDER BY created_at DESC LIMIT $2) recent
       ORDER BY created_at ASC`,
      [roomCode, limit],
    );
    return result.rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt).toISOString() }));
  }
}