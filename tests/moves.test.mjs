import test from "node:test";
import assert from "node:assert/strict";
import { createGame, DIFFICULTIES } from "../core/engine.mjs";
import { isFinished } from "../core/grid.mjs";
import { applyMove, replay, startGame, toRecord } from "../core/moves.mjs";
import { createRandom } from "../core/seed.mjs";
import { generateBoard, nextAgentMove } from "../core/solver.mjs";

const CONFIG = DIFFICULTIES.beginner;
const fresh = (noGuess = false) => startGame({ config: CONFIG, seed: "moves-1", noGuess });

// Plays the autoplayer to the end through applyMove.
function playThrough(state) {
  const random = createRandom("agent");
  let at = 0;
  while (!isFinished(state.game) && at < 500) {
    const step = nextAgentMove(state.game, random);
    const type = step.action === "reveal" ? "reveal" : "flag";
    state = applyMove(state, { type, index: step.index, at: (at += 10) });
  }
  return state;
}

test("moves that change nothing are not recorded", () => {
  const state = fresh();
  assert.equal(applyMove(state, { type: "undo", at: 5 }), state);
  assert.equal(applyMove(state, { type: "chord", index: 4, at: 5 }), state);
  assert.equal(applyMove(state, { type: "reveal", index: 999, at: 5 }), state);

  const flagged = applyMove(state, { type: "flag", index: 3, at: 10 });
  assert.equal(applyMove(flagged, { type: "reveal", index: 3, at: 20 }), flagged);
  assert.equal(flagged.moves.length, 1);
});

test("undo restores the previous game and is itself recorded", () => {
  const start = fresh();
  const flagged = applyMove(start, { type: "flag", index: 0, at: 1 });
  const revealed = applyMove(flagged, { type: "reveal", index: 40, at: 2 });
  assert.equal(revealed.history.length, 2);

  const undone = applyMove(revealed, { type: "undo", at: 3 });
  assert.equal(undone.game, flagged.game);
  assert.equal(undone.history.length, 1);
  assert.deepEqual(undone.moves.map((move) => move.type), ["flag", "reveal", "undo"]);

  const back = applyMove(undone, { type: "undo", at: 4 });
  assert.equal(back.game, start.game);
  assert.equal(back.guaranteed, false);
});

test("the first reveal uses the seed, like generateBoard", () => {
  for (const noGuess of [false, true]) {
    const state = applyMove(fresh(noGuess), { type: "reveal", index: 40, at: 1 });
    const expected = generateBoard(createGame(CONFIG), 40, createRandom("moves-1"), { noGuess });
    assert.deepEqual(state.game, expected.game);
    assert.equal(state.guaranteed, expected.guaranteed);
  }
});

test("a played game survives toRecord, JSON and replay", () => {
  const played = playThrough(fresh(true));
  assert.equal(isFinished(played.game), true);

  const record = JSON.parse(JSON.stringify(toRecord(played)));
  assert.deepEqual(Object.keys(record), ["config", "seed", "noGuess", "moves"]);
  const frames = replay(record);
  assert.equal(frames.length, record.moves.length + 1);
  assert.deepEqual(frames[0], { game: createGame(CONFIG), at: 0 });
  assert.deepEqual(frames.at(-1).game, played.game);
  assert.equal(frames.at(-1).game.phase, played.game.phase);
  assert.deepEqual(frames.map((frame) => frame.at), [0, ...record.moves.map((move) => move.at)]);
});

test("replay folds undo moves too", () => {
  let state = applyMove(fresh(), { type: "reveal", index: 40, at: 1 });
  state = applyMove(state, { type: "undo", at: 2 });
  const frames = replay(toRecord(state));
  assert.equal(frames.length, 3);
  assert.equal(frames[2].game.initialized, false);
});

test("unknown moves and bad records throw a TypeError", () => {
  assert.throws(() => applyMove(fresh(), { type: "jump", index: 0, at: 1 }), TypeError);
  assert.throws(() => applyMove(fresh(), { type: "constructor", index: 0, at: 1 }), TypeError);

  const good = toRecord(fresh());
  assert.deepEqual(replay(good).length, 1);
  for (const bad of [
    null,
    "text",
    {},
    { ...good, config: { rows: 0, columns: 9, mines: 10 } },
    { ...good, config: undefined },
    { ...good, seed: 5 },
    { ...good, moves: "none" },
    { ...good, moves: [{ type: "dance", index: 0, at: 1 }] },
  ]) {
    assert.throws(() => replay(bad), TypeError);
  }
});

test("a no-guess first reveal on a flagged or invalid square is ignored without generating a board", () => {
  let state = startGame({ config: DIFFICULTIES.expert, seed: "flagged", noGuess: true });
  state = applyMove(state, { type: "flag", index: 5, at: 0 });
  const began = performance.now();
  assert.equal(applyMove(state, { type: "reveal", index: 5, at: 10 }), state);
  assert.equal(applyMove(state, { type: "reveal", index: -1, at: 10 }), state);
  assert.ok(performance.now() - began < 50, "should skip the 300 generation attempts");
});
