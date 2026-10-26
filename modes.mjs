// One strategy object per game kind. Every member takes the session it describes.
import { DIFFICULTIES } from "./core/engine.mjs";
import {
  DAILY_CONFIG,
  dailySeed,
  dailyStartIndex,
  dateKey,
  encodeDaily,
  encodeShare,
  makeSeed,
} from "./core/seed.mjs";

export const READY_MESSAGE = "Choose a square. The first one is on us.";
const SEEDED_NOTE = "The first square is open and the clock starts on your move.";

export const MODES = {
  normal: {
    bestKey: (session) => session.difficulty,
    statsKey: (session) => session.difficulty,
    address: () => "",
    sizePrefix: () => null,
    startMessage: () => READY_MESSAGE,
    restart: (session) => normalSession(session.difficulty, session.config, session.noGuess),
  },
  daily: {
    bestKey: (session) => `daily:${session.date}`,
    statsKey: () => "daily",
    address: (session) => `?${encodeDaily(session.date)}`,
    sizePrefix: (session) => `Daily ${session.date}`,
    startMessage: (session) => `Daily challenge for ${session.date}. ${SEEDED_NOTE}`,
    restart: (session) => session,
  },
  shared: {
    bestKey: (session) => session.difficulty,
    statsKey: (session) => session.difficulty,
    address: ({ config, seed, start, noGuess }) => `?${encodeShare({ ...config, seed, start, noGuess })}`,
    sizePrefix: () => "Shared",
    startMessage: () => `Shared board loaded. ${SEEDED_NOTE}`,
    restart: (session) => session,
  },
};

function difficultyOf({ rows, columns, mines }) {
  return Object.keys(DIFFICULTIES).find((key) => {
    const preset = DIFFICULTIES[key];
    return preset.rows === rows && preset.columns === columns && preset.mines === mines;
  }) ?? "custom";
}

export function normalSession(difficulty, config, noGuess = false) {
  return { mode: MODES.normal, difficulty, config, seed: makeSeed(), noGuess, start: null, date: null };
}

export function dailySession(date = dateKey()) {
  return {
    mode: MODES.daily,
    difficulty: "daily",
    config: DAILY_CONFIG,
    seed: dailySeed(date),
    noGuess: true,
    start: dailyStartIndex(date),
    date,
  };
}

// `shared` is a decodeShare result.
export function sessionFromShare(shared) {
  if (shared.type === "daily") return dailySession(shared.date);
  const { rows, columns, mines, seed, start, noGuess } = shared;
  const config = { rows, columns, mines };
  return { mode: MODES.shared, difficulty: difficultyOf(config), config, seed, noGuess, start, date: null };
}
