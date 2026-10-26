import test from "node:test";
import assert from "node:assert/strict";
import { LocalStore, sanitizeBestTimes, sanitizeSettings } from "../data/store.mjs";

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
}

const KEY = "minefield.settings.v1";

test("only known boolean settings survive", () => {
  assert.deepEqual(
    sanitizeSettings({ noGuess: true, sound: "yes", contrast: false, extra: true, reduceMotion: 1 }),
    { noGuess: true, contrast: false },
  );
  for (const bad of [null, undefined, "text", 5, [true]]) assert.deepEqual(sanitizeSettings(bad), {});
});

test("loading reads the v1 key and ignores unreadable data", () => {
  const good = new LocalStore(() => fakeStorage({ [KEY]: JSON.stringify({ noGuess: true, junk: 1 }) }));
  assert.deepEqual(good.loadSettings(), { noGuess: true });
  const broken = new LocalStore(() => fakeStorage({ [KEY]: "{not json" }));
  assert.deepEqual(broken.loadSettings(), {});
  assert.deepEqual(new LocalStore(() => fakeStorage()).loadSettings(), {});
});

test("saving merges into what is stored and keeps only valid fields", () => {
  const storage = fakeStorage({ [KEY]: JSON.stringify({ colorblind: true, noGuess: false }) });
  const store = new LocalStore(() => storage);
  store.saveSettings({ noGuess: true, bogus: 3 });
  assert.deepEqual(JSON.parse(storage.data[KEY]), { colorblind: true, noGuess: true });
});

test("a storage that throws never breaks the store", () => {
  const store = new LocalStore(() => { throw new Error("blocked"); });
  assert.deepEqual(store.loadSettings(), {});
  assert.doesNotThrow(() => store.saveSettings({ noGuess: true }));
});

const STATS = "minefield.stats.v1";
const BEST = "minefield.bestTimes.v1";
const WIN = { statsKey: "beginner", bestKey: "beginner", won: true, seconds: 40, boardValue: 20, assisted: false, recorded: false };

function storeWith(initial) {
  const storage = fakeStorage(initial);
  return { storage, store: new LocalStore(() => storage) };
}

test("best times keep only non-negative whole seconds", () => {
  assert.deepEqual(
    sanitizeBestTimes({ beginner: 40, expert: 0, custom: -1, "daily:2026-10-26": 12.5, intermediate: "9", x: null, y: NaN }),
    { beginner: 40, expert: 0 },
  );
  for (const bad of [null, undefined, "text", 5, [3]]) assert.deepEqual(sanitizeBestTimes(bad), {});
  const { store } = storeWith({ [BEST]: JSON.stringify({ beginner: 40, expert: "fast" }) });
  assert.equal(store.bestTime("beginner"), 40);
  assert.equal(store.bestTime("expert"), null);
});

test("a first unassisted win records stats and a best time", () => {
  const { storage, store } = storeWith({});
  assert.deepEqual(store.recordGame(WIN), { counts: true, newBest: true });
  assert.equal(store.bestTime("beginner"), 40);
  assert.equal(JSON.parse(storage.data[STATS]).beginner.won, 1);
});

test("only a faster win replaces the best time", () => {
  const { store } = storeWith({});
  store.recordGame(WIN);
  assert.equal(store.recordGame({ ...WIN, seconds: 40 }).newBest, false);
  assert.equal(store.recordGame({ ...WIN, seconds: 55 }).newBest, false);
  assert.equal(store.bestTime("beginner"), 40);
  assert.equal(store.recordGame({ ...WIN, seconds: 31 }).newBest, true);
  assert.equal(store.bestTime("beginner"), 31);
  assert.equal(store.loadStats().beginner.played, 4);
});

test("a loss counts in stats but never sets a best time", () => {
  const { store } = storeWith({});
  assert.deepEqual(store.recordGame({ ...WIN, won: false, seconds: 5 }), { counts: true, newBest: false });
  assert.equal(store.bestTime("beginner"), null);
  assert.deepEqual(store.loadStats().beginner, { ...store.loadStats().beginner, played: 1, won: 0 });
});

test("assisted and already-recorded games change nothing", () => {
  const { storage, store } = storeWith({});
  assert.deepEqual(store.recordGame({ ...WIN, assisted: true }), { counts: false, newBest: false });
  assert.deepEqual(store.recordGame({ ...WIN, recorded: true }), { counts: false, newBest: false });
  assert.deepEqual(storage.data, {});
});

test("daily games use their own best time key and the daily stats row", () => {
  const { store } = storeWith({});
  store.recordGame({ ...WIN, statsKey: "daily", bestKey: "daily:2026-10-26" });
  assert.equal(store.bestTime("daily:2026-10-26"), 40);
  assert.equal(store.bestTime("beginner"), null);
  assert.equal(store.loadStats().daily.played, 1);
});

test("resetting stats keeps best times", () => {
  const { store } = storeWith({});
  store.recordGame(WIN);
  store.resetStats();
  assert.deepEqual(store.loadStats(), {});
  assert.equal(store.bestTime("beginner"), 40);
});

test("v1-shaped data loads, a malformed best time is dropped on the next write", () => {
  const entry = { played: 3, won: 2, streak: 1, bestStreak: 2, totalWinSeconds: 90, bestTime: 40, bestRate: 0.5 };
  const { storage, store } = storeWith({
    [STATS]: JSON.stringify({ beginner: entry, expert: { played: "many" } }),
    [BEST]: JSON.stringify({ beginner: 50, expert: "oops" }),
  });
  assert.deepEqual(Object.keys(store.loadStats()), ["beginner"]);
  assert.equal(store.recordGame({ ...WIN, seconds: 30 }).newBest, true);
  assert.deepEqual(JSON.parse(storage.data[BEST]), { beginner: 30 });
});

test("a storage that throws never breaks stats", () => {
  const store = new LocalStore(() => { throw new Error("blocked"); });
  assert.deepEqual(store.loadStats(), {});
  assert.equal(store.bestTime("beginner"), null);
  assert.doesNotThrow(() => store.recordGame(WIN));
  assert.doesNotThrow(() => store.resetStats());
});
