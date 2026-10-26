// Pure game rules on cell indices. Functions never mutate their input.
import { isFinished, neighborIndices, sizeError } from "./grid.mjs";

export const DIFFICULTIES = Object.freeze({
  beginner: Object.freeze({ label: "Beginner", rows: 9, columns: 9, mines: 10 }),
  intermediate: Object.freeze({ label: "Intermediate", rows: 16, columns: 16, mines: 40 }),
  expert: Object.freeze({ label: "Expert", rows: 16, columns: 30, mines: 99 }),
});

export function createGame(config) {
  const error = sizeError(config);
  if (error) throw new RangeError(error);

  const { rows, columns, mines } = config;
  return {
    rows,
    columns,
    mineCount: mines,
    board: Array.from({ length: rows * columns }, () => ({
      mine: false,
      adjacent: 0,
      revealed: false,
      flagged: false,
    })),
    initialized: false,
    phase: "ready",
    safeLeft: rows * columns - mines,
  };
}

export function countFlags(game) {
  return game.board.reduce((total, cell) => total + Number(cell.flagged), 0);
}

export function toggleFlag(game, index) {
  if (!isPlayable(game, index)) return game;

  const cell = game.board[index];
  if (cell.revealed) return game;

  const board = game.board.slice();
  board[index] = { ...cell, flagged: !cell.flagged };
  return { ...game, board };
}

export function reveal(game, index, random = Math.random, { safeArea = false } = {}) {
  if (!isPlayable(game, index)) return game;
  if (game.board[index].revealed || game.board[index].flagged) return game;

  let board = game.board.slice();
  let initialized = game.initialized;
  if (!initialized) {
    board = placeMines(board, game, index, random, safeArea);
    initialized = true;
  }

  const target = board[index];
  board[index] = { ...target, revealed: true };

  let safeLeft = game.safeLeft;
  let phase = "lost";
  if (!target.mine) {
    safeLeft -= 1;
    if (target.adjacent === 0) safeLeft -= floodReveal(board, game, index);
    phase = safeLeft === 0 ? "won" : "playing";
  }

  return { ...game, board, initialized, phase, safeLeft };
}

export function chord(game, index) {
  if (!isPlayable(game, index) || !game.initialized) return game;

  const cell = game.board[index];
  if (!cell.revealed || cell.adjacent === 0) return game;

  const around = neighborIndices(game, index);
  const adjacentFlags = around.filter((neighbor) => game.board[neighbor].flagged).length;
  if (adjacentFlags !== cell.adjacent) return game;

  let next = game;
  for (const neighbor of around) {
    const { flagged, revealed } = next.board[neighbor];
    if (flagged || revealed) continue;

    next = reveal(next, neighbor);
    if (isFinished(next)) break;
  }

  return next;
}

function isPlayable(game, index) {
  return !isFinished(game)
    && Number.isInteger(index)
    && index >= 0
    && index < game.board.length;
}

function placeMines(board, game, safeIndex, random, safeArea) {
  if (typeof random !== "function") {
    throw new TypeError("Random source must be a function.");
  }

  // A safe area keeps the first cell's neighbors mine-free too, when there is room.
  const area = [safeIndex, ...neighborIndices(game, safeIndex)];
  const protectedCells = new Set(
    safeArea && board.length - area.length >= game.mineCount ? area : [safeIndex],
  );

  const candidates = [];
  for (let index = 0; index < board.length; index += 1) {
    if (!protectedCells.has(index)) candidates.push(index);
  }

  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const value = random();
    if (typeof value !== "number" || value < 0 || value >= 1 || !Number.isFinite(value)) {
      throw new RangeError("Random source must return a number from 0 up to (but not including) 1.");
    }
    const swapIndex = Math.floor(value * (index + 1));
    [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
  }

  for (const mineIndex of candidates.slice(0, game.mineCount)) {
    board[mineIndex] = { ...board[mineIndex], mine: true };
  }

  for (let index = 0; index < board.length; index += 1) {
    if (board[index].mine) continue;
    const adjacent = neighborIndices(game, index)
      .filter((neighbor) => board[neighbor].mine)
      .length;
    board[index] = { ...board[index], adjacent };
  }

  return board;
}

// Reveals the empty region around startIndex in place; returns how many cells it opened.
function floodReveal(board, game, startIndex) {
  const queue = [startIndex];
  const queued = new Set(queue);
  let opened = 0;

  for (let position = 0; position < queue.length; position += 1) {
    for (const neighbor of neighborIndices(game, queue[position])) {
      if (queued.has(neighbor)) continue;
      queued.add(neighbor);
      const cell = board[neighbor];
      if (cell.mine || cell.flagged || cell.revealed) continue;

      board[neighbor] = { ...cell, revealed: true };
      opened += 1;
      if (cell.adjacent === 0) queue.push(neighbor);
    }
  }

  return opened;
}
