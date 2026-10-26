// Everything the game keeps in the browser. Reads never throw; unreadable or
// invalid data is ignored. S5 adds stats and best times to this class.
const SETTINGS_KEY = "minefield.settings.v1";
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
}
