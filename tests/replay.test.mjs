import test from "node:test";
import assert from "node:assert/strict";
import { applyMove, startGame } from "../core/moves.mjs";
import { dailySession, normalSession } from "../modes.mjs";
import { formatStat, statsRows } from "../ui/dialogs.mjs";
import { canReplay, replayFrames } from "../ui/replay.mjs";
import { soundFor } from "../ui/sound.mjs";

const CONFIG = { rows: 9, columns: 9, mines: 10 };

// Plays a normal game: first reveal, then a flag, then a chord attempt that changes nothing.
function normalGame() {
  let state = startGame({ config: CONFIG, seed: "replay-test", noGuess: false });
  state = applyMove(state, { type: "reveal", index: 40, at: 0 });
  return applyMove(state, { type: "flag", index: 0, at: 900 });
}

function seededGame() {
  const session = dailySession("2026-10-26");
  const state = startGame(session);
  return { state, session };
}

test("a normal replay starts at the fresh board", () => {
  const state = normalGame();
  const frames = replayFrames(state, false);
  assert.equal(frames.length, 3);
  assert.equal(frames[0].game.initialized, false);
  assert.equal(frames[1].game.initialized, true);
  assert.deepEqual(frames.map((frame) => frame.at), [0, 0, 900]);
  assert.deepEqual(frames.at(-1).game, state.game);
});

test("a seeded replay starts at the opened start board", () => {
  const { state, session } = seededGame();
  const moved = applyMove(state, { type: "flag", index: 0, at: 2000 });
  const frames = replayFrames(moved, session.start !== null);
  assert.equal(frames.length, 2);
  assert.equal(frames[0].game.initialized, true);
  assert.equal(frames[0].game.board[session.start].revealed, true);
  assert.deepEqual(frames.at(-1).game, moved.game);
});

test("replay needs a finished game with a move to watch", () => {
  const normal = normalGame();
  const won = (state) => ({ ...state, game: { ...state.game, phase: "won" } });
  assert.equal(canReplay(normal, false), false);
  assert.equal(canReplay(won(normal), false), true);
  assert.equal(canReplay(won(startGame(normalSession("beginner", CONFIG))), false), false);
  const { state } = seededGame();
  assert.equal(canReplay(won(state), true), false);
  assert.equal(canReplay(won(applyMove(state, { type: "flag", index: 0, at: 5 })), true), true);
});

test("stat formatting follows v1", () => {
  assert.equal(formatStat(null, "time"), "—");
  assert.equal(formatStat(42, "time"), "42s");
  assert.equal(formatStat(0.5, "rate"), "0.50");
  assert.equal(formatStat(75, "percent"), "75%");
  assert.equal(formatStat(7), "7");
});

test("the stats rows cover every mode and show dashes without data", () => {
  const rows = statsRows({});
  assert.deepEqual(rows.map((row) => row.label), ["Beginner", "Intermediate", "Expert", "Custom", "Daily"]);
  assert.deepEqual(rows[0].cells, ["0", "—", "0", "0", "—", "—", "—"]);
  const entry = { played: 4, won: 3, streak: 2, bestStreak: 3, totalWinSeconds: 90, bestTime: 25, bestRate: 1.5 };
  assert.deepEqual(statsRows({ expert: entry })[2].cells, ["4", "75%", "2", "3", "25s", "30s", "1.50"]);
});

test("a move earns a tone by its result, then by its kind", () => {
  assert.equal(soundFor("reveal", { phase: "won" }), "win");
  assert.equal(soundFor("reveal", { phase: "lost" }), "lose");
  assert.equal(soundFor("flag", { phase: "playing" }), "flag");
  assert.equal(soundFor("chord", { phase: "playing" }), "reveal");
});
