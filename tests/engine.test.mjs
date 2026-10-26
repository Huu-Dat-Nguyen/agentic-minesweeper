import test from "node:test";
import assert from "node:assert/strict";
import { chord, countFlags, createGame, reveal, toggleFlag } from "../core/engine.mjs";
import { MAX_COLUMNS, MAX_ROWS, neighborIndices, rowCol } from "../core/grid.mjs";

function seededRandom(seed = 42) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createChordScenario() {
  const initialGame = createGame({ rows: 12, columns: 12, mines: 18 });
  const game = reveal(initialGame, 5 * 12 + 5, seededRandom());
  const targetIndex = game.board.findIndex((cell, index) => {
    if (!cell.revealed || cell.adjacent === 0) return false;
    return neighborIndices(game, index).some((neighborIndex) => (
      game.board[neighborIndex].mine
      && !game.board[neighborIndex].flagged
      && !game.board[neighborIndex].revealed
    )) && neighborIndices(game, index).some((neighborIndex) => (
      !game.board[neighborIndex].mine
      && !game.board[neighborIndex].flagged
      && !game.board[neighborIndex].revealed
    ));
  });
  assert.notEqual(targetIndex, -1, "seeded board must contain a useful chord target");
  return { game, targetIndex };
}

function flagMinesAround(game, index) {
  let result = game;
  for (const neighbor of neighborIndices(game, index)) {
    if (game.board[neighbor].mine) result = toggleFlag(result, neighbor);
  }
  return result;
}

test("creates a clean board and rejects invalid dimensions", () => {
  const game = createGame({ rows: 4, columns: 5, mines: 3 });
  assert.equal(game.board.length, 20);
  assert.equal(game.phase, "ready");
  assert.equal(game.initialized, false);
  assert.equal(game.safeLeft, 17);
  assert.throws(() => createGame({ rows: 1, columns: 1, mines: 1 }), RangeError);
  assert.throws(() => createGame({ rows: 0, columns: 4, mines: 1 }), RangeError);
});

test("places the exact number of mines away from the first reveal and counts neighbors", () => {
  const game = createGame({ rows: 4, columns: 4, mines: 4 });
  const result = reveal(game, 5, () => 0);
  const mines = result.board
    .map((cell, index) => cell.mine ? index : -1)
    .filter((index) => index >= 0);

  assert.equal(mines.length, 4);
  assert.equal(result.board[5].mine, false);
  for (const [index, cell] of result.board.entries()) {
    if (cell.mine) continue;
    const { row, column } = rowCol(result.columns, index);
    assert.equal(
      cell.adjacent,
      mines.filter((mineIndex) => {
        const mine = rowCol(result.columns, mineIndex);
        const rowDistance = Math.abs(mine.row - row);
        const columnDistance = Math.abs(mine.column - column);
        return rowDistance <= 1 && columnDistance <= 1 && rowDistance + columnDistance > 0;
      }).length,
    );
  }
});

test("safely floods empty areas while preserving flags", () => {
  const game = createGame({ rows: 4, columns: 4, mines: 1 });
  const flagged = toggleFlag(game, 15);
  const result = reveal(flagged, 0, () => 0);
  assert.equal(result.board[15].flagged, true);
  assert.equal(result.board[15].revealed, false);
  assert.ok(result.board.filter((cell) => cell.revealed).length > 1);
  assert.equal(result.phase, "playing");
});

test("allows flags before the first reveal and does not reveal a flagged cell", () => {
  const game = createGame({ rows: 3, columns: 3, mines: 1 });
  const flagged = toggleFlag(game, 0);
  assert.equal(flagged.phase, "ready");
  assert.equal(countFlags(flagged), 1);
  const result = reveal(flagged, 0, () => 0);
  assert.equal(result.initialized, false);
  assert.equal(result.board[0].revealed, false);
  assert.equal(result.board[0].flagged, true);
});

test("marks a loss when a mine is revealed and ignores actions after game over", () => {
  let game = createGame({ rows: 4, columns: 4, mines: 4 });
  game = reveal(game, 0, () => 0);
  const mineIndex = game.board.findIndex((cell) => cell.mine);
  assert.notEqual(mineIndex, -1);
  assert.notEqual(game.phase, "won");
  game = reveal(game, mineIndex);
  assert.equal(game.phase, "lost");
  assert.equal(game.board[mineIndex].revealed, true);
  assert.equal(toggleFlag(game, 1), game);
});

test("wins after all safe squares are revealed without requiring flags", () => {
  let game = createGame({ rows: 2, columns: 2, mines: 1 });
  const randomValues = [0, 0.99];
  game = reveal(game, 0, () => randomValues.shift());
  assert.equal(game.board[3].mine, true);
  for (let index = 0; index < game.board.length; index += 1) {
    if (game.board[index].mine) continue;
    game = reveal(game, index);
  }
  assert.equal(game.phase, "won");
  assert.equal(game.safeLeft, 0);
  assert.equal(game.board.filter((cell) => cell.revealed && !cell.mine).length, 3);
});

test("ignores out-of-bounds, non-integer, and repeated reveals", () => {
  const game = createGame({ rows: 3, columns: 3, mines: 1 });
  assert.equal(reveal(game, -1), game);
  assert.equal(reveal(game, 9), game);
  assert.equal(reveal(game, 1.5), game);

  const revealed = reveal(game, 0, () => 0);
  assert.equal(reveal(revealed, 0), revealed);
});

test("rejects an invalid random source without mutating the original game", () => {
  const game = createGame({ rows: 3, columns: 3, mines: 1 });
  assert.throws(() => reveal(game, 0, () => 1), RangeError);
  assert.throws(() => reveal(game, 0, "nope"), TypeError);
  assert.equal(game.initialized, false);
  assert.equal(game.board.some((cell) => cell.mine), false);
});

test("safe-area first reveal keeps neighbors mine-free, falling back when there is no room", () => {
  const roomy = reveal(createGame({ rows: 5, columns: 5, mines: 10 }), 12, seededRandom(), { safeArea: true });
  for (const index of [12, ...neighborIndices(roomy, 12)]) assert.equal(roomy.board[index].mine, false);

  const tight = reveal(createGame({ rows: 3, columns: 3, mines: 8 }), 4, seededRandom(), { safeArea: true });
  assert.equal(tight.board[4].mine, false);
  assert.equal(tight.board.filter((cell) => cell.mine).length, 8);
});

test("chords a numbered cell when flags match and reveals its covered neighbors", () => {
  const { game: initialGame, targetIndex } = createChordScenario();
  const neighbors = neighborIndices(initialGame, targetIndex);
  const game = flagMinesAround(initialGame, targetIndex);

  const adjacentFlags = neighbors.filter((index) => game.board[index].flagged).length;
  assert.equal(adjacentFlags, game.board[targetIndex].adjacent);
  const expectedSafeNeighbors = neighbors.filter((index) => (
    !game.board[index].mine
    && !game.board[index].flagged
    && !game.board[index].revealed
  ));

  const result = chord(game, targetIndex);
  assert.ok(expectedSafeNeighbors.length > 0);
  for (const index of expectedSafeNeighbors) {
    assert.equal(result.board[index].revealed, true);
  }
  assert.notEqual(result.phase, "lost");
});

test("does not chord unless adjacent flag count exactly matches the clue", () => {
  const { game: initialGame, targetIndex } = createChordScenario();
  const neighbors = neighborIndices(initialGame, targetIndex);
  const exactlyFlagged = flagMinesAround(initialGame, targetIndex);
  assert.notEqual(chord(exactlyFlagged, targetIndex), exactlyFlagged);

  const extraSafeNeighbor = neighbors.find((index) => (
    !initialGame.board[index].mine
    && !initialGame.board[index].revealed
  ));
  assert.notEqual(extraSafeNeighbor, undefined);
  const overFlagged = toggleFlag(exactlyFlagged, extraSafeNeighbor);
  assert.equal(chord(overFlagged, targetIndex), overFlagged);

  const { game, targetIndex: unmatchedTarget } = createChordScenario();
  assert.equal(chord(game, unmatchedTarget), game);
});

test("chording with the wrong matching flags reveals the mine and loses", () => {
  const { game: initialGame, targetIndex } = createChordScenario();
  const target = initialGame.board[targetIndex];
  const safeNeighbors = neighborIndices(initialGame, targetIndex).filter((index) => (
    !initialGame.board[index].mine
    && !initialGame.board[index].revealed
  ));
  assert.ok(safeNeighbors.length >= target.adjacent, "scenario must allow an equal-count wrong flag set");

  let game = initialGame;
  for (const index of safeNeighbors.slice(0, target.adjacent)) {
    game = toggleFlag(game, index);
  }

  const result = chord(game, targetIndex);
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

test("moves never mutate earlier snapshots", () => {
  const start = createGame({ rows: 3, columns: 3, mines: 1 });
  const flagged = toggleFlag(start, 0);
  const revealed = reveal(flagged, 8, () => 0);

  assert.notEqual(revealed, flagged);
  assert.equal(start.board[0].flagged, false);
  assert.equal(start.initialized, false);
  assert.equal(flagged.board[0].flagged, true);
  assert.equal(flagged.board[8].revealed, false);
  assert.equal(flagged.initialized, false);
  assert.equal(revealed.phase, "playing");
});

test("an earlier snapshot of a lost game stays playable", () => {
  const before = reveal(createGame({ rows: 2, columns: 2, mines: 1 }), 0, () => 0);
  const mineIndex = before.board.findIndex((cell) => cell.mine);
  const lost = reveal(before, mineIndex);
  assert.equal(lost.phase, "lost");
  assert.equal(before.phase, "playing");
  assert.equal(before.board[mineIndex].revealed, false);
  assert.equal(reveal(lost, mineIndex === 1 ? 2 : 1), lost);
});

test("chording a flood chain clears every connected safe neighbor", () => {
  const { game: initialGame, targetIndex } = createChordScenario();
  const neighbors = neighborIndices(initialGame, targetIndex);
  const game = flagMinesAround(initialGame, targetIndex);

  const result = chord(game, targetIndex);
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
  const first = reveal(createGame({ rows: 3, columns: 3, mines: 2 }), 0, () => 0);
  const safeIndices = first.board
    .map((cell, index) => (cell.mine ? -1 : index))
    .filter((index) => index >= 0);
  assert.equal(safeIndices.length, 7);

  const lastSafeIndex = safeIndices[safeIndices.length - 1];
  let game = first;
  for (const index of safeIndices) {
    if (index === 0 || index === lastSafeIndex) continue;
    game = reveal(game, index);
  }
  assert.equal(game.phase, "playing");
  assert.equal(game.safeLeft, 1);

  const clueIndex = neighborIndices(game, lastSafeIndex).find((index) => (
    game.board[index].revealed && game.board[index].adjacent > 0
  ));
  assert.notEqual(clueIndex, undefined, "last safe cell must border a revealed clue");

  game = flagMinesAround(game, clueIndex);
  const result = chord(game, clueIndex);
  assert.equal(result.board[lastSafeIndex].revealed, true);
  assert.equal(result.phase, "won");
});
