// The signed-in store: same interface as LocalStore, but stats and best times are
// derived from the player's saved games. Settings stay in the browser.
// `api` is a createSupabase adapter; `local` is the LocalStore (settings and the outbox).
import { bestTimesFromGames, statsFromGames } from "../core/stats.mjs";

// The `games` table row for a finished game. `statsKey` is the mode name.
export function gameRow({ statsKey, dateKey, record, start, won, seconds, boardValue, assisted }) {
  const { rows, columns, mines } = record.config;
  return {
    mode: statsKey,
    date_key: statsKey === "daily" ? dateKey : null,
    rows,
    columns,
    mines,
    seed: record.seed,
    start,
    no_guess: Boolean(record.noGuess),
    won,
    seconds,
    three_bv: boardValue,
    assisted,
    moves: record.moves,
  };
}

export class CloudStore {
  constructor({ api, local }) {
    this.api = api;
    this.local = local;
    this.rows = [];
    this.resetAt = null;
    this.username = null;
    this.userId = null;
    this.stats = {};
    this.best = {};
    this.flushing = null;
  }

  loadSettings() {
    return this.local.loadSettings();
  }

  saveSettings(changes) {
    this.local.saveSettings(changes);
  }

  // Stats count games after the last reset; best times use every game, as a local reset keeps them.
  derive() {
    const resetTime = this.resetAt === null ? -Infinity : Date.parse(this.resetAt);
    this.stats = statsFromGames(this.rows.filter((row) => Date.parse(row.created_at) > resetTime));
    this.best = bestTimesFromGames(this.rows);
  }

  // The signed-in player's games still waiting in the outbox. Several players can share
  // a browser, so each queued row carries its owner's user_id (RLS checks it on save).
  ownQueued() {
    return this.local.loadOutbox().filter((row) => row.user_id === this.userId);
  }

  // Drops everything cached for the previous player (after sign-out, or before loading another).
  forget() {
    this.rows = [];
    this.resetAt = null;
    this.username = null;
    this.userId = null;
    this.derive();
  }

  // Fetches the profile and games, adds this player's games still waiting in the outbox, then retries those.
  // Games are tagged with the player loaded here, so a game finished after the login
  // expires still waits in the outbox for that player instead of being lost.
  async load() {
    this.forget();
    this.userId = this.api.user()?.id ?? null;
    const [profile, rows] = await Promise.all([this.api.profile(), this.api.games()]);
    this.resetAt = profile?.stats_reset_at ?? null;
    this.username = profile?.username ?? null;
    this.rows = [...rows, ...this.ownQueued()];
    this.derive();
    await this.flush();
  }

  // Saves this player's queued games oldest first and stops at the first failure.
  flush() {
    this.flushing ??= (async () => {
      for (let queued = this.ownQueued(); queued.length > 0; queued = this.ownQueued()) {
        // queue_id is local only; the server sets its own created_at.
        const { queue_id, created_at, ...row } = queued[0];
        try {
          await this.api.saveGame(row);
        } catch {
          return;
        }
        // Read again: a game recorded during the request is already in the outbox.
        this.local.saveOutbox(this.local.loadOutbox().filter((entry) => entry.queue_id !== queue_id));
      }
    })().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  loadStats() {
    return this.stats;
  }

  bestTime(key) {
    return key === null ? null : this.best[key] ?? null;
  }

  // Resets stats now and in the profile; the returned promise rejects if the profile could not be updated.
  resetStats() {
    this.resetAt = new Date().toISOString();
    this.derive();
    return this.api.resetStats();
  }

  // Newest first.
  games() {
    return [...this.rows].reverse();
  }

  // Every first finish becomes a saved game (assisted ones too, so history is complete);
  // only unassisted ones count toward stats and best times. Returns { counts, newBest }.
  recordGame(details) {
    if (details.recorded) return { counts: false, newBest: false };
    const { bestKey, won, seconds, assisted } = details;
    const counts = !assisted;
    const newBest = counts && won && bestKey !== null && !(this.best[bestKey] <= seconds);
    const row = {
      ...gameRow(details),
      user_id: this.userId,
      queue_id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    this.rows.push(row);
    this.derive();
    this.local.saveOutbox([...this.local.loadOutbox(), row]);
    this.flush();
    return { counts, newBest };
  }
}
