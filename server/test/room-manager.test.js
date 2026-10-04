"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const room_manager_1 = require("../src/room-manager");
const roomManager = new room_manager_1.RoomManager();
(0, node_test_1.default)('creates a room with an 8-digit code', () => {
    const room = roomManager.createRoom({
        displayName: 'Alice',
        avatar: 'avatar-1',
        avatarColor: '#f59e0b',
    });
    strict_1.default.equal(room.code.length, 8);
    strict_1.default.match(room.code, /^[0-9]{8}$/);
    strict_1.default.equal(room.players.length, 1);
    strict_1.default.equal(room.players[0].isHost, true);
});
(0, node_test_1.default)('allows a second player to join a room', () => {
    const room = roomManager.createRoom({ displayName: 'Host A' });
    const joined = roomManager.joinRoom({ roomCode: room.code, displayName: 'Bob' }, 'player-bob');
    strict_1.default.equal(joined.players.length, 2);
    strict_1.default.equal(joined.players[1].displayName, 'Bob');
});
(0, node_test_1.default)('prevents duplicate player names in the same room', () => {
    const room = roomManager.createRoom({ displayName: 'Room Owner' });
    strict_1.default.throws(() => {
        roomManager.joinRoom({ roomCode: room.code, displayName: 'Room Owner' }, 'duplicate-player');
    }, /PLAYER_ALREADY_IN_ROOM/);
});
(0, node_test_1.default)('enforces maximum capacity', () => {
    const room = roomManager.createRoom({ displayName: 'Host' });
    for (let index = 1; index <= 3; index += 1) {
        roomManager.joinRoom({ roomCode: room.code, displayName: `Guest ${index}` }, `guest-${index}`);
    }
    strict_1.default.throws(() => {
        roomManager.joinRoom({ roomCode: room.code, displayName: 'Guest 4' }, 'guest-4');
    }, /ROOM_FULL/);
});
(0, node_test_1.default)('rejects invalid or unknown room codes', () => {
    strict_1.default.equal(roomManager.isValidRoomCode('1234567'), false);
    strict_1.default.equal(roomManager.isValidRoomCode('99999999'), false);
});
