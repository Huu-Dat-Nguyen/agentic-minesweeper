// Everything the game keeps in the browser. Reads never throw; unreadable or
// invalid data is ignored. The keys and shapes are the ones v1 wrote.
import { recordResult, sanitizeStats } from "../core/stats.mjs";

const SETTINGS_KEY = "minefield.settings.v1";
const STATS_KEY = "minefield.stats.v1";
const BEST_TIMES_KEY = "minefield.bestTimes.v1";
const SETTING_KEYS = ["noGuess", "colorblind", "contrast", "sound", "reduceMotion"];

// Keeps only the known settings that hold a boolean.
export function sanitizeSettings(raw) {
  const settings = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return settings;
  for (const key of SETTING_KEYS) {
    if (typeof raw[key] === "boolean") settings[key] = raw[key];
  }
  return settings;
}

// Best times are whole seconds keyed by a mode's bestKey; anything else is dropped.
export function sanitizeBestTimes(raw) {
  const times = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return times;
  for (const [key, value] of Object.entries(raw)) {
    if (Number.isInteger(value) && value >= 0) times[key] = value;
  }
  return times;
}

export class LocalStore {
  // `getStorage` returns a Storage; it is called per use because reaching
  // window.localStorage can itself throw (private mode, blocked site data).
  constructor(getStorage) {
    this.getStorage = getStorage;
  }

  read(key) {
    try {
      return JSON.parse(this.getStorage().getItem(key));
    } catch {
      return null;
    }
  }

  write(key, value) {
    try {
      this.getStorage().setItem(key, JSON.stringify(value));
    } catch {
      // Storage may be unavailable; the game still works.
    }
  }

  loadSettings() {
    return sanitizeSettings(this.read(SETTINGS_KEY));
  }

  // Merges `changes` into what is stored, so settings other code owns are kept.
  saveSettings(changes) {
    this.write(SETTINGS_KEY, { ...this.loadSettings(), ...sanitizeSettings(changes) });
  }

  loadStats() {
    return sanitizeStats(this.read(STATS_KEY));
  }

  // Clears stats only; best times stay.
  resetStats() {
    this.write(STATS_KEY, {});
  }

  loadBestTimes() {
    return sanitizeBestTimes(this.read(BEST_TIMES_KEY));
  }

  // Seconds, or null when there is no best time for `key`.
  bestTime(key) {
    return this.loadBestTimes()[key] ?? null;
  }

  // Records a finished game. Only the first finish of an unassisted game counts, and
  // only a win that beats the stored time becomes a best time.
  // Returns { counts, newBest }; the caller marks the game as recorded.
  recordGame({ statsKey, bestKey, won, seconds, boardValue, assisted, recorded }) {
    const counts = !assisted && !recorded;
    if (!counts) return { counts, newBest: false };
    this.write(STATS_KEY, recordResult(this.loadStats(), statsKey, { won, seconds, boardValue }));
    const times = this.loadBestTimes();
    const newBest = won && !(times[bestKey] <= seconds);
    if (newBest) this.write(BEST_TIMES_KEY, { ...times, [bestKey]: seconds });
    return { counts, newBest };
  }
}
