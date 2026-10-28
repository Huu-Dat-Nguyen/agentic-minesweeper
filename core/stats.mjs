import { neighborIndices } from "./grid.mjs";

// 3BV: the fewest clicks needed to clear a board. Each connected empty area
// counts once, plus every safe number not touching an empty area.
export function threeBV(game) {
  if (!game.initialized) return 0;
  const covered = new Set();
  let count = 0;

  game.board.forEach((cell, index) => {
    if (cell.mine || cell.adjacent !== 0 || covered.has(index)) return;
    count += 1;
    const queue = [index];
    covered.add(index);
    for (let position = 0; position < queue.length; position += 1) {
      for (const neighbor of neighborIndices(game, queue[position])) {
        if (covered.has(neighbor) || game.board[neighbor].mine) continue;
        covered.add(neighbor);
        if (game.board[neighbor].adjacent === 0) queue.push(neighbor);
      }
    }
  });

  game.board.forEach((cell, index) => {
    if (!cell.mine && !covered.has(index)) count += 1;
  });
  return count;
}

const EMPTY_ENTRY = Object.freeze({
  played: 0,
  won: 0,
  streak: 0,
  bestStreak: 0,
  totalWinSeconds: 0,
  bestTime: null,
  bestRate: null,
});

function emptyEntry() {
  return { ...EMPTY_ENTRY };
}

export function rate(boardValue, seconds) {
  return boardValue / Math.max(1, seconds);
}

export function recordResult(stats, key, { won, seconds, boardValue }) {
  const entry = { ...emptyEntry(), ...stats[key] };
  entry.played += 1;
  if (won) {
    const winRate = rate(boardValue, seconds);
    entry.won += 1;
    entry.streak += 1;
    entry.bestStreak = Math.max(entry.bestStreak, entry.streak);
    entry.totalWinSeconds += seconds;
    entry.bestTime = entry.bestTime === null ? seconds : Math.min(entry.bestTime, seconds);
    entry.bestRate = entry.bestRate === null ? winRate : Math.max(entry.bestRate, winRate);
  } else {
    entry.streak = 0;
  }
  return { ...stats, [key]: entry };
}

export function summarize(entry = EMPTY_ENTRY) {
  return {
    played: entry.played,
    won: entry.won,
    winRate: entry.played === 0 ? 0 : Math.round((entry.won / entry.played) * 100),
    streak: entry.streak,
    bestStreak: entry.bestStreak,
    bestTime: entry.bestTime,
    averageTime: entry.won === 0 ? null : Math.round(entry.totalWinSeconds / entry.won),
    bestRate: entry.bestRate,
  };
}

// Keeps only well-formed entries from stored data.
export function sanitizeStats(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const counts = ["played", "won", "streak", "bestStreak", "totalWinSeconds"];
    if (!counts.every((field) => Number.isFinite(value[field]) && value[field] >= 0)) continue;
    if (value.won > value.played) continue;
    const optional = (field) => (Number.isFinite(value[field]) && value[field] >= 0 ? value[field] : null);
    clean[key] = {
      played: value.played,
      won: value.won,
      streak: value.streak,
      bestStreak: value.bestStreak,
      totalWinSeconds: value.totalWinSeconds,
      bestTime: optional("bestTime"),
      bestRate: optional("bestRate"),
    };
  }
  return clean;
}

// Custom boards come in any size, so one best time for all of them means nothing:
// they keep stats but no best time.
export function tracksBestTime(statsKey) {
  return statsKey !== "custom";
}

// The best-time key of a saved game row, or null when its mode keeps none.
function bestKeyOf({ mode, date_key }) {
  if (!tracksBestTime(mode)) return null;
  return mode === "daily" ? `daily:${date_key}` : mode;
}

// Rows are saved games (the `games` table shape), oldest first. Assisted games never count.
export function statsFromGames(rows) {
  return rows.reduce(
    (stats, row) => (row.assisted ? stats : recordResult(stats, row.mode, { won: row.won, seconds: row.seconds, boardValue: row.three_bv })),
    {},
  );
}

export function bestTimesFromGames(rows) {
  const times = {};
  for (const row of rows) {
    const key = bestKeyOf(row);
    if (row.won && !row.assisted && key !== null && !(times[key] <= row.seconds)) times[key] = row.seconds;
  }
  return times;
}
