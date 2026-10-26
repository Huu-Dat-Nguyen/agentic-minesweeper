// Writes golden.json from the v1 code (commit bc67f76). The v2 rewrite must
// reproduce these outputs exactly so old share and daily links keep working.
// Run from the repo root at bc67f76: node tests/fixtures/make-golden.mjs
import { writeFileSync } from "node:fs";
import * as engine from "../../game-engine.mjs";
import * as seed from "../../seed.mjs";
import * as solver from "../../solver.mjs";
import * as stats from "../../stats.mjs";
import { buildGolden } from "./golden-cases.mjs";

const golden = buildGolden({ engine, seed, solver, stats });
writeFileSync(
  new URL("./golden.json", import.meta.url),
  `${JSON.stringify({ source: "bc67f76", ...golden }, null, 1)}\n`,
);
console.log(`golden.json: ${golden.boards.length} boards, ${golden.daily.length} daily, ${golden.random.length} random, ${golden.shares.length} shares`);
