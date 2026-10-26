// A game is a seed plus a list of moves, so it can be saved and replayed.
// Playing and replaying both go through applyMove.
import { chord, createGame, reveal, toggleFlag } from "./engine.mjs";
import { sizeError } from "./grid.mjs";
import { createRandom } from "./seed.mjs";
import { generateBoard } from "./solver.mjs";

export function startGame({ config, seed, noGuess }) {
  return { config, seed, noGuess, game: createGame(config), history: [], moves: [], guaranteed: false };
}

const PLAY = {
  reveal(state, index) {
    if (state.game.initialized) return { ...state, game: reveal(state.game, index) };
    // Skip board generation (up to 300 tries) for a move reveal would ignore anyway.
    if (reveal(state.game, index, () => 0) === state.game) return state;
    const { game, guaranteed } = generateBoard(state.game, index, createRandom(state.seed), { noGuess: state.noGuess });
    return { ...state, game, guaranteed };
  },
  flag: (state, index) => ({ ...state, game: toggleFlag(state.game, index) }),
  chord: (state, index) => ({ ...state, game: chord(state.game, index) }),
};

// move: { type: "reveal" | "flag" | "chord" | "undo", index, at }. Returns the
// same state when the move changes nothing; such moves are not recorded.
export function applyMove(state, move) {
  if (move.type === "undo") {
    if (state.history.length === 0) return state;
    const game = state.history.at(-1);
    return {
      ...state,
      game,
      guaranteed: game.initialized && state.guaranteed,
      history: state.history.slice(0, -1),
      moves: [...state.moves, move],
    };
  }

  if (!Object.hasOwn(PLAY, move.type)) throw new TypeError(`Unknown move type: ${move.type}`);
  const next = PLAY[move.type](state, move.index);
  if (next.game === state.game) return state;
  return { ...next, history: [...state.history, state.game], moves: [...state.moves, move] };
}

export function toRecord({ config: { rows, columns, mines }, seed, noGuess, moves }) {
  return { config: { rows, columns, mines }, seed, noGuess, moves };
}

// Rebuilds every position of a saved game: frame 0 is the fresh board, then one frame per move.
export function replay(record) {
  if (!record || typeof record !== "object") throw new TypeError("Record must be an object.");
  const error = sizeError(record.config ?? {});
  if (error) throw new TypeError(error);
  if (typeof record.seed !== "string") throw new TypeError("Record needs a seed string.");
  if (!Array.isArray(record.moves)) throw new TypeError("Record needs a list of moves.");

  let state = startGame({ config: record.config, seed: record.seed, noGuess: Boolean(record.noGuess) });
  const frames = [{ game: state.game, at: 0 }];
  for (const move of record.moves) {
    state = applyMove(state, move);
    frames.push({ game: state.game, at: move.at });
  }
  return frames;
}
