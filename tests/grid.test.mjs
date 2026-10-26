import test from "node:test";
import assert from "node:assert/strict";
import {
  indexAt, inBounds, isFinished, MAX_COLUMNS, MAX_ROWS, neighborIndices, positionLabel, rowCol, sizeError,
} from "../core/grid.mjs";

test("sizeError accepts valid sizes and explains invalid ones", () => {
  assert.equal(sizeError({ rows: 9, columns: 9, mines: 10 }), null);
  assert.equal(sizeError({ rows: MAX_ROWS, columns: MAX_COLUMNS, mines: 959 }), null);
  assert.match(sizeError({ rows: 0, columns: 9, mines: 1 }), /Rows/);
  assert.match(sizeError({ rows: MAX_ROWS + 1, columns: 9, mines: 1 }), /Rows/);
  assert.match(sizeError({ rows: 1.5, columns: 9, mines: 1 }), /Rows/);
  assert.match(sizeError({ rows: 9, columns: MAX_COLUMNS + 1, mines: 1 }), /Columns/);
  assert.match(sizeError({ rows: 9, columns: "9", mines: 1 }), /Columns/);
  assert.match(sizeError({ rows: 3, columns: 3, mines: 0 }), /Mine count/);
  assert.match(sizeError({ rows: 3, columns: 3, mines: 9 }), /Mine count/);
  assert.match(sizeError({ rows: 3, columns: 3, mines: 2.5 }), /Mine count/);
});

test("rowCol and indexAt round trip", () => {
  for (let index = 0; index < 35; index += 1) {
    const { row, column } = rowCol(7, index);
    assert.equal(indexAt(7, row, column), index);
  }
  assert.deepEqual(rowCol(7, 15), { row: 2, column: 1 });
});

test("inBounds needs integers inside the board", () => {
  assert.equal(inBounds(3, 4, 0, 0), true);
  assert.equal(inBounds(3, 4, 2, 3), true);
  assert.equal(inBounds(3, 4, 3, 0), false);
  assert.equal(inBounds(3, 4, 0, 4), false);
  assert.equal(inBounds(3, 4, -1, 0), false);
  assert.equal(inBounds(3, 4, 0.5, 0), false);
});

test("neighborIndices lists neighbors in row-major order with correct counts", () => {
  const game = { rows: 4, columns: 5 };
  assert.deepEqual(neighborIndices(game, 6), [0, 1, 2, 5, 7, 10, 11, 12]);
  assert.deepEqual(neighborIndices(game, 0), [1, 5, 6]);
  assert.equal(neighborIndices(game, 4).length, 3);
  assert.equal(neighborIndices(game, 2).length, 5);
  assert.equal(neighborIndices(game, 10).length, 5);
  assert.equal(neighborIndices({ rows: 1, columns: 1 }, 0).length, 0);
});

test("neighborIndices reuses one frozen table per board size", () => {
  assert.equal(neighborIndices({ rows: 6, columns: 6 }, 7), neighborIndices({ rows: 6, columns: 6, phase: "x" }, 7));
  assert.ok(Object.isFrozen(neighborIndices({ rows: 6, columns: 6 }, 7)));
  assert.notEqual(neighborIndices({ rows: 6, columns: 7 }, 7), neighborIndices({ rows: 6, columns: 6 }, 7));
});

test("positionLabel is 1-based", () => {
  assert.equal(positionLabel({ columns: 9 }, 0), "row 1, column 1");
  assert.equal(positionLabel({ columns: 9 }, 40), "row 5, column 5");
});

test("isFinished is true only for won and lost", () => {
  assert.equal(isFinished({ phase: "won" }), true);
  assert.equal(isFinished({ phase: "lost" }), true);
  assert.equal(isFinished({ phase: "ready" }), false);
  assert.equal(isFinished({ phase: "playing" }), false);
});
