// Seeded boards, daily boards and share links must match v1 exactly (golden.json).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as v2 from "../core/engine.mjs";
import * as engine from "../game-engine.mjs";
import * as seed from "../seed.mjs";
import * as solver from "../solver.mjs";
import * as stats from "../stats.mjs";
import { buildGolden } from "./fixtures/golden-cases.mjs";

const golden = JSON.parse(readFileSync(new URL("./fixtures/golden.json", import.meta.url), "utf8"));
const current = JSON.parse(JSON.stringify(buildGolden({ engine, seed, solver, stats })));

for (const part of ["boards", "daily", "random", "shares"]) {
  test(`golden ${part} match v1`, () => {
    assert.deepEqual(current[part], golden[part]);
  });
}

test("v2 engine places mines like v1", () => {
  for (const board of golden.boards.filter((entry) => entry.noGuess === false)) {
    const game = v2.reveal(v2.createGame(board.config), board.start, seed.createRandom(board.seed));
    const indices = (test) => game.board.flatMap((cell, index) => (test(cell) ? [index] : []));
    const label = `${board.config.rows}x${board.config.columns} ${board.seed}`;
    assert.deepEqual(indices((cell) => cell.mine), board.mines, label);
    assert.deepEqual(indices((cell) => cell.revealed), board.revealed, label);
    assert.equal(game.phase, board.phase, label);
  }
});
