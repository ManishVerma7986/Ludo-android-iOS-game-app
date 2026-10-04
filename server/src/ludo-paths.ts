import type { PlayerColor } from './types';

export type BoardCell = { row: number; col: number };

export const TRACK_LENGTH = 52;
export const HOME_LENGTH = 6;
export const FINISH_POSITION = TRACK_LENGTH + HOME_LENGTH - 1;

const START_OFFSETS: Record<PlayerColor, number> = {
  green: 0,
  yellow: 13,
  blue: 26,
  red: 39,
};

const TRACK_CELLS: BoardCell[] = [
  { row: 6, col: 1 }, { row: 6, col: 2 }, { row: 6, col: 3 }, { row: 6, col: 4 }, { row: 6, col: 5 },
  { row: 5, col: 6 }, { row: 4, col: 6 }, { row: 3, col: 6 }, { row: 2, col: 6 }, { row: 1, col: 6 }, { row: 0, col: 6 },
  { row: 0, col: 7 }, { row: 0, col: 8 }, { row: 1, col: 8 }, { row: 2, col: 8 }, { row: 3, col: 8 }, { row: 4, col: 8 }, { row: 5, col: 8 },
  { row: 6, col: 9 }, { row: 6, col: 10 }, { row: 6, col: 11 }, { row: 6, col: 12 }, { row: 6, col: 13 }, { row: 6, col: 14 },
  { row: 7, col: 14 }, { row: 8, col: 14 }, { row: 8, col: 13 }, { row: 8, col: 12 }, { row: 8, col: 11 }, { row: 8, col: 10 }, { row: 8, col: 9 },
  { row: 9, col: 8 }, { row: 10, col: 8 }, { row: 11, col: 8 }, { row: 12, col: 8 }, { row: 13, col: 8 }, { row: 14, col: 8 },
  { row: 14, col: 7 }, { row: 14, col: 6 }, { row: 13, col: 6 }, { row: 12, col: 6 }, { row: 11, col: 6 }, { row: 10, col: 6 }, { row: 9, col: 6 },
  { row: 8, col: 5 }, { row: 8, col: 4 }, { row: 8, col: 3 }, { row: 8, col: 2 }, { row: 8, col: 1 }, { row: 8, col: 0 }, { row: 7, col: 0 }, { row: 6, col: 0 },
];

const HOME_LANES: Record<PlayerColor, BoardCell[]> = {
  green: [
    { row: 7, col: 1 }, { row: 7, col: 2 }, { row: 7, col: 3 },
    { row: 7, col: 4 }, { row: 7, col: 5 }, { row: 7, col: 6 },
  ],
  yellow: [
    { row: 1, col: 7 }, { row: 2, col: 7 }, { row: 3, col: 7 },
    { row: 4, col: 7 }, { row: 5, col: 7 }, { row: 6, col: 7 },
  ],
  blue: [
    { row: 7, col: 13 }, { row: 7, col: 12 }, { row: 7, col: 11 },
    { row: 7, col: 10 }, { row: 7, col: 9 }, { row: 7, col: 8 },
  ],
  red: [
    { row: 13, col: 7 }, { row: 12, col: 7 }, { row: 11, col: 7 },
    { row: 10, col: 7 }, { row: 9, col: 7 }, { row: 8, col: 7 },
  ],
};

const SAFE_TRACK_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export function getBoardCell(color: PlayerColor, position: number): BoardCell | null {
  if (!Number.isInteger(position) || position < 0 || position > FINISH_POSITION) {
    return null;
  }

  if (position < TRACK_LENGTH) {
    return TRACK_CELLS[(START_OFFSETS[color] + position) % TRACK_LENGTH];
  }

  return HOME_LANES[color][position - TRACK_LENGTH] ?? null;
}

export function isSafePosition(color: PlayerColor, position: number): boolean {
  return position < TRACK_LENGTH && SAFE_TRACK_INDICES.has((START_OFFSETS[color] + position) % TRACK_LENGTH);
}

export function getTrackIndex(color: PlayerColor, position: number): number | null {
  return position >= 0 && position < TRACK_LENGTH
    ? (START_OFFSETS[color] + position) % TRACK_LENGTH
    : null;
}

export function getPlayerStartIndex(color: PlayerColor): number {
  return START_OFFSETS[color];
}