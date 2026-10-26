import test from "node:test";
import assert from "node:assert/strict";
import { createGame, DIFFICULTIES, reveal, toggleFlag } from "../core/engine.mjs";
import { isFinished, neighborIndices } from "../core/grid.mjs";
import {
  createRandom,
  dailyStartIndex,
  dateKey,
  decodeShare,
  encodeDaily,
  encodeShare,
  hashSeed,
  isValidDateKey,
  makeSeed,
} from "../core/seed.mjs";
import {
  chooseGuess,
  deduce,
  explainHint,
  findHint,
  generateBoard,
  isSolvable,
  nextAgentMove,
} from "../core/solver.mjs";
import { rate, recordResult, sanitizeStats, summarize, threeBV } from "../core/stats.mjs";

// Builds a started game from rows of "*" (mine) and "." (safe), revealing the given indices.
function buildGame(layout, revealed = []) {
  const rows = layout.length;
  const columns = layout[0].length;
  const cells = [...layout.join("")];
  const game = createGame({ rows, columns, mines: cells.filter((cell) => cell === "*").length });
  const board = cells.map((cell) => ({ mine: cell === "*", adjacent: 0, revealed: false, flagged: false }));
  board.forEach((cell, index) => {
    if (!cell.mine) cell.adjacent = neighborIndices(game, index).filter((neighbor) => board[neighbor].mine).length;
  });
  for (const index of revealed) board[index].revealed = true;
  const safeLeft = board.filter((cell) => !cell.mine && !cell.revealed).length;
  return { ...game, board, initialized: true, phase: "playing", safeLeft };
}

function playAgentToEnd(game, random) {
  let current = game;
  const kinds = [];
  for (let moves = 0; moves < 2000 && !isFinished(current); moves += 1) {
    const move = nextAgentMove(current, random);
    kinds.push(move.kind);
    current = move.action === "reveal"
      ? reveal(current, move.index, random)
      : toggleFlag(current, move.index);
  }
  return { game: current, kinds };
}

test("a safe-area first reveal keeps every neighbor mine-free, with a fallback for dense boards", () => {
  const roomy = reveal(createGame({ rows: 5, columns: 5, mines: 16 }), 12, () => 0, { safeArea: true });
  assert.equal(roomy.board[12].adjacent, 0);
  for (const neighbor of neighborIndices(roomy, 12)) assert.equal(roomy.board[neighbor].mine, false);

  const dense = reveal(createGame({ rows: 3, columns: 3, mines: 8 }), 4, () => 0, { safeArea: true });
  assert.equal(dense.board.filter((cell) => cell.mine).length, 8);
  assert.equal(dense.board[4].mine, false);
});

test("seeded random sources repeat exactly and stay within range", () => {
  const first = createRandom("abc");
  const second = createRandom("abc");
  const values = Array.from({ length: 50 }, () => first());
  assert.deepEqual(values, Array.from({ length: 50 }, () => second()));
  assert.ok(values.every((value) => value >= 0 && value < 1));
  assert.notEqual(hashSeed("abc"), hashSeed("abd"));
  assert.match(makeSeed(createRandom("x")), /^[a-z0-9]{8}$/);
});

test("validates daily date keys and picks a repeatable start square", () => {
  assert.equal(dateKey(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(isValidDateKey("2026-02-28"), true);
  assert.equal(isValidDateKey("2026-02-30"), false);
  assert.equal(isValidDateKey("26-2-3"), false);
  const start = dailyStartIndex("2026-10-12");
  assert.equal(start, dailyStartIndex("2026-10-12"));
  assert.ok(start >= 0 && start < 16 * 16);
});

test("share links round-trip and reject tampered values", () => {
  const board = { rows: 16, columns: 30, mines: 99, seed: "k3j9x0aa", start: 245, noGuess: true };
  assert.deepEqual(decodeShare(`?${encodeShare(board)}`), { type: "shared", ...board });
  assert.equal(encodeDaily("2026-10-12"), "daily=2026-10-12");
  assert.deepEqual(decodeShare(`?${encodeDaily("2026-10-12")}`), { type: "daily", date: "2026-10-12" });
  assert.equal(decodeShare("?daily=2026-13-01"), null);
  assert.equal(decodeShare("?r=9&c=9&m=81&seed=abc&start=0"), null);
  assert.equal(decodeShare("?r=9&c=9&m=10&seed=<b>&start=0"), null);
  assert.equal(decodeShare("?r=9&c=9&m=10&seed=abc&start=81"), null);
  assert.equal(decodeShare(""), null);
});

test("deduces safe squares and mines from single clues in order", () => {
  // Row 0: mine, covered safe square, revealed 0 (as if a flag stopped the flood). Row 1: revealed.
  const game = buildGame(["*..", "..."], [2, 3, 4, 5]);
  const { steps, mines, safe } = deduce(game);
  assert.deepEqual(steps[0], { kind: "safe", cells: [1], rule: "clear", clues: [2] });
  assert.deepEqual([...safe], [1]);
  assert.deepEqual([...mines], [0]);
});

test("solves the 1-1-1 pattern by comparing overlapping clues", () => {
  const game = buildGame([".*.", "..."], [3, 4, 5]);
  const { steps, mines, safe } = deduce(game);
  assert.equal(steps[0].rule, "pair");
  assert.deepEqual([...safe].sort(), [0, 2]);
  assert.deepEqual([...mines], [1]);
  assert.equal(isSolvable(game), true);
});

test("uses the mine total once every mine is found", () => {
  const game = buildGame([".*.."], [0]);
  const { steps, safe } = deduce(game);
  assert.equal(steps.at(-1).rule, "count-safe");
  assert.deepEqual([...safe].sort(), [2, 3]);
});

test("reports a 50/50 board as unsolvable and still picks a guess", () => {
  const game = buildGame(["*.", ".."], [2, 3]);
  assert.equal(isSolvable(game), false);
  assert.equal(findHint(game), null);
  const guess = chooseGuess(game, () => 0);
  assert.ok([0, 1].includes(guess.index));
  assert.equal(guess.risk, 0.5);
  assert.equal(nextAgentMove(game, () => 0).kind, "guess");
});

test("hints suggest the middle first, catch wrong flags, and skip finished work", () => {
  const fresh = createGame(DIFFICULTIES.beginner);
  assert.deepEqual(findHint(fresh).cells, [40]);

  const game = buildGame(["*..", "..."], [2, 3, 4, 5]);
  const wrong = toggleFlag(game, 1);
  const wrongHint = findHint(wrong);
  assert.equal(wrongHint.kind, "wrong-flag");
  assert.match(explainHint(wrong, wrongHint), /row 1, column 2/);

  const hint = findHint(game);
  assert.equal(hint.kind, "safe");
  assert.match(explainHint(game, hint), /The 0 at row 1, column 3/);

  const flaggedMine = toggleFlag(reveal(game, 1), 0);
  assert.equal(findHint(flaggedMine), null);
});

test("no-guess boards are solvable, repeatable for a seed, and open an empty area", () => {
  const config = DIFFICULTIES.expert;
  const start = 8 * config.columns + 15;
  const first = generateBoard(createGame(config), start, createRandom("seed-1"), { noGuess: true });
  const second = generateBoard(createGame(config), start, createRandom("seed-1"), { noGuess: true });
  assert.equal(first.guaranteed, true);
  assert.equal(first.game.board[start].adjacent, 0);
  assert.deepEqual(first.game.board, second.game.board);
  assert.equal(isSolvable(first.game), true);
});

test("the autoplayer clears a no-guess board using logic only", () => {
  const config = DIFFICULTIES.intermediate;
  const random = createRandom("agent");
  const fresh = createGame(config);
  const opening = nextAgentMove(fresh, random);
  assert.equal(opening.kind, "start");
  const { game } = generateBoard(fresh, opening.index, random, { noGuess: true });
  const result = playAgentToEnd(game, random);
  assert.equal(result.game.phase, "won");
  assert.ok(result.kinds.every((kind) => kind === "logic"));
});

test("counts 3BV for openings and isolated numbers", () => {
  assert.equal(threeBV(buildGame(["*.."])), 1);
  assert.equal(threeBV(buildGame(["*.*"])), 1);
  assert.equal(threeBV(buildGame(["*.", ".*"])), 2);
  assert.equal(threeBV(createGame(DIFFICULTIES.beginner)), 0);
});

test("rate divides board value by at least one second", () => {
  assert.equal(rate(30, 10), 3);
  assert.equal(rate(30, 0), 30);
});

test("records results with streaks, best times, and best 3BV/s", () => {
  let stats = {};
  stats = recordResult(stats, "beginner", { won: true, seconds: 20, boardValue: 30 });
  stats = recordResult(stats, "beginner", { won: true, seconds: 10, boardValue: 25 });
  stats = recordResult(stats, "beginner", { won: false, seconds: 5, boardValue: 30 });
  const summary = summarize(stats.beginner);
  assert.deepEqual(summary, {
    played: 3,
    won: 2,
    winRate: 67,
    streak: 0,
    bestStreak: 2,
    bestTime: 10,
    averageTime: 15,
    bestRate: 2.5,
  });
  assert.equal(summarize().played, 0);
});

test("drops malformed stored stats", () => {
  const good = { played: 2, won: 1, streak: 1, bestStreak: 1, totalWinSeconds: 9, bestTime: 9, bestRate: 1.2 };
  const clean = sanitizeStats({ beginner: good, expert: { played: 1, won: 3 }, bad: "x" });
  assert.deepEqual(clean, { beginner: good });
  assert.deepEqual(sanitizeStats(null), {});
  assert.deepEqual(sanitizeStats([1]), {});
});
