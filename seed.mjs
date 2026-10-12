import { DIFFICULTIES, MAX_COLUMNS, MAX_ROWS } from "./game-engine.mjs";

const SEED_PATTERN = /^[a-z0-9-]{1,40}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const DAILY_CONFIG = DIFFICULTIES.intermediate;

// FNV-1a: turns any seed text into a 32-bit number.
export function hashSeed(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// Mulberry32: a small, fast, repeatable random source returning [0, 1).
export function createRandom(seedText) {
  let state = hashSeed(String(seedText));
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeSeed(random = Math.random) {
  let seed = "";
  for (let index = 0; index < 8; index += 1) {
    seed += Math.floor(random() * 36).toString(36);
  }
  return seed;
}

export function isValidSeed(seed) {
  return typeof seed === "string" && SEED_PATTERN.test(seed);
}

export function dateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function isValidDateKey(key) {
  if (typeof key !== "string" || !DATE_PATTERN.test(key)) return false;
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function dailySeed(key) {
  return `daily-${key}`;
}

// Picks the daily board's starting cell from its seed so everyone opens the same square.
export function dailyStartIndex(key, config = DAILY_CONFIG) {
  const random = createRandom(`${dailySeed(key)}-start`);
  return Math.floor(random() * config.rows * config.columns);
}

export function encodeShare({ rows, columns, mines, seed, start, noGuess }) {
  const params = new URLSearchParams({
    r: String(rows),
    c: String(columns),
    m: String(mines),
    seed,
    start: String(start),
  });
  if (noGuess) params.set("ng", "1");
  return params.toString();
}

// Returns a validated shared or daily board description, or null.
export function decodeShare(search) {
  const params = new URLSearchParams(search);
  const daily = params.get("daily");
  if (daily !== null) {
    return isValidDateKey(daily) ? { type: "daily", date: daily } : null;
  }
  if (!params.has("seed")) return null;

  const rows = Number(params.get("r"));
  const columns = Number(params.get("c"));
  const mines = Number(params.get("m"));
  const start = Number(params.get("start"));
  const seed = params.get("seed");
  if (
    !isValidSeed(seed)
    || !Number.isInteger(rows) || rows < 1 || rows > MAX_ROWS
    || !Number.isInteger(columns) || columns < 1 || columns > MAX_COLUMNS
    || !Number.isInteger(mines) || mines < 1 || mines >= rows * columns
    || !Number.isInteger(start) || start < 0 || start >= rows * columns
  ) {
    return null;
  }
  return { type: "shared", rows, columns, mines, seed, start, noGuess: params.get("ng") === "1" };
}
