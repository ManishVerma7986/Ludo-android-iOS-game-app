import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialGameState } from '../src/game-engine';
import { MemoryLudoStore } from '../src/store';
import type { Room } from '../src/types';

test('guest sessions return an opaque token and resolve only that token', async () => {
  const store = new MemoryLudoStore();
  const session = await store.createGuestSession('Guest One');

  assert.ok(session.sessionToken.length >= 40);
  assert.equal((await store.resolveSession(session.sessionToken))?.playerId, session.playerId);
  assert.equal(await store.resolveSession(`${session.sessionToken}wrong`), null);
});

test('room snapshots and bounded chat survive store reads', async () => {
  const store = new MemoryLudoStore();
  const room: Room = {
    id: 'room-id',
    code: '12345678',
    hostId: 'player-id',
    state: 'waiting',
    createdAt: new Date().toISOString(),
    players: [{
      id: 'player-id', displayName: 'Player', avatar: '', avatarColor: '#112233',
      ready: false, isHost: true, status: 'waiting', connected: true,
    }],
    settings: { maxPlayers: 4, turnTimerSeconds: 30, allowSpectators: false },
  };
  room.gameState = createInitialGameState(room.players);
  await store.saveRoom(room);
  await store.appendChat(room.code, {
    playerId: 'player-id', playerName: 'Player', message: 'hello', createdAt: new Date().toISOString(),
  });

  assert.deepEqual((await store.loadRooms())[0], room);
  assert.equal((await store.loadChat(room.code, 100))[0].message, 'hello');
});