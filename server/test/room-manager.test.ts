import test from 'node:test';
import assert from 'node:assert/strict';

import { RoomManager } from '../src/room-manager';
import { getBoardCell, getTrackIndex, isSafePosition } from '../src/ludo-paths';

const roomManager = new RoomManager();

test('creates a room with an 8-digit code', () => {
  const room = roomManager.createRoom({
    displayName: 'Alice',
    avatar: 'avatar-1',
    avatarColor: '#f59e0b',
  });

  assert.equal(room.code.length, 8);
  assert.match(room.code, /^[0-9]{8}$/);
  assert.equal(room.players.length, 1);
  assert.equal(room.players[0].isHost, true);
});

test('allows a second player to join a room', () => {
  const room = roomManager.createRoom({ displayName: 'Host A' });
  const joined = roomManager.joinRoom({ roomCode: room.code, displayName: 'Bob' }, 'player-bob');

  assert.equal(joined.players.length, 2);
  assert.equal(joined.players[1].displayName, 'Bob');
});

test('prevents duplicate player names in the same room', () => {
  const room = roomManager.createRoom({ displayName: 'Room Owner' });

  assert.throws(() => {
    roomManager.joinRoom({ roomCode: room.code, displayName: 'Room Owner' }, 'duplicate-player');
  }, /PLAYER_ALREADY_IN_ROOM/);
});

test('enforces maximum capacity', () => {
  const room = roomManager.createRoom({ displayName: 'Host' });

  for (let index = 1; index <= 3; index += 1) {
    roomManager.joinRoom({ roomCode: room.code, displayName: `Guest ${index}` }, `guest-${index}`);
  }

  assert.throws(() => {
    roomManager.joinRoom({ roomCode: room.code, displayName: 'Guest 4' }, 'guest-4');
  }, /ROOM_FULL/);
});

test('rejects invalid or unknown room codes', () => {
  assert.equal(roomManager.isValidRoomCode('1234567'), false);
  assert.equal(roomManager.isValidRoomCode('99999999'), false);
});

test('starts a game and sets the first turn', () => {
  const room = roomManager.createRoom({ displayName: 'Game Host' });
  roomManager.joinRoom({ roomCode: room.code, displayName: 'Game Guest' }, 'guest-1');

  const started = roomManager.startGame(room.code);

  assert.equal(started.state, 'playing');
  assert.ok(started.gameState);
  assert.equal(started.gameState?.currentTurnIndex, 0);
  assert.equal(started.gameState?.players.length, 2);
});

test('prevents starting an already active game again', () => {
  const room = roomManager.createRoom({ displayName: 'Host Again' });
  roomManager.joinRoom({ roomCode: room.code, displayName: 'Guest Again' }, 'guest-again');
  roomManager.startGame(room.code);

  assert.throws(() => roomManager.startGame(room.code), /ROOM_ALREADY_STARTED/);
});

test('rolls a dice and exposes legal moves', () => {
  const room = roomManager.createRoom({ displayName: 'Dice Host' });
  roomManager.joinRoom({ roomCode: room.code, displayName: 'Dice Guest' }, 'dice-guest');
  roomManager.startGame(room.code);

  const result = roomManager.rollDice(room.code, room.gameState?.players[0]?.playerId ?? room.players[0].id);

  assert.ok(result.diceValue >= 1 && result.diceValue <= 6);
  assert.ok(Array.isArray(result.legalMoves));
});

test('moves a token when the dice allows it', () => {
  const room = roomManager.createRoom({ displayName: 'Mover Host' });
  roomManager.joinRoom({ roomCode: room.code, displayName: 'Mover Guest' }, 'mover-guest');
  roomManager.startGame(room.code);

  const activePlayerId = room.gameState?.players[0]?.playerId ?? room.players[0].id;
  if (room.gameState) {
    room.gameState.diceValue = 6;
    room.gameState.legalMoves = [0];
  }
  const move = roomManager.moveToken(room.code, activePlayerId, 0);

  assert.equal(move.playerId, activePlayerId);
  assert.equal(move.tokenIndex, 0);
  assert.equal(move.to, 0);
});

test('retains the active turn after a six', () => {
  const room = roomManager.createRoom({ displayName: 'Six Host' });
  roomManager.joinRoom({ roomCode: room.code, displayName: 'Six Guest' }, 'six-guest');
  roomManager.startGame(room.code);
  room.gameState!.diceValue = 6;
  room.gameState!.legalMoves = [0];

  const activePlayerId = room.gameState!.players[0].playerId;
  roomManager.moveToken(room.code, activePlayerId, 0);

  assert.equal(room.gameState!.currentTurnIndex, 0);
});

test('reports captures and protects safe squares', () => {
  const room = roomManager.createRoom({ displayName: 'Capture Host' });
  roomManager.joinRoom({ roomCode: room.code, displayName: 'Capture Guest' }, 'capture-guest');
  roomManager.startGame(room.code);
  const game = room.gameState!;
  const activePlayerId = game.players[0].playerId;
  const opponentToken = game.players[1].tokens[0];

  game.players[0].tokens[0].position = 6;
  opponentToken.position = 46;
  game.diceValue = 1;
  game.legalMoves = [0];
  const capturedMove = roomManager.moveToken(room.code, activePlayerId, 0);

  assert.equal(capturedMove.captured, true);
  assert.equal(opponentToken.position, -1);

  game.players[0].tokens[0].position = 7;
  opponentToken.position = 47;
  opponentToken.isSafe = true;
  game.currentTurnIndex = 0;
  game.diceValue = 1;
  game.legalMoves = [0];
  const safeMove = roomManager.moveToken(room.code, activePlayerId, 0);

  assert.equal(safeMove.captured, false);
  assert.equal(opponentToken.position, 47);
});

test('opponent two-token blockades prevent passing and landing', () => {
  const room = roomManager.createRoom({ displayName: 'Blockade Host' });
  roomManager.joinRoom({ roomCode: room.code, displayName: 'Blockade Guest' }, 'blockade-guest');
  roomManager.startGame(room.code);
  const game = room.gameState!;
  const activePlayerId = game.players[0].playerId;
  const movingToken = game.players[0].tokens[0];
  const blockadeTokens = game.players[1].tokens.slice(0, 2);

  movingToken.position = 9;
  blockadeTokens.forEach((token) => { token.position = 50; });
  game.diceValue = 2;
  game.legalMoves = [0];
  assert.throws(() => roomManager.moveToken(room.code, activePlayerId, 0), /ILLEGAL_MOVE/);

  blockadeTokens[1].position = -1;
  assert.equal(roomManager.moveToken(room.code, activePlayerId, 0).to, 11);
});

test('routes all four colors to unique starts and matching home lanes', () => {
  assert.deepEqual(getBoardCell('green', 0), { row: 6, col: 1 });
  assert.deepEqual(getBoardCell('yellow', 0), { row: 1, col: 8 });
  assert.deepEqual(getBoardCell('blue', 0), { row: 8, col: 13 });
  assert.deepEqual(getBoardCell('red', 0), { row: 13, col: 6 });
  assert.deepEqual(getBoardCell('green', 52), { row: 7, col: 1 });
  assert.deepEqual(getBoardCell('yellow', 57), { row: 6, col: 7 });
  assert.deepEqual(getBoardCell('blue', 57), { row: 7, col: 8 });
  assert.deepEqual(getBoardCell('red', 57), { row: 8, col: 7 });
  assert.equal(getTrackIndex('green', 13), getTrackIndex('yellow', 0));
  assert.equal(isSafePosition('green', 8), true);
  assert.equal(isSafePosition('yellow', 47), true);
});

test('marks the room finished after the server records a winner', () => {
  const room = roomManager.createRoom({ displayName: 'Winner Host' });
  roomManager.joinRoom({ roomCode: room.code, displayName: 'Winner Guest' }, 'winner-guest');
  roomManager.startGame(room.code);
  const game = room.gameState!;
  const activePlayerId = game.players[0].playerId;
  game.players[0].tokens.slice(0, 3).forEach((token) => {
    token.inHome = true;
    token.position = 57;
  });
  game.players[0].tokens[3].position = 56;
  game.diceValue = 1;
  game.legalMoves = [3];

  roomManager.moveToken(room.code, activePlayerId, 3);

  assert.equal(game.winnerId, activePlayerId);
  assert.equal(game.phase, 'finished');
  assert.equal(room.state, 'finished');
  assert.throws(() => roomManager.rollDice(room.code, activePlayerId), /GAME_NOT_STARTED/);
});

test('rejects token moves that were not made legal by the server roll', () => {
  const room = roomManager.createRoom({ displayName: 'Validated Host' });
  roomManager.joinRoom({ roomCode: room.code, displayName: 'Validated Guest' }, 'validated-guest');
  roomManager.startGame(room.code);

  const activePlayerId = room.gameState?.players[0]?.playerId ?? room.players[0].id;
  assert.throws(() => roomManager.moveToken(room.code, activePlayerId, 0), /ILLEGAL_MOVE/);
});

test('rejects another roll before the active player moves', () => {
  const room = roomManager.createRoom({ displayName: 'Roll Host' });
  roomManager.joinRoom({ roomCode: room.code, displayName: 'Roll Guest' }, 'roll-guest');
  roomManager.startGame(room.code);
  room.gameState!.legalMoves = [0];

  const activePlayerId = room.gameState!.players[0].playerId;
  assert.throws(() => roomManager.rollDice(room.code, activePlayerId), /MOVE_REQUIRED/);
});

test('skips a turn after three consecutive sixes', () => {
  const room = roomManager.createRoom({ displayName: 'Triple Six Host' });
  roomManager.joinRoom({ roomCode: room.code, displayName: 'Triple Six Guest' }, 'triple-six-guest');
  roomManager.startGame(room.code);
  const activePlayerId = room.gameState!.players[0].playerId;

  for (let roll = 0; roll < 2; roll += 1) {
    assert.equal(roomManager.rollDice(room.code, activePlayerId, () => 6).diceValue, 6);
    roomManager.moveToken(room.code, activePlayerId, 0);
  }
  const finalRoll = roomManager.rollDice(room.code, activePlayerId, () => 6);

  assert.equal(finalRoll.diceValue, 6);
  assert.deepEqual(finalRoll.legalMoves, []);
  assert.equal(room.gameState!.currentTurnIndex, 1);
  assert.equal(room.gameState!.diceValue, 0);
});

test('marks disconnected players offline in their rooms', () => {
  const room = roomManager.createRoom({ displayName: 'Connected Host' }, 'connected-host');

  const changedRooms = roomManager.markPlayerDisconnected('connected-host');

  assert.equal(changedRooms.length, 1);
  assert.equal(room.players[0].connected, false);
  assert.equal(room.players[0].status, 'offline');
});

test('promotes a connected player when the host disconnects', () => {
  const room = roomManager.createRoom({ displayName: 'Host Leaving' }, 'leaving-host');
  roomManager.joinRoom({ roomCode: room.code, displayName: 'Next Host' }, 'next-host');

  roomManager.markPlayerDisconnected('leaving-host');

  assert.equal(room.hostId, 'next-host');
  assert.equal(room.players[1].isHost, true);
});

test('promotes the first joiner when the host disconnected before anyone joined', () => {
  const room = roomManager.createRoom({ displayName: 'Gone Host' }, 'gone-host');
  roomManager.markPlayerDisconnected('gone-host');

  const joined = roomManager.joinRoom({ roomCode: room.code, displayName: 'New Host' }, 'new-host');

  assert.equal(joined.hostId, 'new-host');
  assert.equal(joined.players[1].isHost, true);
});

test('skips a disconnected player whose turn is active', () => {
  const room = roomManager.createRoom({ displayName: 'Active Host' }, 'active-host');
  roomManager.joinRoom({ roomCode: room.code, displayName: 'Active Guest' }, 'active-guest');
  roomManager.startGame(room.code);
  room.gameState!.legalMoves = [0];
  room.gameState!.diceValue = 6;

  roomManager.markPlayerDisconnected('active-host');

  assert.equal(room.gameState!.currentTurnIndex, 1);
  assert.equal(room.gameState!.legalMoves.length, 0);
  assert.equal(room.gameState!.diceValue, 0);
});

test('removes rooms after their in-memory lifetime expires', () => {
  const room = roomManager.createRoom({ displayName: 'Expired Host' });
  room.createdAt = new Date(Date.now() - (25 * 60 * 60 * 1000)).toISOString();

  assert.deepEqual(roomManager.removeExpiredRooms(), [room.code]);
  assert.equal(roomManager.getRoom(room.code), undefined);
});

test('does not start a game when fewer than two players are connected', () => {
  const room = roomManager.createRoom({ displayName: 'Offline Host' }, 'offline-host');
  roomManager.joinRoom({ roomCode: room.code, displayName: 'Offline Guest' }, 'offline-guest');
  roomManager.markPlayerDisconnected('offline-guest');

  assert.throws(() => roomManager.startGame(room.code), /MIN_PLAYERS_NOT_REACHED/);
});

test('rejects new rooms when the active room limit is reached', () => {
  const limitedManager = new RoomManager();
  for (let index = 0; index < 1000; index += 1) {
    limitedManager.createRoom({ displayName: `Host ${index}` });
  }

  assert.throws(() => limitedManager.createRoom({ displayName: 'Over Limit' }), /ROOM_CAPACITY_REACHED/);
});
