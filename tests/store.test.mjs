import test from "node:test";
import assert from "node:assert/strict";
import { LocalStore, sanitizeSettings } from "../data/store.mjs";

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
