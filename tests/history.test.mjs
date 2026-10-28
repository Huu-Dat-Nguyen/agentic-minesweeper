import test from "node:test";
import assert from "node:assert/strict";
import { applyMove, replay, startGame, toRecord } from "../core/moves.mjs";
import { gameRow } from "../data/cloud.mjs";
import { historyRows, modeLabel, recordFromRow } from "../ui/history.mjs";
import { leaderRows } from "../ui/leaderboard.mjs";

const CONFIG = { rows: 9, columns: 9, mines: 10 };

function savedRow() {
  let state = startGame({ config: CONFIG, seed: "history-test", noGuess: false });
  state = applyMove(state, { type: "reveal", index: 40, at: 0 });
  state = applyMove(state, { type: "reveal", index: 0, at: 500 });
  return {
    ...gameRow({ statsKey: "beginner", dateKey: null, record: toRecord(state), start: state.start, won: false, seconds: 3, boardValue: 20, assisted: false }),
    created_at: "2026-10-27T12:00:00Z",
    state,
  };
}

test("leaderRows ranks entries, formats the rate and flags the own row", () => {
  const rows = leaderRows(
    [
      { username: "nhd", seconds: 40, three_bv: 20 },
      { username: "mina", seconds: 0, three_bv: 5 },
    ],
    "mina",
  );
  assert.deepEqual(rows, [
    { rank: 1, player: "nhd", seconds: 40, rate: "0.50", own: false },
    { rank: 2, player: "mina", seconds: 0, rate: "5.00", own: true },
  ]);
  assert.equal(leaderRows([{ username: "a", seconds: 1, three_bv: 1 }], null)[0].own, false);
  assert.deepEqual(leaderRows([], "x"), []);
});

test("recordFromRow builds a record that replays to the saved final phase", () => {
  const { state, ...row } = savedRow();
  const record = recordFromRow(row);
  assert.deepEqual(record.config, CONFIG);
  assert.equal(record.noGuess, false);
  const frames = replay(record);
  assert.equal(frames.length, state.moves.length + 1);
  assert.equal(frames.at(-1).game.phase, state.game.phase);
  assert.deepEqual(frames.at(-1).game, state.game);
});

test("a bad row makes replay throw", () => {
  const { state, ...row } = savedRow();
  assert.throws(() => replay(recordFromRow({ ...row, moves: null })));
  assert.throws(() => replay(recordFromRow({ ...row, rows: 0 })));
});

test("modeLabel and historyRows describe saved games", () => {
  assert.equal(modeLabel({ mode: "expert" }), "Expert");
  assert.equal(modeLabel({ mode: "custom" }), "Custom");
  assert.equal(modeLabel({ mode: "daily", date_key: "2026-10-26" }), "Daily 2026-10-26");
  const rows = historyRows(
    Array.from({ length: 25 }, (_, n) => ({ mode: "beginner", won: n === 0, assisted: n === 0, seconds: n, created_at: "2026-10-27T12:00:00Z" })),
  );
  assert.equal(rows.length, 20);
  assert.equal(rows[0].result, "Won · with help");
  assert.equal(rows[1].result, "Lost");
  assert.equal(rows[0].time, "0s");
});
