// Seeded boards, daily boards and share links must match v1 exactly (golden.json).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as engine from "../core/engine.mjs";
import * as seed from "../core/seed.mjs";
import * as solver from "../core/solver.mjs";
import * as stats from "../core/stats.mjs";
import { buildGolden } from "./fixtures/golden-cases.mjs";

const golden = JSON.parse(readFileSync(new URL("./fixtures/golden.json", import.meta.url), "utf8"));
const current = JSON.parse(JSON.stringify(buildGolden({ engine, seed, solver, stats })));

for (const part of ["boards", "daily", "random", "shares"]) {
  test(`golden ${part} match v1`, () => {
    assert.deepEqual(current[part], golden[part]);
  });
}
