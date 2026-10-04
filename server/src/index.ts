import { createServer } from 'node:http';

import cors from 'cors';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';

import { config } from './config';
import { moderateChatMessage } from './moderation';
import { RoomManager } from './room-manager';
import { MemoryLudoStore, PostgresLudoStore } from './store';
import type { GuestIdentity, LudoStore } from './store';

const MAX_CHAT_MESSAGES = 100;
const KNOWN_ERRORS = new Set([
  'HOST_ONLY', 'AUTH_REQUIRED', 'INVALID_SESSION', 'INVALID_ROOM_CODE',
  'ROOM_ALREADY_STARTED', 'ROOM_FULL', 'ROOM_CAPACITY_REACHED',
  'PLAYER_ALREADY_IN_ROOM', 'MIN_PLAYERS_NOT_REACHED', 'GAME_NOT_STARTED',
  'NOT_YOUR_TURN', 'MOVE_REQUIRED', 'ILLEGAL_MOVE', 'NOT_IN_ROOM',
  'RATE_LIMITED', 'IP_RATE_LIMITED', 'CHAT_MODERATED', 'CHAT_LINKS_NOT_ALLOWED',
]);

const roomCreateSchema = z.object({
  avatar: z.string().max(512).optional(),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});
const roomJoinSchema = roomCreateSchema.extend({ roomCode: z.string().regex(/^[0-9]{8}$/) });
const guestSessionSchema = z.object({ displayName: z.string().trim().min(2).max(18) });
const chatSchema = z.object({ roomCode: z.string().regex(/^[0-9]{8}$/), message: z.string().trim().min(1).max(280) });
const diceRequestSchema = z.object({ roomCode: z.string().regex(/^[0-9]{8}$/) });
const moveRequestSchema = diceRequestSchema.extend({ tokenIndex: z.number().int().min(0).max(3) });
const roomCodeSchema = z.string().regex(/^[0-9]{8}$/);

type ServerMetrics = { rejectedRequests: number; activeSockets: number; chatMessages: number };

function emitError(socket: Socket, error: unknown, metrics: ServerMetrics) {
  metrics.rejectedRequests += 1;
  const errorMessage = error instanceof Error ? error.message : '';
  const code = KNOWN_ERRORS.has(errorMessage) ? errorMessage : 'INVALID_REQUEST';
  console.warn(JSON.stringify({ level: 'warn', event: 'socket.request_rejected', code }));
  socket.emit('app:error', { code });
}

export function createLudoServer(store: LudoStore = new MemoryLudoStore()) {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: config.clientOrigins, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 16_384,
  });
  const roomManager = new RoomManager();
  const metrics: ServerMetrics = { rejectedRequests: 0, activeSockets: 0, chatMessages: 0 };
  const ready = store.initialize().then(async () => roomManager.restoreRooms(await store.loadRooms()));
  const roomExpiryTimer = setInterval(() => {
    void (async () => {
      const now = Date.now();
      roomManager.removeExpiredRooms(now);
      await store.removeExpiredRooms(now);
      for (const [ip, events] of perIpEventTimes) {
        const recentEvents = events.filter((eventTime) => now - eventTime < 10_000);
        if (recentEvents.length === 0) perIpEventTimes.delete(ip);
        else perIpEventTimes.set(ip, recentEvents);
      }
      for (const [ip, connections] of perIpConnections) {
        if (connections === 0 && !perIpEventTimes.has(ip)) perIpConnections.delete(ip);
      }
    })().catch((error: unknown) => {
      console.error(JSON.stringify({ level: 'error', event: 'room.expiry_failed', message: error instanceof Error ? error.message : 'unknown' }));
    });
  }, 5 * 60 * 1000);
  roomExpiryTimer.unref();

  const activeSocketsByPlayer = new Map<string, Set<string>>();
  const perIpEventTimes = new Map<string, number[]>();
  const perIpConnections = new Map<string, number>();

  const identityFor = (socket: Socket): Omit<GuestIdentity, 'sessionToken'> => {
    const identity = socket.data.identity as Omit<GuestIdentity, 'sessionToken'> | undefined;
    if (!identity) throw new Error('AUTH_REQUIRED');
    return identity;
  };

  const persistMutation = async <T>(roomCode: string, mutate: () => T): Promise<T> => {
    const room = roomManager.getRoom(roomCode);
    if (!room) throw new Error('INVALID_ROOM_CODE');
    const snapshot = structuredClone(room);
    try {
      const result = mutate();
      await store.saveRoom(room);
      return result;
    } catch (error) {
      roomManager.restoreRoom(snapshot);
      throw error;
    }
  };

  const activateIdentity = async (socket: Socket, identity: Omit<GuestIdentity, 'sessionToken'>) => {
    socket.data.identity = identity;
    const activeSockets = activeSocketsByPlayer.get(identity.playerId) ?? new Set<string>();
    activeSockets.add(socket.id);
    activeSocketsByPlayer.set(identity.playerId, activeSockets);
    const snapshots = roomManager.getRoomsForPlayer(identity.playerId).map((room) => structuredClone(room));
    try {
      const rooms = roomManager.markPlayerConnected(identity.playerId);
      for (const room of rooms) await store.saveRoom(room);
      for (const room of rooms) {
      socket.join(room.code);
      socket.emit('room:sync', { room });
      socket.emit('chat:history', await store.loadChat(room.code, MAX_CHAT_MESSAGES));
      }
    } catch (error) {
      snapshots.forEach((snapshot) => roomManager.restoreRoom(snapshot));
      activeSockets.delete(socket.id);
      throw error;
    }
  };

  app.use(cors({ origin: config.clientOrigins }));
  app.get('/health', async (_request, response) => {
    try {
      await ready;
      await store.health();
      response.json({ ok: true, timestamp: new Date().toISOString() });
    } catch {
      response.status(503).json({ ok: false });
    }
  });
  app.get('/metrics', async (_request, response) => {
    try {
      await store.health();
      response.type('text/plain').send([
        '# HELP ludo_active_sockets Connected websocket clients',
        '# TYPE ludo_active_sockets gauge',
        `ludo_active_sockets ${metrics.activeSockets}`,
        '# HELP ludo_rejected_requests Rejected socket requests',
        '# TYPE ludo_rejected_requests counter',
        `ludo_rejected_requests ${metrics.rejectedRequests}`,
        '# HELP ludo_chat_messages Accepted room chat messages',
        '# TYPE ludo_chat_messages counter',
        `ludo_chat_messages ${metrics.chatMessages}`,
        '',
      ].join('\n'));
    } catch {
      response.status(503).type('text/plain').send('metrics_unavailable 1\n');
    }
  });

  io.use(async (socket, next) => {
    try {
      await ready;
      const sessionToken = socket.handshake.auth?.sessionToken;
      if (sessionToken !== undefined) {
        if (typeof sessionToken !== 'string' || sessionToken.length > 128) throw new Error('INVALID_SESSION');
        const identity = await store.resolveSession(sessionToken);
        if (!identity) throw new Error('INVALID_SESSION');
        socket.data.identity = identity;
      }
      const ip = socket.handshake.address;
      if ((perIpConnections.get(ip) ?? 0) >= 20) throw new Error('IP_RATE_LIMITED');
      socket.data.clientIp = ip;
      next();
    } catch (error) {
      next(new Error(error instanceof Error ? error.message : 'INVALID_SESSION'));
    }
  });

  io.on('connection', (socket) => {
    metrics.activeSockets += 1;
    const ip = socket.data.clientIp as string;
    perIpConnections.set(ip, (perIpConnections.get(ip) ?? 0) + 1);
    let windowStartedAt = Date.now();
    let socketEventCount = 0;

    socket.use((_packet, next) => {
      const now = Date.now();
      if (now - windowStartedAt >= 10_000) {
        windowStartedAt = now;
        socketEventCount = 0;
      }
      socketEventCount += 1;
      const ipEvents = (perIpEventTimes.get(ip) ?? []).filter((at) => now - at < 10_000);
      ipEvents.push(now);
      perIpEventTimes.set(ip, ipEvents);
      if (socketEventCount > 60) {
        socket.emit('app:error', { code: 'RATE_LIMITED' });
        socket.disconnect(true);
        next(new Error('RATE_LIMITED'));
      } else if (ipEvents.length > 300) {
        socket.emit('app:error', { code: 'IP_RATE_LIMITED' });
        socket.disconnect(true);
        next(new Error('IP_RATE_LIMITED'));
      } else {
        next();
      }
    });

    const initialIdentity = socket.data.identity as Omit<GuestIdentity, 'sessionToken'> | undefined;
    if (initialIdentity) {
      void activateIdentity(socket, initialIdentity).then(() => socket.emit('auth:success', initialIdentity))
        .catch(() => socket.disconnect(true));
    }

    socket.on('auth:guest', async (payload: unknown) => {
      try {
        await ready;
        if (socket.data.identity || socket.data.authenticating) throw new Error('INVALID_REQUEST');
        socket.data.authenticating = true;
        const { displayName } = guestSessionSchema.parse(payload);
        const identity = await store.createGuestSession(displayName);
        await activateIdentity(socket, identity);
        socket.emit('auth:success', identity);
      } catch (error) {
        emitError(socket, error, metrics);
      } finally {
        socket.data.authenticating = false;
      }
    });

    socket.on('room:create', async (payload: unknown) => {
      try {
        await ready;
        const identity = identityFor(socket);
        const body = roomCreateSchema.parse(payload);
        const room = roomManager.createRoom({ ...body, displayName: identity.displayName }, identity.playerId);
        try {
          await store.saveRoom(room);
        } catch (error) {
          roomManager.removeRoom(room.code);
          throw error;
        }
        socket.join(room.code);
        io.to(room.code).emit('room:sync', { room });
        socket.emit('room:created', { room, playerId: identity.playerId });
        socket.emit('chat:history', await store.loadChat(room.code, MAX_CHAT_MESSAGES));
      } catch (error) {
        emitError(socket, error, metrics);
      }
    });

    socket.on('room:join', async (payload: unknown) => {
      try {
        await ready;
        const identity = identityFor(socket);
        const body = roomJoinSchema.parse(payload);
        const roomCode = body.roomCode;
        const room = await persistMutation(roomCode, () =>
          roomManager.joinRoom({ ...body, displayName: identity.displayName }, identity.playerId),
        );
        socket.join(room.code);
        io.to(room.code).emit('room:sync', { room });
        socket.emit('room:joined', { room, playerId: identity.playerId });
        socket.emit('chat:history', await store.loadChat(room.code, MAX_CHAT_MESSAGES));
      } catch (error) {
        emitError(socket, error, metrics);
      }
    });

    socket.on('game:start', async (payload: unknown) => {
      try {
        await ready;
        const roomCode = roomCodeSchema.parse(payload);
        const identity = identityFor(socket);
        const room = roomManager.getRoom(roomCode);
        if (!room || room.hostId !== identity.playerId) throw new Error('HOST_ONLY');
        const started = await persistMutation(roomCode, () => roomManager.startGame(roomCode));
        io.to(roomCode).emit('game:start', started);
        io.to(roomCode).emit('room:sync', { room: started });
      } catch (error) {
        emitError(socket, error, metrics);
      }
    });

    socket.on('game:roll_dice', async (payload: unknown) => {
      try {
        await ready;
        const { roomCode } = diceRequestSchema.parse(payload);
        const identity = identityFor(socket);
        const result = await persistMutation(roomCode, () => roomManager.rollDice(roomCode, identity.playerId));
        const room = roomManager.getRoom(roomCode)!;
        io.to(roomCode).emit('game:state_update', {
          roomCode,
          diceValue: result.diceValue,
          legalMoves: result.legalMoves,
          currentTurnIndex: room.gameState?.currentTurnIndex ?? 0,
          gameState: room.gameState,
        });
        io.to(roomCode).emit('room:sync', { room });
      } catch (error) {
        emitError(socket, error, metrics);
      }
    });

    socket.on('game:move_token', async (payload: unknown) => {
      try {
        await ready;
        const body = moveRequestSchema.parse(payload);
        const identity = identityFor(socket);
        const move = await persistMutation(body.roomCode, () =>
          roomManager.moveToken(body.roomCode, identity.playerId, body.tokenIndex),
        );
        const room = roomManager.getRoom(body.roomCode)!;
        io.to(body.roomCode).emit('game:turn_changed', { roomCode: body.roomCode, move, gameState: room.gameState });
        io.to(body.roomCode).emit('room:sync', { room });
      } catch (error) {
        emitError(socket, error, metrics);
      }
    });

    socket.on('chat:send', async (payload: unknown) => {
      try {
        await ready;
        const body = chatSchema.parse(payload);
        const identity = identityFor(socket);
        const room = roomManager.getRoom(body.roomCode);
        if (!room?.players.some((player) => player.id === identity.playerId)) throw new Error('NOT_IN_ROOM');
        const moderation = moderateChatMessage(body.message, config.chatBlockedTerms);
        if (moderation === 'links_not_allowed') throw new Error('CHAT_LINKS_NOT_ALLOWED');
        if (moderation !== 'allowed') throw new Error('CHAT_MODERATED');
        const message = {
          playerId: identity.playerId,
          playerName: identity.displayName,
          message: body.message,
          createdAt: new Date().toISOString(),
        };
        await store.appendChat(body.roomCode, message);
        metrics.chatMessages += 1;
        io.to(body.roomCode).emit('chat:message', { ...message, roomCode: body.roomCode });
      } catch (error) {
        emitError(socket, error, metrics);
      }
    });

    socket.on('disconnect', () => {
      metrics.activeSockets = Math.max(0, metrics.activeSockets - 1);
      perIpConnections.set(ip, Math.max(0, (perIpConnections.get(ip) ?? 1) - 1));
      const identity = socket.data.identity as Omit<GuestIdentity, 'sessionToken'> | undefined;
      if (!identity) return;
      const activeSockets = activeSocketsByPlayer.get(identity.playerId);
      activeSockets?.delete(socket.id);
      if (activeSockets && activeSockets.size > 0) return;
      activeSocketsByPlayer.delete(identity.playerId);
      const snapshots = roomManager.getRoomsForPlayer(identity.playerId).map((room) => structuredClone(room));
      for (const room of roomManager.markPlayerDisconnected(identity.playerId)) {
        void store.saveRoom(room).then(() => io.to(room.code).emit('room:sync', { room })).catch((error: unknown) => {
          snapshots.forEach((snapshot) => roomManager.restoreRoom(snapshot));
          console.error(JSON.stringify({ level: 'error', event: 'room.disconnect_persist_failed', message: error instanceof Error ? error.message : 'unknown' }));
        });
      }
    });
  });

  return {
    app,
    httpServer,
    io,
    roomManager,
    ready,
    async stop() {
      clearInterval(roomExpiryTimer);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await store.close();
    },
  };
}

if (require.main === module) {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required');
  const server = createLudoServer(
    new PostgresLudoStore(config.databaseUrl, process.env.DATABASE_SSL !== 'false'),
  );
  void server.ready.then(() => {
    server.httpServer.listen(config.port, () => {
      console.info(JSON.stringify({ level: 'info', event: 'server.listening', port: config.port }));
    });
  }).catch((error: unknown) => {
    console.error(JSON.stringify({ level: 'error', event: 'server.start_failed', message: error instanceof Error ? error.message : 'unknown' }));
    process.exitCode = 1;
  });
  const shutdown = () => {
    void server.stop().then(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}