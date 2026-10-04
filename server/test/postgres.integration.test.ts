import assert from 'node:assert/strict';
import test from 'node:test';

import { io as createSocket, type Socket } from 'socket.io-client';

import { createInitialGameState } from '../src/game-engine';
import { createLudoServer } from '../src/index';
import { PostgresLudoStore } from '../src/store';
import type { Room } from '../src/types';

const databaseUrl = process.env.TEST_DATABASE_URL;

function waitForEvent(socket: Socket, eventName: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${eventName}`)), 3000);
    socket.once(eventName, (payload: any) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

test('PostgreSQL migration persists guest sessions, room snapshots, and room chat', {
  skip: !databaseUrl,
}, async () => {
  const firstStore = new PostgresLudoStore(databaseUrl!);
  let session!: Awaited<ReturnType<typeof firstStore.createGuestSession>>;
  let room!: Room;
  try {
    await firstStore.initialize();
    session = await firstStore.createGuestSession('Database Guest');
    room = {
      id: 'postgres-integration-room',
      code: `${Math.floor(10000000 + Math.random() * 90000000)}`,
      hostId: session.playerId,
      state: 'waiting',
      createdAt: new Date().toISOString(),
      players: [{
        id: session.playerId,
        displayName: session.displayName,
        avatar: '',
        avatarColor: '#234567',
        ready: false,
        isHost: true,
        status: 'waiting',
        connected: true,
      }],
      settings: { maxPlayers: 4, turnTimerSeconds: 30, allowSpectators: false },
    };
    room.gameState = createInitialGameState(room.players);
    await firstStore.saveRoom(room);
    await firstStore.appendChat(room.code, {
      playerId: session.playerId,
      playerName: session.displayName,
      message: 'persisted chat',
      createdAt: new Date().toISOString(),
    });
  } finally {
    await firstStore.close();
  }

  const secondStore = new PostgresLudoStore(databaseUrl!);
  try {
    await secondStore.initialize();
    assert.equal((await secondStore.resolveSession(session.sessionToken))?.playerId, session.playerId);
    assert.deepEqual((await secondStore.loadRooms()).find((stored) => stored.code === room.code), room);
    assert.equal((await secondStore.loadChat(room.code, 100))[0].message, 'persisted chat');
  } finally {
    await secondStore.close();
  }

  const server = createLudoServer(new PostgresLudoStore(databaseUrl!));
  await server.ready;
  await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const client = createSocket(`http://127.0.0.1:${address.port}`, {
    transports: ['websocket'],
    reconnection: false,
    auth: { sessionToken: session.sessionToken },
  });
  try {
    const connected = waitForEvent(client, 'connect');
    const authenticated = waitForEvent(client, 'auth:success');
    const restoredRoom = waitForEvent(client, 'room:sync');
    const restoredChat = waitForEvent(client, 'chat:history');
    await connected;
    assert.equal((await authenticated).playerId, session.playerId);
    assert.equal((await restoredRoom).room.code, room.code);
    assert.equal((await restoredChat)[0].message, 'persisted chat');
  } finally {
    client.disconnect();
    await server.stop();
  }
});