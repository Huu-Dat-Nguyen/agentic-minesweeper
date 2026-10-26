import { reveal, revealEach } from "./engine.mjs";
import { isFinished, neighborIndices, positionLabel } from "./grid.mjs";

// Deduces safe squares and mines using only what a player can see: revealed
// numbers and the total mine count. Player flags are ignored because they may
// be wrong. Steps are returned in the order they were found, so earlier steps
// never depend on later ones.
export function deduce(game, { knownMines = [] } = {}) {
  const mines = new Set(knownMines);
  const safe = new Set();
  const steps = [];

  const add = (kind, cells, rule, clues) => {
    const fresh = cells.filter((index) => !mines.has(index) && !safe.has(index));
    if (fresh.length === 0) return false;
    for (const index of fresh) (kind === "mine" ? mines : safe).add(index);
    steps.push({ kind, cells: fresh, rule, clues });
    return true;
  };

  while (true) {
    const constraints = buildConstraints(game, mines, safe);
    let progressed = false;

    for (const constraint of constraints) {
      if (constraint.need === 0) {
        progressed = add("safe", constraint.cells, "clear", [constraint.clue]) || progressed;
      } else if (constraint.need === constraint.cells.length) {
        progressed = add("mine", constraint.cells, "full", [constraint.clue]) || progressed;
      }
    }
    if (progressed) continue;

    if (applyPairRule(constraints, add)) continue;

    const unknown = [];
    game.board.forEach((cell, index) => {
      if (!cell.revealed && !mines.has(index) && !safe.has(index)) unknown.push(index);
    });
    const remaining = game.mineCount - mines.size;
    if (unknown.length > 0 && remaining === 0) {
      progressed = add("safe", unknown, "count-safe", []);
    } else if (unknown.length > 0 && remaining === unknown.length) {
      progressed = add("mine", unknown, "count-mine", []);
    }
    if (!progressed) break;
  }

  return { steps, mines, safe };
}

function buildConstraints(game, mines, safe) {
  const constraints = [];
  game.board.forEach((cell, index) => {
    // Zeros matter too: a player's flag can stop the flood next to one.
    if (!cell.revealed || cell.mine) return;
    let need = cell.adjacent;
    const cells = [];
    for (const neighbor of neighborIndices(game, index)) {
      if (game.board[neighbor].revealed) continue;
      if (mines.has(neighbor)) need -= 1;
      else if (!safe.has(neighbor)) cells.push(neighbor);
    }
    if (cells.length > 0) constraints.push({ clue: index, need, cells });
  });
  return constraints;
}

// Compares two overlapping clues. The mines shared by both must fit within
// each clue's count, which can force the squares only one clue touches.
function applyPairRule(constraints, add) {
  const byCell = new Map();
  constraints.forEach((constraint, position) => {
    for (const index of constraint.cells) {
      if (!byCell.has(index)) byCell.set(index, []);
      byCell.get(index).push(position);
    }
  });

  for (let position = 0; position < constraints.length; position += 1) {
    const first = constraints[position];
    const firstSet = new Set(first.cells);
    const partners = new Set();
    for (const index of first.cells) {
      for (const other of byCell.get(index)) if (other > position) partners.add(other);
    }

    for (const other of partners) {
      const second = constraints[other];
      const secondSet = new Set(second.cells);
      const shared = first.cells.filter((index) => secondSet.has(index));
      const onlyFirst = first.cells.filter((index) => !secondSet.has(index));
      const onlySecond = second.cells.filter((index) => !firstSet.has(index));
      const low = Math.max(0, first.need - onlyFirst.length, second.need - onlySecond.length);
      const high = Math.min(shared.length, first.need, second.need);
      const clues = [first.clue, second.clue];
      let progressed = false;

      for (const [constraint, only] of [[first, onlyFirst], [second, onlySecond]]) {
        if (only.length === 0) continue;
        if (constraint.need - low === 0) {
          progressed = add("safe", only, "pair", clues) || progressed;
        } else if (constraint.need - high === only.length) {
          progressed = add("mine", only, "pair", clues) || progressed;
        }
      }
      if (progressed) return true;
    }
  }
  return false;
}

// Rule -> text. Each takes the game, the hint or step, and its wording helpers.
const EXPLANATIONS = {
  start: () => "Any square is safe for your first move. The middle is a good start.",
  "wrong-flag": (game, hint) => `The flag at ${positionLabel(game, hint.cells[0])} is on a square the numbers prove safe.`,
  clear: (game, step, say) => `The ${clue(game, step.clues[0])} already has all its mines accounted for, so ${say.squares} ${say.is} safe.`,
  full: (game, step, say) => `The ${clue(game, step.clues[0])} has only ${say.neighbors} left for its mines, so ${say.squares} ${say.mines}.`,
  pair: (game, step, say) => `Comparing the ${clue(game, step.clues[0])} with the ${clue(game, step.clues[1])} shows ${say.squares} ${step.kind === "safe" ? `${say.is} safe` : say.mines}.`,
  "count-safe": (game, step, say) => `Every mine is accounted for, so ${say.squares} ${say.is} safe.`,
  "count-mine": (game, step, say) => `The covered squares left exactly match the mines left, so ${say.squares} ${say.mines}.`,
};

function clue(game, index) {
  return `${game.board[index].adjacent} at ${positionLabel(game, index)}`;
}

export function explainHint(game, hint) {
  const count = hint.cells.length;
  const one = count === 1;
  const say = {
    squares: one ? "that square" : `those ${count} squares`,
    is: one ? "is" : "are",
    mines: one ? "is a mine" : "are mines",
    neighbors: one ? "one covered neighbor" : `${count} covered neighbors`,
  };
  return EXPLANATIONS[hint.rule]?.(game, hint, say) ?? "";
}

function centerIndex(game) {
  return Math.floor(game.rows / 2) * game.columns + Math.floor(game.columns / 2);
}

function startHint(game) {
  return { kind: "start", cells: [centerIndex(game)], rule: "start", clues: [] };
}

// The first useful deduction, or a flag the solver proves wrong; null when a guess is needed.
function logicHint(game, { steps, safe }) {
  const wrongFlag = game.board.findIndex((cell, index) => cell.flagged && safe.has(index));
  if (wrongFlag !== -1) {
    return { kind: "wrong-flag", cells: [wrongFlag], rule: "wrong-flag", clues: [] };
  }

  for (const step of steps) {
    const cells = step.cells.filter((index) => (
      step.kind === "safe" ? !game.board[index].revealed : !game.board[index].flagged
    ));
    if (cells.length > 0) return { ...step, cells };
  }
  return null;
}

// Returns the first useful deduction for the current position, a flag the
// solver proves wrong, a starting suggestion, or null when a guess is needed.
export function findHint(game) {
  if (isFinished(game)) return null;
  return game.initialized ? logicHint(game, deduce(game)) : startHint(game);
}

// True when the solver can clear the whole board from this position without guessing.
export function isSolvable(game) {
  let current = {
    ...game,
    board: game.board.map((cell) => (cell.flagged ? { ...cell, flagged: false } : cell)),
  };
  let knownMines = [];

  while (current.phase === "playing") {
    const { safe, mines } = deduce(current, { knownMines });
    knownMines = [...mines];
    if (safe.size === 0) return false;
    current = revealEach(current, safe);
  }
  return current.phase === "won";
}

// Places mines with the first reveal. In no-guess mode, keeps the first
// square's neighbors clear and retries layouts until one can be solved by
// logic alone. The attempt limit keeps seeded boards repeatable; very dense
// boards are almost never guess-free, so they get fewer tries.
export function generateBoard(game, index, random, { noGuess = false, attempts } = {}) {
  attempts ??= game.mineCount / game.board.length > 0.24 ? 40 : 300;
  if (!noGuess) return { game: reveal(game, index, random), guaranteed: false };

  let candidate = game;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    candidate = reveal(game, index, random, { safeArea: true });
    if (candidate.phase === "won" || isSolvable(candidate)) {
      return { game: candidate, guaranteed: true };
    }
  }
  return { game: candidate, guaranteed: false };
}

// Picks the covered square least likely to hide a mine, as a simple estimate.
function guessFrom(game, { mines, safe }, random) {
  const constraints = buildConstraints(game, mines, safe);
  const risk = new Map();
  for (const constraint of constraints) {
    const chance = constraint.need / constraint.cells.length;
    for (const index of constraint.cells) risk.set(index, Math.max(risk.get(index) ?? 0, chance));
  }

  const candidates = [];
  game.board.forEach((cell, index) => {
    if (!cell.revealed && !mines.has(index)) candidates.push(index);
  });
  if (candidates.length === 0) return null;

  const unknownCount = candidates.length;
  const density = Math.max(0, game.mineCount - mines.size) / unknownCount;
  const unflagged = candidates.filter((index) => !game.board[index].flagged);
  const pool = unflagged.length > 0 ? unflagged : candidates;

  let best = Infinity;
  let choices = [];
  for (const index of pool) {
    const chance = risk.get(index) ?? density;
    if (chance < best - 1e-9) {
      best = chance;
      choices = [index];
    } else if (Math.abs(chance - best) <= 1e-9) {
      choices.push(index);
    }
  }
  return { index: choices[Math.floor(random() * choices.length)], risk: best };
}

export function chooseGuess(game, random = Math.random) {
  return guessFrom(game, deduce(game), random);
}

// Decides the autoplayer's next move and explains it in plain words.
export function nextAgentMove(game, random = Math.random) {
  if (isFinished(game)) return null;

  if (!game.initialized) {
    return { action: "reveal", index: startHint(game).cells[0], kind: "start", clues: [], text: "Opening in the middle. The first square is always safe." };
  }

  const deduction = deduce(game);
  const hint = logicHint(game, deduction);
  if (hint?.kind === "wrong-flag") {
    return { action: "unflag", index: hint.cells[0], kind: "logic", clues: [], text: `Removing a wrong flag. ${explainHint(game, hint)}` };
  }
  if (hint) {
    return {
      action: hint.kind === "safe" ? "reveal" : "flag",
      index: hint.cells[0],
      kind: "logic",
      clues: hint.clues,
      text: explainHint(game, hint),
    };
  }

  const guess = guessFrom(game, deduction, random);
  if (!guess) return null;
  return {
    action: game.board[guess.index].flagged ? "unflag" : "reveal",
    index: guess.index,
    kind: "guess",
    clues: [],
    text: `No move is certain, so guessing ${positionLabel(game, guess.index)} (about ${Math.round(guess.risk * 100)}% risk).`,
  };
}
