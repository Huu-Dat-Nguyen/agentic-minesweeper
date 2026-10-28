import test from "node:test";
import assert from "node:assert/strict";
import { createGame, DIFFICULTIES, reveal, toggleFlag } from "../core/engine.mjs";
import { changedCells, cellView } from "../ui/board.mjs";

const cell = (fields) => ({ mine: false, adjacent: 0, revealed: false, flagged: false, ...fields });
const view = (fields, options = {}) => cellView(cell(fields), { phase: "playing", position: "Row 1, column 2", ...options });

test("covered, flagged and revealed cells", () => {
  assert.deepEqual(view({}), { classes: [], text: "", label: "Row 1, column 2, covered" });
  assert.deepEqual(view({ flagged: true }), { classes: ["is-flagged"], text: "⚑", label: "Row 1, column 2, flagged" });
  assert.deepEqual(view({ revealed: true }), { classes: ["is-revealed"], text: "", label: "Row 1, column 2, empty" });
  assert.deepEqual(view({ revealed: true, adjacent: 1 }), {
    classes: ["is-revealed", "number-1"], text: "1", label: "Row 1, column 2, 1 adjacent mine",
  });
  assert.equal(view({ revealed: true, adjacent: 3 }).label, "Row 1, column 2, 3 adjacent mines");
  assert.deepEqual(view({ revealed: true, mine: true }), {
    classes: ["is-revealed", "is-mine"], text: "✹", label: "Row 1, column 2, mine",
  });
});

test("a lost game exposes mines and wrong flags", () => {
  const lost = { phase: "lost" };
  assert.deepEqual(view({ mine: true }, lost), {
    classes: ["is-exposed-mine"], text: "✹", label: "Row 1, column 2, mine",
  });
  assert.deepEqual(view({ flagged: true }, lost), {
    classes: ["is-flagged", "is-wrong-flag"], text: "×", label: "Row 1, column 2, incorrect flag",
  });
  assert.deepEqual(view({ mine: true, flagged: true }, lost), {
    classes: ["is-flagged"], text: "⚑", label: "Row 1, column 2, mine",
  });
  assert.deepEqual(view({ mine: true, revealed: true }, lost).classes, ["is-revealed", "is-mine", "is-exposed-mine"]);
});

test("ghost mines and hints", () => {
  assert.deepEqual(view({ mine: true }, { ghost: true }), {
    classes: ["is-ghost-mine"], text: "✹", label: "Row 1, column 2, mine",
  });
  assert.equal(view({ mine: true, flagged: true }, { ghost: true }).label, "Row 1, column 2, mine");
  assert.deepEqual(view({}, { hinted: true, hintClue: true }), {
    classes: ["is-hint", "is-hint-clue"], text: "", label: "Row 1, column 2, covered, hinted",
  });
  assert.equal(view({ flagged: true }, { hinted: true }).label, "Row 1, column 2, flagged, hinted");
});

test("changedCells finds only the cells that differ", () => {
  const first = createGame(DIFFICULTIES.beginner);
  const prev = { game: first, hint: null, ghost: false };
  assert.equal(changedCells(null, prev).length, 81);

  const flagged = toggleFlag(first, 5);
  assert.deepEqual(changedCells(prev, { game: flagged, hint: null, ghost: false }), [5]);
  assert.deepEqual(changedCells(prev, prev), []);

  const small = createGame({ rows: 3, columns: 3, mines: 1 });
  assert.equal(changedCells(prev, { game: small, hint: null, ghost: false }).length, 9);
});

test("changedCells repaints everything when the game is lost or ghosts toggle", () => {
  let game = reveal(createGame(DIFFICULTIES.beginner), 40, () => 0.5);
  const mine = game.board.findIndex((c) => c.mine);
  const lost = reveal(game, mine);
  assert.equal(lost.phase, "lost");
  const prev = { game, hint: null, ghost: false };
  assert.equal(changedCells(prev, { game: lost, hint: null, ghost: false }).length, 81);
  assert.equal(changedCells({ game: lost, hint: null, ghost: false }, { game, hint: null, ghost: false }).length, 81);
  assert.equal(changedCells(prev, { ...prev, ghost: true }).length, 81);
});

test("changedCells includes cells whose hint status changed", () => {
  const game = createGame(DIFFICULTIES.beginner);
  const hint = (cells, clues) => ({ game, hint: { cells, clues }, ghost: false });
  assert.deepEqual(changedCells(hint([1], [2]), hint([1], [3])).sort(), [2, 3]);
  assert.deepEqual(changedCells({ game, hint: null, ghost: false }, hint([4], [])), [4]);
  assert.deepEqual(changedCells(hint([4], [5]), { game, hint: null, ghost: false }).sort(), [4, 5]);
});
