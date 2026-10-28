import test from "node:test";
import assert from "node:assert/strict";
import { CloudStore, gameRow } from "../data/cloud.mjs";
import { LocalStore } from "../data/store.mjs";
import { bestTimesFromGames, statsFromGames } from "../core/stats.mjs";

function fakeStorage() {
  const data = {};
  return { getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
}

const RECORD = { config: { rows: 9, columns: 9, mines: 10 }, seed: "abc12345", noGuess: false, moves: [{ type: "reveal", index: 4, at: 0 }] };
const GAME = { statsKey: "beginner", bestKey: "beginner", dateKey: null, record: RECORD, start: 4, won: true, seconds: 40, boardValue: 20, assisted: false, recorded: false };

function setup({ games = [], profile = { stats_reset_at: null }, failSave = false, userId = "player-1" } = {}) {
  const sent = [];
  const api = {
    user: () => ({ id: userId }),
    profile: async () => profile,
    games: async () => games,
    saveGame: async (row) => {
      if (failSave) throw new Error("offline");
      sent.push(row);
    },
    resetStats: async () => "now",
  };
  const storage = fakeStorage();
  const local = new LocalStore(() => storage);
  return { store: new CloudStore({ api, local }), sent, api, local };
}

const rowOf = (details, userId = "player-1") => ({ ...gameRow(details), user_id: userId, queue_id: `q-${Math.random()}`, created_at: "2026-10-26T10:00:00Z" });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const SEQUENCE = [
  { ...GAME },
  { ...GAME, won: false, seconds: 5 },
  { ...GAME, statsKey: "custom", bestKey: null, seconds: 70 },
  { ...GAME, statsKey: "daily", bestKey: "daily:2026-10-26", dateKey: "2026-10-26", seconds: 33 },
  { ...GAME, seconds: 12, assisted: true },
  { ...GAME, seconds: 31 },
];

test("statsFromGames and bestTimesFromGames match folding LocalStore.recordGame", () => {
  const storage = fakeStorage();
  const local = new LocalStore(() => storage);
  for (const details of SEQUENCE) local.recordGame(details);
  const rows = SEQUENCE.map(rowOf);
  assert.deepEqual(statsFromGames(rows), local.loadStats());
  assert.deepEqual(bestTimesFromGames(rows), local.loadBestTimes());
});

test("best times skip assisted and custom games and key daily games by date", () => {
  assert.deepEqual(bestTimesFromGames(SEQUENCE.map(rowOf)), { beginner: 31, "daily:2026-10-26": 33 });
});

test("recordGame answers at once, caches the row and sends it", async () => {
  const { store, sent } = setup();
  await store.load();
  assert.deepEqual(store.recordGame(GAME), { counts: true, newBest: true });
  assert.equal(store.bestTime("beginner"), 40);
  assert.equal(store.loadStats().beginner.won, 1);
  await tick();
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], { ...gameRow(GAME), user_id: "player-1" });
  assert.equal("created_at" in sent[0], false);
  assert.equal(store.games().length, 1);
});

test("assisted games are saved for history but never count; recorded ones are ignored", async () => {
  const { store, sent } = setup();
  await store.load();
  assert.deepEqual(store.recordGame({ ...GAME, assisted: true }), { counts: false, newBest: false });
  assert.deepEqual(store.recordGame({ ...GAME, recorded: true }), { counts: false, newBest: false });
  await tick();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].assisted, true);
  assert.deepEqual(store.loadStats(), {});
  assert.equal(store.bestTime("beginner"), null);
});

test("a failed save stays in the outbox and flush resends it oldest first", async () => {
  const { store, local, api, sent } = setup({ failSave: true });
  await store.load();
  store.recordGame(GAME);
  store.recordGame({ ...GAME, seconds: 30 });
  await tick();
  assert.equal(local.loadOutbox().length, 2);
  api.saveGame = async (row) => { sent.push(row); };
  await store.flush();
  assert.deepEqual(sent.map((row) => row.seconds), [40, 30]);
  assert.deepEqual(local.loadOutbox(), []);
});

test("load reads profile and games, counts only games after the reset, and flushes the outbox", async () => {
  const games = [
    { ...rowOf(GAME), created_at: "2026-10-01T10:00:00+00:00", seconds: 50 },
    { ...rowOf(GAME), created_at: "2026-10-20T10:00:00+00:00", seconds: 45 },
  ];
  const { store, local, sent } = setup({ games, profile: { stats_reset_at: "2026-10-10T00:00:00Z" } });
  local.saveOutbox([{ ...rowOf(GAME), created_at: "2026-10-25T10:00:00.000Z" }]);
  await store.load();
  assert.equal(store.loadStats().beginner.played, 2);
  assert.equal(store.bestTime("beginner"), 40);
  assert.equal(sent.length, 1);
  assert.deepEqual(local.loadOutbox(), []);
  assert.equal(store.games()[0].seconds, 40);
});

test("resetStats clears stats, keeps best times and tells the profile", async () => {
  const { store } = setup();
  store.recordGame(GAME);
  assert.equal(await store.resetStats(), "now");
  assert.deepEqual(store.loadStats(), {});
  assert.equal(store.bestTime("beginner"), 40);
  assert.equal(store.bestTime(null), null);
});

test("settings stay local", () => {
  const { store } = setup();
  store.saveSettings({ noGuess: true });
  assert.deepEqual(store.loadSettings(), { noGuess: true });
});

test("a queued game is only sent, counted or shown for the player who played it", async () => {
  const { store, sent, local } = setup({ userId: "player-2" });
  local.saveOutbox([rowOf(GAME, "player-1")]);
  await store.load();
  assert.equal(sent.length, 0);
  assert.equal(store.games().length, 0);
  assert.equal(local.loadOutbox().length, 1, "player 1's game waits for player 1");
  store.recordGame({ ...GAME, seconds: 25 });
  await tick();
  assert.deepEqual(sent.map((row) => [row.user_id, row.seconds]), [["player-2", 25]]);
  assert.deepEqual(local.loadOutbox().map((row) => row.user_id), ["player-1"]);
});

test("load keeps the profile username for the account button", async () => {
  const { store } = setup({ profile: { username: "mina", stats_reset_at: null } });
  assert.equal(store.username, null);
  await store.load();
  assert.equal(store.username, "mina");
});

test("a game finished after the login expired waits for its player instead of being lost", async () => {
  const { store, api, local, sent } = setup();
  await store.load();
  api.user = () => null;
  api.saveGame = async () => { throw new Error("Sign in first."); };
  store.recordGame(GAME);
  await tick();
  assert.deepEqual(local.loadOutbox().map((row) => row.user_id), ["player-1"]);
  assert.equal(sent.length, 0);
});

test("forget clears the previous player's cache", async () => {
  const { store } = setup({ games: [rowOf(GAME)], profile: { username: "ada", stats_reset_at: null } });
  await store.load();
  assert.equal(store.username, "ada");
  store.forget();
  assert.equal(store.username, null);
  assert.deepEqual(store.games(), []);
  assert.equal(store.bestTime("beginner"), null);
});
