import test from "node:test";
import assert from "node:assert/strict";
import { createGame, reveal } from "../core/engine.mjs";
import { indexAt } from "../core/grid.mjs";
import { canChord, nextIndex } from "../ui/input.mjs";

const GRID = { rows: 4, columns: 5 };

test("arrow keys move one square and stay inside the row", () => {
  const middle = indexAt(5, 1, 2);
  assert.equal(nextIndex(GRID, middle, "ArrowUp"), indexAt(5, 0, 2));
  assert.equal(nextIndex(GRID, middle, "ArrowDown"), indexAt(5, 2, 2));
  assert.equal(nextIndex(GRID, middle, "ArrowLeft"), indexAt(5, 1, 1));
  assert.equal(nextIndex(GRID, middle, "ArrowRight"), indexAt(5, 1, 3));
  assert.equal(nextIndex(GRID, indexAt(5, 1, 0), "ArrowLeft"), indexAt(5, 1, 0));
  assert.equal(nextIndex(GRID, indexAt(5, 1, 4), "ArrowRight"), indexAt(5, 1, 4));
});

test("up and down in the first and last row jump to the first and last square, as in v1", () => {
  assert.equal(nextIndex(GRID, 3, "ArrowUp"), 0);
  assert.equal(nextIndex(GRID, 16, "ArrowDown"), 19);
});

test("Home and End go to the row ends, with Ctrl to the board ends", () => {
  const index = indexAt(5, 2, 2);
  assert.equal(nextIndex(GRID, index, "Home"), indexAt(5, 2, 0));
  assert.equal(nextIndex(GRID, index, "End"), indexAt(5, 2, 4));
  assert.equal(nextIndex(GRID, index, "Home", true), 0);
  assert.equal(nextIndex(GRID, index, "End", true), 19);
});

test("other keys are not navigation", () => {
  assert.equal(nextIndex(GRID, 0, "a"), null);
  assert.equal(nextIndex(GRID, 0, "Enter"), null);
});

test("chording needs a revealed number in a game that is still on", () => {
  const game = reveal(createGame({ rows: 3, columns: 3, mines: 1 }), 4, () => 0);
  const number = game.board.findIndex((cell) => cell.revealed && cell.adjacent > 0);
  const covered = game.board.findIndex((cell) => !cell.revealed);
  assert.equal(canChord(game, number), true);
  assert.equal(canChord(game, covered), false);
  assert.equal(canChord({ ...game, phase: "lost" }, number), false);
});
