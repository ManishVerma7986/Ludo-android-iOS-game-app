export type PlayerStatus = 'waiting' | 'ready' | 'playing' | 'offline';
export type PlayerColor = 'green' | 'yellow' | 'blue' | 'red';

export type Player = {
  id: string;
  displayName: string;
  avatar: string;
  avatarColor: string;
  ready: boolean;
  isHost: boolean;
  status: PlayerStatus;
  connected: boolean;
};

export type RoomSettings = {
  maxPlayers: 2 | 3 | 4;
  turnTimerSeconds: number;
  allowSpectators: boolean;
};

export type RoomState = 'waiting' | 'playing' | 'finished';

export type GameToken = {
  tokenIndex: number;
  position: number;
  inHome: boolean;
  isSafe: boolean;
  boardCell: { row: number; col: number } | null;
};

export type GamePlayerState = {
  playerId: string;
  color: PlayerColor;
  tokens: GameToken[];
};

export type GameMove = {
  playerId: string;
  tokenIndex: number;
  from: number;
  to: number;
  diceValue: number;
  captured: boolean;
};

export type GameState = {
  players: GamePlayerState[];
  currentTurnIndex: number;
  diceValue: number;
  legalMoves: number[];
  consecutiveSixes: number;
  lastMove: GameMove | null;
  winnerId: string | null;
  phase: 'waiting' | 'playing' | 'finished';
};

export type Room = {
  id: string;
  code: string;
  hostId: string;
  state: RoomState;
  createdAt: string;
  startedAt?: string;
  players: Player[];
  settings: RoomSettings;
  gameState?: GameState;
};

export type CreateRoomRequest = {
  displayName: string;
  avatar?: string;
  avatarColor?: string;
};

export type JoinRoomRequest = CreateRoomRequest & {
  roomCode: string;
};
