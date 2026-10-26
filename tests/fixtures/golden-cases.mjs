// Builds every golden case from injected modules, so the same cases run
// against v1 (to write golden.json) and v2 (to check it).
export function buildGolden({ engine, seed, solver, stats }) {
  const { DIFFICULTIES, createGame } = engine;
  const { createRandom, dailySeed, dailyStartIndex, decodeShare, hashSeed, makeSeed, DAILY_CONFIG } = seed;
  const { explainHint, findHint, generateBoard, nextAgentMove } = solver;
  const { threeBV } = stats;

  const SEEDS = ["a", "abc123", "zz9-x", "daily-2026-10-26", "q1w2e3r4"];

  function indices(board, test) {
    return board.flatMap((cell, index) => (test(cell) ? [index] : []));
  }

  function boardCase(config, seed, start, noGuess) {
    const result = generateBoard(createGame(config), start, createRandom(seed), { noGuess });
    const { game } = result;
    const hint = findHint(game);
    const agent = nextAgentMove(game, createRandom(`${seed}-agent`));
    return {
      config,
      seed,
      start,
      noGuess,
      guaranteed: result.guaranteed,
      phase: game.phase,
      mines: indices(game.board, (cell) => cell.mine),
      revealed: indices(game.board, (cell) => cell.revealed),
      threeBV: threeBV(game),
      hint: hint && { ...hint, text: explainHint(game, hint) },
      agent,
    };
  }

  const boards = [];
  const sizes = [
    DIFFICULTIES.beginner,
    DIFFICULTIES.intermediate,
    DIFFICULTIES.expert,
    { rows: 5, columns: 7, mines: 12 },
    { rows: 24, columns: 40, mines: 300 },
  ];
  for (const config of sizes) {
    for (const [position, seed] of SEEDS.slice(0, 2).entries()) {
      const start = Math.floor((config.rows * config.columns) / (position + 2));
      for (const noGuess of [false, true]) boards.push(boardCase(config, seed, start, noGuess));
    }
  }

  const daily = ["2026-01-01", "2026-10-26", "2027-02-28"].map((key) => {
    const start = dailyStartIndex(key);
    return { key, start, board: boardCase(DAILY_CONFIG, dailySeed(key), start, true) };
  });

  const random = SEEDS.map((seed) => {
    const next = createRandom(seed);
    return { seed, hash: hashSeed(seed), values: Array.from({ length: 5 }, next), made: makeSeed(createRandom(seed)) };
  });

  const shares = [
    "r=9&c=9&m=10&seed=abc123&start=40",
    "r=16&c=30&m=99&seed=zz9-x&start=0&ng=1",
    "daily=2026-10-26",
    "daily=2026-02-30",
    "r=25&c=9&m=10&seed=abc&start=1",
    "r=9&c=9&m=81&seed=abc&start=1",
    "r=9&c=9&m=10&seed=BAD!&start=1",
    "",
  ].map((search) => ({ search, result: decodeShare(search) }));

  return { boards, daily, random, shares };
}
