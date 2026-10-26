import test from "node:test";
import assert from "node:assert/strict";
import { DIFFICULTIES } from "../core/engine.mjs";
import { dailySeed, dailyStartIndex, decodeShare } from "../core/seed.mjs";
import { dailySession, MODES, normalSession, READY_MESSAGE, sessionFromShare } from "../modes.mjs";

test("a normal session gets a fresh seed, keys by difficulty, and leaves the address empty", () => {
  const session = normalSession("expert", DIFFICULTIES.expert);
  assert.equal(session.mode, MODES.normal);
  assert.equal(session.mode.bestKey(session), "expert");
  assert.equal(session.mode.statsKey(session), "expert");
  assert.equal(session.mode.address(session), "");
  assert.equal(session.mode.sizePrefix(session), null);
  assert.equal(session.mode.startMessage(session), READY_MESSAGE);

  const again = session.mode.restart(session);
  assert.notEqual(again.seed, session.seed);
  assert.equal(again.difficulty, "expert");
  assert.equal(again.config, session.config);
});

test("a daily session is the no-guess intermediate board of its date", () => {
  const session = dailySession("2026-10-26");
  assert.equal(session.mode, MODES.daily);
  assert.equal(session.seed, dailySeed("2026-10-26"));
  assert.equal(session.start, dailyStartIndex("2026-10-26"));
  assert.equal(session.noGuess, true);
  assert.equal(session.mode.bestKey(session), "daily:2026-10-26");
  assert.equal(session.mode.statsKey(session), "daily");
  assert.equal(session.mode.address(session), "?daily=2026-10-26");
  assert.equal(session.mode.sizePrefix(session), "Daily 2026-10-26");
  assert.match(session.mode.startMessage(session), /^Daily challenge for 2026-10-26\. The first square is open/);
  assert.equal(session.mode.restart(session), session);
});

test("a shared session finds its preset and round-trips its link", () => {
  const search = "r=9&c=9&m=10&seed=abc123&start=40";
  const session = sessionFromShare(decodeShare(search));
  assert.equal(session.mode, MODES.shared);
  assert.equal(session.difficulty, "beginner");
  assert.equal(session.mode.bestKey(session), "beginner");
  assert.equal(session.mode.sizePrefix(session), "Shared");
  assert.equal(session.mode.startMessage(session), "Shared board loaded. The first square is open and the clock starts on your move.");
  assert.equal(session.mode.restart(session), session);
  assert.deepEqual(decodeShare(session.mode.address(session).slice(1)), decodeShare(search));

  const custom = sessionFromShare(decodeShare("r=5&c=7&m=12&seed=x1&start=3&ng=1"));
  assert.equal(custom.difficulty, "custom");
  assert.equal(custom.noGuess, true);
  assert.match(custom.mode.address(custom), /ng=1$/);
});

test("a daily link becomes a daily session", () => {
  const session = sessionFromShare(decodeShare("daily=2026-10-26"));
  assert.equal(session.mode, MODES.daily);
  assert.equal(session.date, "2026-10-26");
});
