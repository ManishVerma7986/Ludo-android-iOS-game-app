import { randomInt } from 'node:crypto';

import type { GameState, GameToken, Player } from './types';
import { FINISH_POSITION, getBoardCell, getTrackIndex, isSafePosition } from './ludo-paths';

const TOKEN_COUNT = 4;
const HOME_INDEX = FINISH_POSITION;

export function createInitialGameState(players: Player[]): GameState {
  return {
    players: players.map((player, index) => ({
      playerId: player.id,
      color: ['green', 'yellow', 'blue', 'red'][index % 4] as 'green' | 'yellow' | 'blue' | 'red',
      tokens: Array.from({ length: TOKEN_COUNT }, (_, tokenIndex) => ({
        tokenIndex,
        position: -1,
        inHome: false,
        isSafe: false,
        boardCell: null,
      })),
    })),
    currentTurnIndex: 0,
    diceValue: 0,
    legalMoves: [],
    consecutiveSixes: 0,
    lastMove: null,
    winnerId: null,
    phase: 'waiting',
  };
}

function getPlayerById(game: GameState, playerId: string) {
  return game.players.find((entry) => entry.playerId === playerId);
}

function hasOpponentBlockade(game: GameState, movingPlayerId: string, trackIndex: number): boolean {
  return game.players.some((opponent) => {
    if (opponent.playerId === movingPlayerId) return false;
    const tokensAtSquare = opponent.tokens.filter((token) => {
      const tokenTrackIndex = getTrackIndex(opponent.color, token.position);
      return !token.inHome && tokenTrackIndex === trackIndex;
    });
    return tokensAtSquare.length >= 2;
  });
}

function canTokenMove(game: GameState, playerState: GameState['players'][number], tokenIndex: number, diceValue: number) {
  const token = playerState.tokens[tokenIndex];
  if (!token) return false;
  if (token.inHome) return false;
  if (token.position === -1) {
    const startTrackIndex = getTrackIndex(playerState.color, 0)!;
    return diceValue === 6 && !hasOpponentBlockade(game, playerState.playerId, startTrackIndex);
  }

  const destination = token.position + diceValue;
  if (destination > HOME_INDEX) return false;
  const lastTrackProgress = Math.min(destination, 51);
  for (let progress = token.position + 1; progress <= lastTrackProgress; progress += 1) {
    const trackIndex = getTrackIndex(playerState.color, progress)!;
    if (hasOpponentBlockade(game, playerState.playerId, trackIndex)) return false;
  }
  return true;
}

function nextTurn(game: GameState) {
  game.currentTurnIndex = (game.currentTurnIndex + 1) % game.players.length;
}

export function rollDiceForTurn(game: GameState, roll: () => number = () => randomInt(1, 7)): number {
  const value = roll();
  if (!Number.isInteger(value) || value < 1 || value > 6) {
    throw new Error('INVALID_DICE_VALUE');
  }
  game.consecutiveSixes = value === 6 ? game.consecutiveSixes + 1 : 0;
  game.diceValue = value;
  game.lastMove = null;
  return value;
}

export function moveTokenForPlayer(game: GameState, playerId: string, tokenIndex: number, diceValue: number): GameState['lastMove'] {
  const playerState = getPlayerById(game, playerId);
  if (!playerState) {
    throw new Error('PLAYER_NOT_FOUND');
  }

  const token = playerState.tokens[tokenIndex];
  if (!token || token.inHome) {
    throw new Error('INVALID_TOKEN');
  }

  if (!canTokenMove(game, playerState, tokenIndex, diceValue)) {
    throw new Error('ILLEGAL_MOVE');
  }

  const previousPosition = token.position;
  if (token.position === -1) {
    token.position = 0;
  } else {
    token.position += diceValue;
  }

  if (token.position >= HOME_INDEX) {
    token.position = HOME_INDEX;
    token.inHome = true;
  }

  const captureTarget = token.position;
  let captured = false;
  const activePlayer = game.players.find((entry) => entry.playerId === playerId)!;
  const captureTrackIndex = getTrackIndex(activePlayer.color, captureTarget);
  if (captureTrackIndex !== null && !isSafePosition(activePlayer.color, captureTarget)) {
    for (const opponent of game.players) {
      if (opponent.playerId === playerId) continue;
      for (const opponentToken of opponent.tokens) {
        const opponentTrackIndex = getTrackIndex(opponent.color, opponentToken.position);
        if (opponentTrackIndex === captureTrackIndex && !opponentToken.inHome && !opponentToken.isSafe) {
          opponentToken.position = -1;
          opponentToken.isSafe = false;
          opponentToken.boardCell = null;
          captured = true;
        }
      }
    }
  }

  token.isSafe = isSafePosition(activePlayer.color, token.position);
  token.boardCell = getBoardCell(activePlayer.color, token.position);

  const move = {
    playerId,
    tokenIndex,
    from: previousPosition,
    to: token.position,
    diceValue,
    captured: false,
  };

  if (previousPosition !== -1 && token.position === HOME_INDEX) {
    const allHome = playerState.tokens.every((entry) => entry.inHome);
    if (allHome) {
      game.winnerId = playerId;
      game.phase = 'finished';
    }
  }

  const moveResult = { ...move, captured };
  game.lastMove = moveResult;

  if (game.phase !== 'finished' && diceValue !== 6 && !captured) {
    game.consecutiveSixes = 0;
    nextTurn(game);
  }

  return game.lastMove;
}

export function getLegalTokenIndices(game: GameState, playerId: string, diceValue: number): number[] {
  const playerState = getPlayerById(game, playerId);
  if (!playerState) return [];
  return playerState.tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => !token.inHome)
    .filter(({ index }) => canTokenMove(game, playerState, index, diceValue))
    .map(({ index }) => index);
}
