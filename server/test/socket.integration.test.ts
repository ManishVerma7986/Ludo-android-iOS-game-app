import assert from 'node:assert/strict';
import test from 'node:test';

import { io as createSocket, type Socket } from 'socket.io-client';

import { createLudoServer } from '../src/index';
import { MemoryLudoStore } from '../src/store';

class FailOnceRoomStore extends MemoryLudoStore {
  failNextRoomWrite = false;

  override async saveRoom(room: Parameters<MemoryLudoStore['saveRoom']>[0]): Promise<void> {
    if (this.failNextRoomWrite) {
      this.failNextRoomWrite = false;
      throw new Error('database unavailable');
    }
    await super.saveRoom(room);
  }
}

function waitForEvent(
  socket: Socket,
  eventName: string,
  predicate: (payload: any) => boolean = () => true,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, 3_000);
    const onEvent = (payload: any) => {
      if (!predicate(payload)) return;
      clearTimeout(timeout);
      resolve(payload);
    };
    socket.on(eventName, onEvent);
  });
}

test('socket clients share authoritative room, game, and chat state', async () => {
  const server = createLudoServer();
  await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const serverUrl = `http://127.0.0.1:${address.port}`;
  const host = createSocket(serverUrl, { transports: ['websocket'], reconnection: false });
  const guest = createSocket(serverUrl, { transports: ['websocket'], reconnection: false });
  const intruder = createSocket(serverUrl, { transports: ['websocket'], reconnection: false });
  const anonymous = createSocket(serverUrl, { transports: ['websocket'], reconnection: false });
  let resumed: Socket | undefined;

  try {
    await server.ready;
    await Promise.all([
      waitForEvent(host, 'connect'),
      waitForEvent(guest, 'connect'),
      waitForEvent(intruder, 'connect'),
      waitForEvent(anonymous, 'connect'),
    ]);

    const hostAuthenticated = waitForEvent(host, 'auth:success');
    const guestAuthenticated = waitForEvent(guest, 'auth:success');
    const intruderAuthenticated = waitForEvent(intruder, 'auth:success');
    host.emit('auth:guest', { displayName: 'Host Player' });
    guest.emit('auth:guest', { displayName: 'Guest Player' });
    intruder.emit('auth:guest', { displayName: 'Intruder' });
    const [hostIdentity, guestIdentity] = await Promise.all([hostAuthenticated, guestAuthenticated]);
    await intruderAuthenticated;
    const hostPlayerId = hostIdentity.playerId as string;
    const guestPlayerId = guestIdentity.playerId as string;

    const anonymousDenied = waitForEvent(anonymous, 'app:error', (payload) => payload.code === 'AUTH_REQUIRED');
    anonymous.emit('room:create', {});
    await anonymousDenied;

    const unknownRoom = waitForEvent(guest, 'app:error', (payload) => payload.code === 'INVALID_ROOM_CODE');
    guest.emit('room:join', { roomCode: '00000000', displayName: 'Unknown Player' });
    await unknownRoom;

    const hostCreated = waitForEvent(host, 'room:created');
    host.emit('room:create', { displayName: 'Host Player' });
    const created = await hostCreated;
    const roomCode = created.room.code as string;
    assert.equal(created.playerId, hostPlayerId);
    assert.equal(created.room.hostId, hostPlayerId);

    const guestJoined = waitForEvent(guest, 'room:joined');
    const hostSawJoin = waitForEvent(host, 'room:sync', (payload) => payload.room?.players?.length === 2);
    guest.emit('room:join', { roomCode, displayName: 'Guest Player' });
    const joined = await guestJoined;
    await hostSawJoin;
    assert.equal(joined.playerId, guestPlayerId);

    const guestDeniedStart = waitForEvent(guest, 'app:error', (payload) => payload.code === 'HOST_ONLY');
    guest.emit('game:start', roomCode);
    await guestDeniedStart;

    const hostStarted = waitForEvent(host, 'game:start');
    const guestStarted = waitForEvent(guest, 'game:start');
    host.emit('game:start', roomCode);
    assert.equal((await hostStarted).state, 'playing');
    assert.equal((await guestStarted).state, 'playing');

    const guestDeniedRoll = waitForEvent(guest, 'app:error', (payload) => payload.code === 'NOT_YOUR_TURN');
    guest.emit('game:roll_dice', { roomCode });
    await guestDeniedRoll;

    const hostRoll = waitForEvent(host, 'game:state_update');
    const guestRoll = waitForEvent(guest, 'game:state_update');
    host.emit('game:roll_dice', { roomCode });
    const [hostState, guestState] = await Promise.all([hostRoll, guestRoll]);
    assert.deepEqual(hostState.gameState, guestState.gameState);

    const gameState = server.roomManager.getRoom(roomCode)?.gameState;
    assert.ok(gameState);
    gameState.currentTurnIndex = 0;
    gameState.diceValue = 6;
    gameState.legalMoves = [0];
    const hostMove = waitForEvent(host, 'game:turn_changed');
    const guestMove = waitForEvent(guest, 'game:turn_changed');
    host.emit('game:move_token', { roomCode, tokenIndex: 0 });
    const [hostMoved, guestMoved] = await Promise.all([hostMove, guestMove]);
    assert.deepEqual(hostMoved.gameState, guestMoved.gameState);
    assert.equal(hostMoved.gameState.players[0].tokens[0].position, 0);

    const unauthorizedChat = waitForEvent(intruder, 'app:error', (payload) => payload.code === 'NOT_IN_ROOM');
    intruder.emit('chat:send', { roomCode, message: 'unauthorized' });
    await unauthorizedChat;

    const hostChat = waitForEvent(host, 'chat:message');
    const guestChat = waitForEvent(guest, 'chat:message');
    guest.emit('chat:send', { roomCode, message: 'hello', playerId: hostPlayerId });
    const [hostMessage, guestMessage] = await Promise.all([hostChat, guestChat]);
    assert.equal(hostMessage.playerId, guestPlayerId);
    assert.equal(hostMessage.playerName, 'Guest Player');
    assert.deepEqual(hostMessage, guestMessage);

    const linkRejected = waitForEvent(guest, 'app:error', (payload) => payload.code === 'CHAT_LINKS_NOT_ALLOWED');
    guest.emit('chat:send', { roomCode, message: 'https://example.invalid' });
    await linkRejected;

    resumed = createSocket(serverUrl, {
      transports: ['websocket'],
      reconnection: false,
      auth: { sessionToken: guestIdentity.sessionToken },
    });
    const resumedAuthenticated = waitForEvent(resumed, 'auth:success');
    await waitForEvent(resumed, 'connect');
    assert.equal((await resumedAuthenticated).playerId, guestPlayerId);
    assert.equal(server.roomManager.getRoom(roomCode)?.players.find((player) => player.id === guestPlayerId)?.connected, true);

    guest.disconnect();
    const guestOffline = waitForEvent(host, 'room:sync', (payload) =>
      payload.room?.players?.some((player: { id: string; connected: boolean }) => player.id === guestPlayerId && !player.connected),
    );
    const resumedSocketId = resumed.id;
    assert.ok(resumedSocketId);
    const resumedServerSocket = server.io.of('/').sockets.get(resumedSocketId);
    assert.ok(resumedServerSocket);
    const serverObservedDisconnect = new Promise<void>((resolve) => {
      resumedServerSocket.once('disconnect', () => resolve());
    });
    resumed.disconnect();
    await serverObservedDisconnect;
    assert.equal(server.roomManager.getRoom(roomCode)?.players.find((player) => player.id === guestPlayerId)?.connected, false);
    await guestOffline;

    const health = await fetch(`${serverUrl}/health`);
    assert.equal(health.status, 200);
    const healthBody = await health.json() as { ok: boolean };
    assert.equal(healthBody.ok, true);
    const metrics = await fetch(`${serverUrl}/metrics`);
    assert.equal(metrics.status, 200);
    assert.match(await metrics.text(), /ludo_rejected_requests [1-9][0-9]*/);
  } finally {
    host.disconnect();
    guest.disconnect();
    intruder.disconnect();
    anonymous.disconnect();
    resumed?.disconnect();
    await server.stop();
  }
});

test('failed room persistence rolls back in-memory creation and permits retry', async () => {
  const store = new FailOnceRoomStore();
  const server = createLudoServer(store);
  await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const socket = createSocket(`http://127.0.0.1:${address.port}`, { transports: ['websocket'], reconnection: false });

  try {
    await server.ready;
    await waitForEvent(socket, 'connect');
    const authenticated = waitForEvent(socket, 'auth:success');
    socket.emit('auth:guest', { displayName: 'Retry Guest' });
    const identity = await authenticated;

    store.failNextRoomWrite = true;
    const writeFailed = waitForEvent(socket, 'app:error', (payload) => payload.code === 'INVALID_REQUEST');
    socket.emit('room:create', {});
    await writeFailed;
    assert.deepEqual(server.roomManager.getRoomsForPlayer(identity.playerId), []);

    const created = waitForEvent(socket, 'room:created');
    socket.emit('room:create', {});
    assert.equal((await created).room.players[0].id, identity.playerId);
  } finally {
    socket.disconnect();
    await server.stop();
  }
});