import { randomInt, randomUUID } from 'node:crypto';

import { createInitialGameState, getLegalTokenIndices, moveTokenForPlayer, rollDiceForTurn } from './game-engine';
import type { CreateRoomRequest, GameMove, GameState, JoinRoomRequest, Player, Room, RoomSettings } from './types';

const ROOM_CODE_LENGTH = 8;
const MAX_ACTIVE_ROOMS = 1000;
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SETTINGS: RoomSettings = {
  maxPlayers: 4,
  turnTimerSeconds: 30,
  allowSpectators: false,
};

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  public createRoom(input: CreateRoomRequest, playerId: string = randomUUID()): Room {
    if (this.rooms.size >= MAX_ACTIVE_ROOMS) {
      throw new Error('ROOM_CAPACITY_REACHED');
    }

    const code = this.generateUniqueCode();
    const host: Player = {
      id: playerId,
      displayName: input.displayName.trim(),
      avatar: input.avatar ?? 'https://api.dicebear.com/7.x/adventurer/svg?seed=host',
      avatarColor: input.avatarColor ?? '#f59e0b',
      ready: false,
      isHost: true,
      status: 'waiting',
      connected: true,
    };

    const room: Room = {
      id: randomUUID(),
      code,
      hostId: host.id,
      state: 'waiting',
      createdAt: new Date().toISOString(),
      players: [host],
      settings: DEFAULT_SETTINGS,
    };

    this.rooms.set(code, room);
    return room;
  }

  public joinRoom(input: JoinRoomRequest, socketPlayerId: string = randomUUID()): Room {
    const room = this.rooms.get(input.roomCode);
    if (!room) {
      throw new Error('INVALID_ROOM_CODE');
    }

    const existingPlayer = room.players.find((player) => player.id === socketPlayerId);
    if (existingPlayer) {
      existingPlayer.connected = true;
      existingPlayer.status = room.state === 'playing' ? 'playing' : 'waiting';
      return room;
    }

    if (room.state !== 'waiting') {
      throw new Error('ROOM_ALREADY_STARTED');
    }

    if (room.players.length >= room.settings.maxPlayers) {
      throw new Error('ROOM_FULL');
    }

    const duplicate = room.players.some((player) => player.displayName === input.displayName.trim());
    if (duplicate) {
      throw new Error('PLAYER_ALREADY_IN_ROOM');
    }

    const player: Player = {
      id: socketPlayerId,
      displayName: input.displayName.trim(),
      avatar: input.avatar ?? 'https://api.dicebear.com/7.x/adventurer/svg?seed=player',
      avatarColor: input.avatarColor ?? '#22c55e',
      ready: false,
      isHost: false,
      status: 'waiting',
      connected: true,
    };

    room.players.push(player);
    const host = room.players.find((entry) => entry.id === room.hostId);
    if (!host?.connected) {
      if (host) host.isHost = false;
      room.hostId = player.id;
      player.isHost = true;
    }
    return room;
  }

  public leaveRoom(roomCode: string, playerId: string): Room | null {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return null;
    }

    const filtered = room.players.filter((player) => player.id !== playerId);
    if (filtered.length === 0) {
      this.rooms.delete(roomCode);
      return null;
    }

    room.players = filtered;
    if (room.hostId === playerId) {
      room.hostId = room.players[0].id;
      room.players[0].isHost = true;
    }

    return room;
  }

  public startGame(roomCode: string): Room {
    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new Error('ROOM_NOT_FOUND');
    }

    if (room.players.filter((player) => player.connected).length < 2) {
      throw new Error('MIN_PLAYERS_NOT_REACHED');
    }

    if (room.state !== 'waiting') {
      throw new Error('ROOM_ALREADY_STARTED');
    }

    room.state = 'playing';
    room.startedAt = new Date().toISOString();
    room.gameState = createInitialGameState(room.players);
    room.gameState.phase = 'playing';
    room.players.forEach((player) => {
      player.status = 'playing';
      player.ready = true;
    });
    return room;
  }

  public rollDice(
    roomCode: string,
    playerId: string,
    roll: () => number = () => randomInt(1, 7),
  ): { diceValue: number; legalMoves: number[] } {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'playing' || !room.gameState || room.gameState.phase !== 'playing') {
      throw new Error('GAME_NOT_STARTED');
    }

    const currentPlayer = room.gameState.players[room.gameState.currentTurnIndex];
    if (!currentPlayer || currentPlayer.playerId !== playerId) {
      throw new Error('NOT_YOUR_TURN');
    }

    if (room.gameState.legalMoves.length > 0) {
      throw new Error('MOVE_REQUIRED');
    }

    const diceValue = rollDiceForTurn(room.gameState, roll);
    if (room.gameState.consecutiveSixes >= 3) {
      room.gameState.consecutiveSixes = 0;
      room.gameState.diceValue = 0;
      room.gameState.currentTurnIndex = (room.gameState.currentTurnIndex + 1) % room.gameState.players.length;
      return { diceValue, legalMoves: [] };
    }
    const legalMoves = getLegalTokenIndices(room.gameState, playerId, diceValue);
    room.gameState.legalMoves = legalMoves;
    if (legalMoves.length === 0) {
      room.gameState.currentTurnIndex = (room.gameState.currentTurnIndex + 1) % room.gameState.players.length;
      room.gameState.diceValue = 0;
    }
    return { diceValue, legalMoves };
  }

  public moveToken(roomCode: string, playerId: string, tokenIndex: number): GameMove {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'playing' || !room.gameState || room.gameState.phase !== 'playing') {
      throw new Error('GAME_NOT_STARTED');
    }

    const currentPlayer = room.gameState.players[room.gameState.currentTurnIndex];
    if (!currentPlayer || currentPlayer.playerId !== playerId) {
      throw new Error('NOT_YOUR_TURN');
    }

    if (!room.gameState.legalMoves.includes(tokenIndex)) {
      throw new Error('ILLEGAL_MOVE');
    }

    const move = moveTokenForPlayer(room.gameState, playerId, tokenIndex, room.gameState.diceValue);
    if (!move) {
      throw new Error('ILLEGAL_MOVE');
    }

    room.gameState.legalMoves = [];
    if (room.gameState.winnerId !== null) {
      room.state = 'finished';
    }
    return move;
  }

  public getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode);
  }

  public restoreRoom(room: Room): void {
    this.rooms.set(room.code, room);
  }

  public removeRoom(roomCode: string): void {
    this.rooms.delete(roomCode);
  }

  public restoreRooms(rooms: Room[]): void {
    this.rooms.clear();
    for (const room of rooms.slice(0, MAX_ACTIVE_ROOMS)) {
      for (const player of room.players) {
        player.connected = false;
        player.status = 'offline';
      }
      this.rooms.set(room.code, room);
    }
  }

  public getRoomsForPlayer(playerId: string): Room[] {
    return [...this.rooms.values()].filter((room) => room.players.some((player) => player.id === playerId));
  }

  public markPlayerConnected(playerId: string): Room[] {
    const changedRooms: Room[] = [];
    for (const room of this.rooms.values()) {
      const player = room.players.find((entry) => entry.id === playerId);
      if (!player) continue;
      player.connected = true;
      player.status = room.state === 'playing' ? 'playing' : 'waiting';
      changedRooms.push(room);
    }
    return changedRooms;
  }

  public markPlayerDisconnected(playerId: string): Room[] {
    const changedRooms: Room[] = [];
    for (const room of this.rooms.values()) {
      const player = room.players.find((entry) => entry.id === playerId);
      if (!player) continue;

      player.connected = false;
      player.status = 'offline';
      if (room.hostId === playerId) {
        const nextHost = room.players.find((entry) => entry.connected);
        if (nextHost) {
          room.hostId = nextHost.id;
          nextHost.isHost = true;
          player.isHost = false;
        }
      }
      if (room.state === 'playing' && room.gameState) {
        const currentPlayer = room.gameState.players[room.gameState.currentTurnIndex];
        if (currentPlayer?.playerId === playerId) {
          room.gameState.legalMoves = [];
          room.gameState.diceValue = 0;
          for (let offset = 1; offset <= room.gameState.players.length; offset += 1) {
            const nextIndex = (room.gameState.currentTurnIndex + offset) % room.gameState.players.length;
            const nextPlayer = room.players.find((entry) => entry.id === room.gameState!.players[nextIndex].playerId);
            if (nextPlayer?.connected) {
              room.gameState.currentTurnIndex = nextIndex;
              break;
            }
          }
        }
      }
      changedRooms.push(room);
    }
    return changedRooms;
  }

  public isValidRoomCode(roomCode: string): boolean {
    return /^[0-9]{8}$/.test(roomCode) && this.rooms.has(roomCode);
  }

  public removeExpiredRooms(now: number = Date.now()): string[] {
    const expiredRoomCodes: string[] = [];
    for (const [roomCode, room] of this.rooms) {
      if (now - Date.parse(room.createdAt) >= ROOM_TTL_MS) {
        this.rooms.delete(roomCode);
        expiredRoomCodes.push(roomCode);
      }
    }
    return expiredRoomCodes;
  }

  private generateUniqueCode(): string {
    let candidate = '';
    do {
      candidate = Array.from({ length: ROOM_CODE_LENGTH }, () => String(randomInt(0, 10))).join('');
    } while (this.rooms.has(candidate));

    return candidate;
  }
}
