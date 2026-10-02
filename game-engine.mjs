export const DIFFICULTIES = Object.freeze({
  beginner: Object.freeze({ label: "Beginner", rows: 9, columns: 9, mines: 10 }),
  intermediate: Object.freeze({ label: "Intermediate", rows: 16, columns: 16, mines: 40 }),
  expert: Object.freeze({ label: "Expert", rows: 16, columns: 30, mines: 99 }),
});

const NEIGHBOR_OFFSETS = Object.freeze([
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],             [0, 1],
  [1, -1],  [1, 0],   [1, 1],
]);

export function createGame({ rows, columns, mines }) {
  if (!Number.isInteger(rows) || rows < 1) {
    throw new RangeError("Rows must be a positive integer.");
  }
  if (!Number.isInteger(columns) || columns < 1) {
    throw new RangeError("Columns must be a positive integer.");
  }
  if (!Number.isInteger(mines) || mines < 1 || mines >= rows * columns) {
    throw new RangeError("Mine count must be positive and leave at least one safe cell.");
  }

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
  };
}

export function toggleFlag(game, row, column) {
  if (!isPlayableCell(game, row, column)) return game;

  const index = row * game.columns + column;
  const cell = game.board[index];
  if (cell.revealed) return game;

  const board = game.board.slice();
  board[index] = { ...cell, flagged: !cell.flagged };
  return { ...game, board, phase: game.initialized ? game.phase : "ready" };
}

export function revealCell(game, row, column, random = Math.random) {
  if (!isPlayableCell(game, row, column)) return game;

  const index = row * game.columns + column;
  if (game.board[index].revealed || game.board[index].flagged) return game;

  let board = game.board.slice();
  let initialized = game.initialized;
  if (!initialized) {
    board = placeMines(board, game, index, random);
    initialized = true;
  }

  const target = board[index];
  board[index] = { ...target, revealed: true };

  let phase = target.mine ? "lost" : "playing";
  if (!target.mine && target.adjacent === 0) {
    revealNeighbors(board, game, index);
  }

  if (phase !== "lost" && hasWon(board, game.mineCount)) {
    phase = "won";
  }

  return { ...game, board, initialized, phase };
}

export function chordCell(game, row, column) {
  if (!isPlayableCell(game, row, column) || !game.initialized) return game;

  const index = row * game.columns + column;
  const cell = game.board[index];
  if (!cell.revealed || cell.adjacent === 0) return game;

  const adjacentIndices = neighbors(game, row, column);
  const adjacentFlags = adjacentIndices
    .filter((neighborIndex) => game.board[neighborIndex].flagged)
    .length;
  if (adjacentFlags !== cell.adjacent) return game;

  let nextGame = game;
  for (const neighborIndex of adjacentIndices) {
    const neighbor = nextGame.board[neighborIndex];
    if (neighbor.flagged || neighbor.revealed) continue;

    nextGame = revealCell(
      nextGame,
      Math.floor(neighborIndex / game.columns),
      neighborIndex % game.columns,
    );
    if (nextGame.phase === "won" || nextGame.phase === "lost") break;
  }

  return nextGame;
}

function isPlayableCell(game, row, column) {
  return game.phase !== "won"
    && game.phase !== "lost"
    && Number.isInteger(row)
    && Number.isInteger(column)
    && row >= 0
    && row < game.rows
    && column >= 0
    && column < game.columns;
}

function placeMines(board, game, safeIndex, random) {
  if (typeof random !== "function") {
    throw new TypeError("Random source must be a function.");
  }

  const candidates = [];
  for (let index = 0; index < board.length; index += 1) {
    if (index !== safeIndex) candidates.push(index);
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
    const row = Math.floor(index / game.columns);
    const column = index % game.columns;
    const adjacent = neighbors(game, row, column)
      .filter((neighborIndex) => board[neighborIndex].mine)
      .length;
    board[index] = { ...board[index], adjacent };
  }

  return board;
}

function revealNeighbors(board, game, startIndex) {
  const queue = [startIndex];
  const queued = new Set(queue);

  for (let position = 0; position < queue.length; position += 1) {
    const index = queue[position];
    const row = Math.floor(index / game.columns);
    const column = index % game.columns;

    for (const neighborIndex of neighbors(game, row, column)) {
      if (queued.has(neighborIndex)) continue;
      queued.add(neighborIndex);
      const neighbor = board[neighborIndex];
      if (neighbor.mine || neighbor.flagged || neighbor.revealed) continue;

      board[neighborIndex] = { ...neighbor, revealed: true };
      if (neighbor.adjacent === 0) queue.push(neighborIndex);
    }
  }
}

function neighbors(game, row, column) {
  const result = [];
  for (const [rowOffset, columnOffset] of NEIGHBOR_OFFSETS) {
    const nextRow = row + rowOffset;
    const nextColumn = column + columnOffset;
    if (
      nextRow >= 0
      && nextRow < game.rows
      && nextColumn >= 0
      && nextColumn < game.columns
    ) {
      result.push(nextRow * game.columns + nextColumn);
    }
  }
  return result;
}

function hasWon(board, mineCount) {
  return board.reduce((revealedSafeCells, cell) => (
    revealedSafeCells + Number(cell.revealed && !cell.mine)
  ), 0) === board.length - mineCount;
}
