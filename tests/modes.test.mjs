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

// A 1 × 4 board: a mine, a "1", and two empty squares, so its 3BV is 1.
function strip({ revealed, phase }) {
  const cell = (mine, adjacent, open) => ({ mine, adjacent, revealed: open, flagged: false });
  return {
    rows: 1,
    columns: 4,
    mineCount: 1,
    initialized: true,
    phase,
    board: [cell(true, 0, false), cell(false, 1, revealed >= 1), cell(false, 0, revealed >= 2), cell(false, 0, revealed >= 3)],
  };
}

const CLEARED = "🟩".repeat(10);
const THIRD = `${"🟩".repeat(3)}${"⬛".repeat(7)}`;

test("a normal board shares its size, result and a progress bar, never the mines", () => {
  const { summary } = MODES.normal.share;
  const session = normalSession("custom", { rows: 1, columns: 4, mines: 1 }, true);
  const extras = { seconds: 2, assisted: false };
  assert.equal(summary(session, strip({ revealed: 0, phase: "ready" }), extras), "Try this Minefield board: 1×4, 1 mines, no guessing needed.");
  assert.equal(
    summary({ ...session, noGuess: false }, strip({ revealed: 0, phase: "ready" }), extras),
    "Try this Minefield board: 1×4, 1 mines.",
  );
  assert.equal(summary(session, strip({ revealed: 3, phase: "won" }), extras), "I cleared this Minefield board (1×4, 1 mines) in 2s. Can you beat it?");
  assert.equal(
    summary(session, strip({ revealed: 3, phase: "won" }), { seconds: 2, assisted: true }),
    "I cleared this Minefield board (1×4, 1 mines) in 2s with help. Can you beat it?",
  );
  assert.equal(
    summary(session, strip({ revealed: 1, phase: "lost" }), extras),
    `This Minefield board (1×4, 1 mines) got me at 33% cleared. Can you finish it?\n${THIRD}`,
  );
});

test("the daily board shares its date, result and bar", () => {
  const { summary } = MODES.daily.share;
  const session = dailySession("2026-10-26");
  const extras = { seconds: 2, assisted: false };
  assert.equal(summary(session, strip({ revealed: 1, phase: "playing" }), extras), "Minefield daily 2026-10-26\nCan you clear today's board?");
  assert.equal(
    summary(session, strip({ revealed: 3, phase: "won" }), extras),
    `Minefield daily 2026-10-26\n✅ Cleared in 2s · 0.50 3BV/s\n${CLEARED}`,
  );
  assert.equal(
    summary(session, strip({ revealed: 3, phase: "won" }), { seconds: 2, assisted: true }),
    `Minefield daily 2026-10-26\n✅ Cleared in 2s with help · 0.50 3BV/s\n${CLEARED}`,
  );
  assert.equal(
    summary(session, strip({ revealed: 1, phase: "lost" }), extras),
    `Minefield daily 2026-10-26\n💥 Hit a mine with 33% cleared\n${THIRD}`,
  );
});

test("share links: a normal board needs its start, the daily one needs only its date", () => {
  const normal = { ...normalSession("beginner", DIFFICULTIES.beginner), seed: "abc", start: 7 };
  assert.deepEqual(decodeShare(MODES.normal.shareAddress(normal)), {
    type: "shared", rows: 9, columns: 9, mines: 10, seed: "abc", start: 7, noGuess: false,
  });
  assert.equal(MODES.daily.shareAddress(dailySession("2026-10-26")), "?daily=2026-10-26");
});

test("restarting a normal board can take the current no-guess setting", () => {
  const session = normalSession("beginner", DIFFICULTIES.beginner, false);
  assert.equal(session.mode.restart(session, true).noGuess, true);
  assert.equal(session.mode.restart(session).noGuess, false);
});

test("custom boards, normal or shared, keep stats but no best time", () => {
  const normal = normalSession("custom", { rows: 5, columns: 7, mines: 12 });
  assert.equal(normal.mode.bestKey(normal), null);
  assert.equal(normal.mode.statsKey(normal), "custom");
  const shared = sessionFromShare(decodeShare("r=5&c=7&m=12&seed=abc123&start=3"));
  assert.equal(shared.difficulty, "custom");
  assert.equal(shared.mode.bestKey(shared), null);
});
