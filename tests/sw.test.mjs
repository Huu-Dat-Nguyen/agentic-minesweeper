import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const listed = [...readFileSync(`${root}sw.js`, "utf8").match(/APP_FILES = \[([^\]]*)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

test("every file listed in sw.js exists", () => {
  for (const file of listed) assert.ok(existsSync(root + file), `${file} is listed in sw.js but missing`);
});

test("every module the game loads is listed in sw.js", () => {
  const modules = ["app.mjs", "modes.mjs"];
  for (const dir of ["core", "ui", "data"]) {
    for (const name of readdirSync(root + dir)) if (name.endsWith(".mjs")) modules.push(`${dir}/${name}`);
  }
  for (const file of modules) assert.ok(listed.includes(file), `${file} is missing from sw.js`);
});
