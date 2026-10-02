import test from "node:test";
import assert from "node:assert/strict";
import { chordCell, createGame, MAX_COLUMNS, MAX_ROWS, revealCell, toggleFlag, undo } from "./game-engine.mjs";

function seededRandom(seed = 42) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function getNeighborIndices(game, index) {
  const row = Math.floor(index / game.columns);
  const column = index % game.columns;
  const indices = [];
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) continue;
      const nextRow = row + rowOffset;
      const nextColumn = column + columnOffset;
      if (
        nextRow >= 0
        && nextRow < game.rows
        && nextColumn >= 0
        && nextColumn < game.columns
      ) {
        indices.push(nextRow * game.columns + nextColumn);
      }
    }
  }
  return indices;
}

function createChordScenario() {
  const initialGame = createGame({ rows: 12, columns: 12, mines: 18 });
  const game = revealCell(initialGame, 5, 5, seededRandom());
  const targetIndex = game.board.findIndex((cell, index) => {
    if (!cell.revealed || cell.adjacent === 0) return false;
    return getNeighborIndices(game, index).some((neighborIndex) => (
      game.board[neighborIndex].mine
      && !game.board[neighborIndex].flagged
      && !game.board[neighborIndex].revealed
    )) && getNeighborIndices(game, index).some((neighborIndex) => (
      !game.board[neighborIndex].mine
      && !game.board[neighborIndex].flagged
      && !game.board[neighborIndex].revealed
    ));
  });
  assert.notEqual(targetIndex, -1, "seeded board must contain a useful chord target");
  return { game, targetIndex };
}

test("creates a clean board and rejects invalid dimensions", () => {
  const game = createGame({ rows: 4, columns: 5, mines: 3 });
  assert.equal(game.board.length, 20);
  assert.equal(game.phase, "ready");
  assert.equal(game.initialized, false);
  assert.throws(() => createGame({ rows: 1, columns: 1, mines: 1 }), RangeError);
  assert.throws(() => createGame({ rows: 0, columns: 4, mines: 1 }), RangeError);
});

test("places the exact number of mines away from the first reveal and counts neighbors", () => {
  const game = createGame({ rows: 4, columns: 4, mines: 4 });
  const result = revealCell(game, 1, 1, () => 0);
  const mines = result.board
    .map((cell, index) => cell.mine ? index : -1)
    .filter((index) => index >= 0);

  assert.equal(mines.length, 4);
  assert.equal(result.board[5].mine, false);
  for (const [index, cell] of result.board.entries()) {
    if (cell.mine) continue;
    const row = Math.floor(index / result.columns);
    const column = index % result.columns;
    assert.equal(
      cell.adjacent,
      mines.filter((mineIndex) => {
        const rowDistance = Math.abs(Math.floor(mineIndex / result.columns) - row);
        const columnDistance = Math.abs((mineIndex % result.columns) - column);
        return rowDistance <= 1 && columnDistance <= 1 && rowDistance + columnDistance > 0;
      }).length,
    );
  }
});

test("safely floods empty areas while preserving flags", () => {
  const game = createGame({ rows: 4, columns: 4, mines: 1 });
  const flagged = toggleFlag(game, 3, 3);
  const result = revealCell(flagged, 0, 0, () => 0);
  assert.equal(result.board[15].flagged, true);
  assert.equal(result.board[15].revealed, false);
  assert.ok(result.board.filter((cell) => cell.revealed).length > 1);
  assert.equal(result.phase, "playing");
});

test("allows flags before the first reveal and does not reveal a flagged cell", () => {
  const game = createGame({ rows: 3, columns: 3, mines: 1 });
  const flagged = toggleFlag(game, 0, 0);
  const result = revealCell(flagged, 0, 0, () => 0);
  assert.equal(result.initialized, false);
  assert.equal(result.board[0].revealed, false);
  assert.equal(result.board[0].flagged, true);
});

test("marks a loss when a mine is revealed and ignores actions after game over", () => {
  let game = createGame({ rows: 4, columns: 4, mines: 4 });
  game = revealCell(game, 0, 0, () => 0);
  const mineIndex = game.board.findIndex((cell) => cell.mine);
  assert.notEqual(mineIndex, -1);
  assert.notEqual(game.phase, "won");
  game = revealCell(game, Math.floor(mineIndex / game.columns), mineIndex % game.columns);
  assert.equal(game.phase, "lost");
  assert.equal(game.board[mineIndex].revealed, true);
  assert.equal(toggleFlag(game, 0, 1), game);
});

test("wins after all safe squares are revealed without requiring flags", () => {
  let game = createGame({ rows: 2, columns: 2, mines: 1 });
  const randomValues = [0, 0.99];
  game = revealCell(game, 0, 0, () => randomValues.shift());
  assert.equal(game.board[3].mine, true);
  for (let index = 0; index < game.board.length; index += 1) {
    if (game.board[index].mine) continue;
    const row = Math.floor(index / game.columns);
    const column = index % game.columns;
    game = revealCell(game, row, column);
  }
  assert.equal(game.phase, "won");
  assert.equal(game.board.filter((cell) => cell.revealed && !cell.mine).length, 3);
});

test("ignores out-of-bounds, non-integer, and repeated reveals", () => {
  const game = createGame({ rows: 3, columns: 3, mines: 1 });
  assert.equal(revealCell(game, -1, 0), game);
  assert.equal(revealCell(game, 0, 3), game);
  assert.equal(revealCell(game, 1.5, 0), game);

  const revealed = revealCell(game, 0, 0, () => 0);
  assert.equal(revealCell(revealed, 0, 0), revealed);
});

test("rejects an invalid random source without mutating the original game", () => {
  const game = createGame({ rows: 3, columns: 3, mines: 1 });
  assert.throws(() => revealCell(game, 0, 0, () => 1), RangeError);
  assert.equal(game.initialized, false);
  assert.equal(game.board.some((cell) => cell.mine), false);
});

test("chords a numbered cell when flags match and reveals its covered neighbors", () => {
  const { game: initialGame, targetIndex } = createChordScenario();
  const row = Math.floor(targetIndex / initialGame.columns);
  const column = targetIndex % initialGame.columns;
  const neighbors = getNeighborIndices(initialGame, targetIndex);
  let game = initialGame;

  for (const index of neighbors) {
    if (!initialGame.board[index].mine) continue;
    game = toggleFlag(game, Math.floor(index / game.columns), index % game.columns);
  }

  const adjacentFlags = neighbors.filter((index) => game.board[index].flagged).length;
  assert.equal(adjacentFlags, game.board[targetIndex].adjacent);
  const expectedSafeNeighbors = neighbors.filter((index) => (
    !game.board[index].mine
    && !game.board[index].flagged
    && !game.board[index].revealed
  ));

  const result = chordCell(game, row, column);
  assert.ok(expectedSafeNeighbors.length > 0);
  for (const index of expectedSafeNeighbors) {
    assert.equal(result.board[index].revealed, true);
  }
  assert.notEqual(result.phase, "lost");
});

test("does not chord unless adjacent flag count exactly matches the clue", () => {
  const { game: initialGame, targetIndex } = createChordScenario();
  const neighbors = getNeighborIndices(initialGame, targetIndex);
  let exactlyFlagged = initialGame;
  for (const index of neighbors) {
    if (!initialGame.board[index].mine) continue;
    exactlyFlagged = toggleFlag(
      exactlyFlagged,
      Math.floor(index / exactlyFlagged.columns),
      index % exactlyFlagged.columns,
    );
  }
  assert.notEqual(
    chordCell(exactlyFlagged, Math.floor(targetIndex / exactlyFlagged.columns), targetIndex % exactlyFlagged.columns),
    exactlyFlagged,
  );

  const extraSafeNeighbor = neighbors.find((index) => (
    !initialGame.board[index].mine
    && !initialGame.board[index].revealed
  ));
  assert.notEqual(extraSafeNeighbor, undefined);
  const overFlagged = toggleFlag(
    exactlyFlagged,
    Math.floor(extraSafeNeighbor / exactlyFlagged.columns),
    extraSafeNeighbor % exactlyFlagged.columns,
  );
  assert.equal(
    chordCell(overFlagged, Math.floor(targetIndex / overFlagged.columns), targetIndex % overFlagged.columns),
    overFlagged,
  );

  const { game, targetIndex: unmatchedTarget } = createChordScenario();
  assert.equal(
    chordCell(game, Math.floor(unmatchedTarget / game.columns), unmatchedTarget % game.columns),
    game,
  );
});

test("chording with the wrong matching flags reveals the mine and loses", () => {
  const { game: initialGame, targetIndex } = createChordScenario();
  const neighbors = getNeighborIndices(initialGame, targetIndex);
  const target = initialGame.board[targetIndex];
  const safeNeighbors = neighbors.filter((index) => (
    !initialGame.board[index].mine
    && !initialGame.board[index].revealed
  ));
  assert.ok(safeNeighbors.length >= target.adjacent, "scenario must allow an equal-count wrong flag set");

  let game = initialGame;
  for (const index of safeNeighbors.slice(0, target.adjacent)) {
    game = toggleFlag(game, Math.floor(index / game.columns), index % game.columns);
  }

  const result = chordCell(game, Math.floor(targetIndex / game.columns), targetIndex % game.columns);
  assert.equal(result.phase, "lost");
  assert.ok(result.board.some((cell) => cell.mine && cell.revealed));
});

test("accepts custom board sizes within limits and rejects out-of-range dimensions", () => {
  const game = createGame({ rows: 12, columns: 20, mines: 30 });
  assert.equal(game.board.length, 240);
  assert.equal(game.phase, "ready");

  assert.throws(() => createGame({ rows: MAX_ROWS + 1, columns: 9, mines: 1 }), RangeError);
  assert.throws(() => createGame({ rows: 9, columns: MAX_COLUMNS + 1, mines: 1 }), RangeError);
  assert.throws(() => createGame({ rows: -1, columns: 9, mines: 1 }), RangeError);
});

test("restores the exact previous state on undo and ignores an empty history", () => {
  let game = createGame({ rows: 3, columns: 3, mines: 1 });
  assert.equal(undo(game, []), game);

  const history = [];
  history.push(game);
  game = toggleFlag(game, 0, 0);
  history.push(game);
  game = revealCell(game, 2, 2, () => 0);

  const beforeUndo = game;
  game = undo(game, history);
  assert.notEqual(game, beforeUndo);
  assert.equal(game.board[0].flagged, true);
  assert.equal(game.board[8].revealed, false);
  assert.equal(game.initialized, false);

  game = undo(game, history);
  assert.equal(game.board[0].flagged, false);

  game = undo(game, history);
  assert.equal(game.board.length, 9);
  assert.equal(game.board[0].flagged, false);
});

test("undo restores a finished game so play can continue", () => {
  let game = createGame({ rows: 2, columns: 2, mines: 1 });
  const history = [];
  history.push(game);
  game = revealCell(game, 0, 0, () => 0);
  history.push(game);
  game = revealCell(game, 0, 1);
  const mineIndex = game.board.findIndex((cell) => cell.mine);
  history.push(game);
  game = revealCell(game, Math.floor(mineIndex / game.columns), mineIndex % game.columns);
  assert.equal(game.phase, "lost");

  const restored = undo(game, history);
  assert.notEqual(restored.phase, "lost");
  assert.equal(restored.phase, "playing");
});

test("chording a flood chain clears every connected safe neighbor", () => {
  const { game: initialGame, targetIndex } = createChordScenario();
  const neighbors = getNeighborIndices(initialGame, targetIndex);
  const target = initialGame.board[targetIndex];

  let game = initialGame;
  for (const index of neighbors) {
    if (!initialGame.board[index].mine) continue;
    game = toggleFlag(game, Math.floor(index / game.columns), index % game.columns);
  }

  const result = chordCell(game, Math.floor(targetIndex / game.columns), targetIndex % game.columns);
  const coveredBefore = neighbors.filter((index) => (
    !initialGame.board[index].mine
    && !initialGame.board[index].flagged
    && !initialGame.board[index].revealed
  ));
  for (const index of coveredBefore) {
    assert.equal(result.board[index].revealed, true);
  }
  assert.notEqual(result.phase, "lost");
});

test("wins immediately when the final safe cell is revealed by a chord", () => {
  let game = createGame({ rows: 3, columns: 3, mines: 2 });
  const first = revealCell(game, 0, 0, () => 0);
  const safeIndices = first.board
    .map((cell, index) => (cell.mine ? -1 : index))
    .filter((index) => index >= 0);
  assert.equal(safeIndices.length, 7);

  const lastSafeIndex = safeIndices[safeIndices.length - 1];
  game = first;
  for (const index of safeIndices) {
    if (index === 0 || index === lastSafeIndex) continue;
    game = revealCell(game, Math.floor(index / game.columns), index % game.columns);
  }
  assert.equal(game.phase, "playing");
  assert.equal(
    game.board.filter((cell) => cell.revealed && !cell.mine).length,
    safeIndices.length - 1,
  );

  const neighbors = getNeighborIndices(game, lastSafeIndex);
  const clueIndex = neighbors.find((index) => (
    game.board[index].revealed && game.board[index].adjacent > 0
  ));
  assert.notEqual(clueIndex, undefined, "last safe cell must border a revealed clue");

  for (const index of getNeighborIndices(game, clueIndex)) {
    if (!game.board[index].mine) continue;
    game = toggleFlag(game, Math.floor(index / game.columns), index % game.columns);
  }

  const clueRow = Math.floor(clueIndex / game.columns);
  const clueColumn = clueIndex % game.columns;
  const result = chordCell(game, clueRow, clueColumn);
  assert.equal(result.board[lastSafeIndex].revealed, true);
  assert.equal(result.phase, "won");
});
