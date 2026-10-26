// Measures code size and board-generation speed for the v1/v2 comparison.
// Usage: node report/measure.mjs <label> <engine.mjs> <seed.mjs> <solver.mjs>
// Writes report/<label>-metrics.json. Paths are relative to the repo root.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const [label, enginePath, seedPath, solverPath] = process.argv.slice(2);
if (!solverPath) throw new Error("Usage: node report/measure.mjs <label> <engine> <seed> <solver>");

const root = process.cwd();
const SKIP = new Set([".git", ".claude", "report", "fixtures", "node_modules", "docs", "icons"]);
const CODE = /\.(mjs|js|css|html)$/;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP.has(name) ? [] : files(path);
    return CODE.test(name) ? [relative(root, path).replaceAll("\\", "/")] : [];
  });
}

// Counts named functions and their length by matching braces from the declaration line.
function functionsIn(text) {
  const lines = text.split("\n");
  const found = [];
  const start = /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)|^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/;
  lines.forEach((line, index) => {
    const match = line.match(start);
    if (!match) return;
    let depth = 0;
    let end = index;
    for (; end < lines.length; end += 1) {
      for (const char of lines[end]) {
        if (char === "{") depth += 1;
        if (char === "}") depth -= 1;
      }
      if (depth === 0 && lines[end].includes("}")) break;
    }
    found.push({ name: match[1] ?? match[2], lines: end - index + 1 });
  });
  return found;
}

const perFile = {};
for (const file of files(root)) {
  const text = readFileSync(file, "utf8");
  const entry = { lines: text.split("\n").length - (text.endsWith("\n") ? 1 : 0) };
  if (/\.(mjs|js)$/.test(file)) {
    const functions = functionsIn(text);
    entry.functions = functions.length;
    entry.longest = functions.sort((a, b) => b.lines - a.lines).slice(0, 5);
  }
  perFile[file] = entry;
}

const testOutput = execSync("node --test", { encoding: "utf8" });
const tests = Number(testOutput.match(/ℹ tests (\d+)/)?.[1] ?? 0);

const load = (path) => import(pathToFileURL(join(root, path)).href);
const [{ createGame, DIFFICULTIES }, { createRandom }, { generateBoard }] = await Promise.all(
  [enginePath, seedPath, solverPath].map(load),
);
// Median time of 9 no-guess Expert boards from fixed seeds.
const times = [];
for (let run = 0; run < 9; run += 1) {
  const began = performance.now();
  generateBoard(createGame(DIFFICULTIES.expert), 240, createRandom(`measure-${run}`), { noGuess: true });
  times.push(performance.now() - began);
}
times.sort((a, b) => a - b);

const total = (pick) => Object.values(perFile).reduce((sum, entry) => sum + (pick(entry) ?? 0), 0);
const result = {
  label,
  commit: execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(),
  measured: new Date().toISOString().slice(0, 10),
  totals: { files: Object.keys(perFile).length, lines: total((e) => e.lines), functions: total((e) => e.functions), tests },
  expertNoGuessMs: Math.round(times[4]),
  perFile,
};
writeFileSync(join(root, "report", `${label}-metrics.json`), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.totals), `expert no-guess median ${result.expertNoGuessMs} ms`);
