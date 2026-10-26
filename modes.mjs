// One strategy object per game kind. Every member takes the session it describes.
import { DIFFICULTIES } from "./core/engine.mjs";
import { isFinished } from "./core/grid.mjs";
import {
  DAILY_CONFIG,
  dailySeed,
  dailyStartIndex,
  dateKey,
  encodeDaily,
  encodeShare,
  makeSeed,
} from "./core/seed.mjs";
import { rate, threeBV } from "./core/stats.mjs";

export const READY_MESSAGE = "Choose a square. The first one is on us.";
const SEEDED_NOTE = "The first square is open and the clock starts on your move.";

const dailyAddress = (session) => `?${encodeDaily(session.date)}`;
const boardAddress = ({ config, seed, start, noGuess }) => `?${encodeShare({ ...config, seed, start, noGuess })}`;

// A ten-square bar of how much of the board was cleared, without spoiling it.
function progressBar(game) {
  const safeCells = game.board.length - game.mineCount;
  const cleared = game.board.filter((cell) => cell.revealed && !cell.mine).length;
  const filled = Math.round((cleared / safeCells) * 10);
  return { bar: "🟩".repeat(filled) + "⬛".repeat(10 - filled), percent: Math.round((cleared / safeCells) * 100) };
}

// What a share dialog shows for each kind of game. `summary` gets the session, the game,
// and { seconds, assisted }; it never reveals where the mines are.
const DAILY_SHARE = {
  title: "Share the daily challenge",
  note: "Everyone gets the same daily board. The bar shows how much you cleared without giving it away.",
  summary(session, game, { seconds, assisted }) {
    const { bar, percent } = progressBar(game);
    const lines = [`Minefield daily ${session.date}`];
    if (game.phase === "won") {
      lines.push(`✅ Cleared in ${seconds}s${assisted ? " with help" : ""} · ${rate(threeBV(game), seconds).toFixed(2)} 3BV/s`);
    } else if (game.phase === "lost") {
      lines.push(`💥 Hit a mine with ${percent}% cleared`);
    } else {
      lines.push("Can you clear today's board?");
    }
    if (isFinished(game)) lines.push(bar);
    return lines.join("\n");
  },
};

const BOARD_SHARE = {
  title: "Share this board",
  note: "Anyone with this link gets the same board, opened at the same first square.",
  summary(session, game, { seconds, assisted }) {
    const { bar, percent } = progressBar(game);
    const size = `${game.rows}×${game.columns}, ${game.mineCount} mines`;
    if (game.phase === "won") return `I cleared this Minefield board (${size}) in ${seconds}s${assisted ? " with help" : ""}. Can you beat it?`;
    if (game.phase === "lost") return `This Minefield board (${size}) got me at ${percent}% cleared. Can you finish it?\n${bar}`;
    return `Try this Minefield board: ${size}${session.noGuess ? ", no guessing needed" : ""}.`;
  },
};

// `address` is what the browser bar shows; `shareAddress` is what a share link needs
// (a normal board only becomes shareable once its first reveal has set `start`).
export const MODES = {
  normal: {
    bestKey: (session) => session.difficulty,
    statsKey: (session) => session.difficulty,
    address: () => "",
    shareAddress: boardAddress,
    share: BOARD_SHARE,
    sizePrefix: () => null,
    startMessage: () => READY_MESSAGE,
    restart: (session, noGuess = session.noGuess) => normalSession(session.difficulty, session.config, noGuess),
  },
  daily: {
    bestKey: (session) => `daily:${session.date}`,
    statsKey: () => "daily",
    address: dailyAddress,
    shareAddress: dailyAddress,
    share: DAILY_SHARE,
    sizePrefix: (session) => `Daily ${session.date}`,
    startMessage: (session) => `Daily challenge for ${session.date}. ${SEEDED_NOTE}`,
    restart: (session) => session,
  },
  shared: {
    bestKey: (session) => session.difficulty,
    statsKey: (session) => session.difficulty,
    address: boardAddress,
    shareAddress: boardAddress,
    share: BOARD_SHARE,
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
