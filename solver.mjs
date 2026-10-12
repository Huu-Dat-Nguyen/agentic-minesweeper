import { neighborIndices, revealCell } from "./game-engine.mjs";

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
    const partners = new Set();
    for (const index of first.cells) {
      for (const other of byCell.get(index)) if (other > position) partners.add(other);
    }

    for (const other of partners) {
      const second = constraints[other];
      const firstSet = new Set(first.cells);
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

export function explainStep(game, step) {
  const where = (index) => `row ${Math.floor(index / game.columns) + 1}, column ${(index % game.columns) + 1}`;
  const squares = step.cells.length === 1 ? "that square" : `those ${step.cells.length} squares`;
  const value = (index) => game.board[index].adjacent;

  switch (step.rule) {
    case "clear":
      return `The ${value(step.clues[0])} at ${where(step.clues[0])} already has all its mines accounted for, so ${squares} ${step.cells.length === 1 ? "is" : "are"} safe.`;
    case "full":
      return `The ${value(step.clues[0])} at ${where(step.clues[0])} has only ${step.cells.length === 1 ? "one covered neighbor" : `${step.cells.length} covered neighbors`} left for its mines, so ${squares} ${step.cells.length === 1 ? "is a mine" : "are mines"}.`;
    case "pair":
      return `Comparing the ${value(step.clues[0])} at ${where(step.clues[0])} with the ${value(step.clues[1])} at ${where(step.clues[1])} shows ${squares} ${step.kind === "safe" ? (step.cells.length === 1 ? "is safe" : "are safe") : (step.cells.length === 1 ? "is a mine" : "are mines")}.`;
    case "count-safe":
      return `Every mine is accounted for, so ${squares} ${step.cells.length === 1 ? "is" : "are"} safe.`;
    case "count-mine":
      return `The covered squares left exactly match the mines left, so ${squares} ${step.cells.length === 1 ? "is a mine" : "are mines"}.`;
    default:
      return "";
  }
}

function centerIndex(game) {
  return Math.floor(game.rows / 2) * game.columns + Math.floor(game.columns / 2);
}

// Returns the first useful deduction for the current position, a flag the
// solver proves wrong, a starting suggestion, or null when a guess is needed.
export function findHint(game) {
  if (game.phase === "won" || game.phase === "lost") return null;
  if (!game.initialized) {
    return { kind: "start", cells: [centerIndex(game)], rule: "start", clues: [] };
  }

  const { steps, safe } = deduce(game);
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

export function explainHint(game, hint) {
  if (hint.kind === "start") return "Any square is safe for your first move. The middle is a good start.";
  if (hint.kind === "wrong-flag") {
    return `The flag at row ${Math.floor(hint.cells[0] / game.columns) + 1}, column ${(hint.cells[0] % game.columns) + 1} is on a square the numbers prove safe.`;
  }
  return explainStep(game, hint);
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
    for (const index of safe) {
      current = revealCell(current, Math.floor(index / current.columns), index % current.columns);
    }
  }
  return current.phase === "won";
}

// Places mines with the first reveal. In no-guess mode, keeps the first
// square's neighbors clear and retries layouts until one can be solved by
// logic alone. The attempt limit keeps seeded boards repeatable; very dense
// boards are almost never guess-free, so they get fewer tries.
export function generateBoard(game, index, random, { noGuess = false, attempts } = {}) {
  attempts ??= game.mineCount / game.board.length > 0.24 ? 40 : 300;
  const row = Math.floor(index / game.columns);
  const column = index % game.columns;
  if (!noGuess) return { game: revealCell(game, row, column, random), guaranteed: false };

  let candidate = game;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    candidate = revealCell(game, row, column, random, { safeArea: true });
    if (candidate.phase === "won" || isSolvable(candidate)) {
      return { game: candidate, guaranteed: true, attempts: attempt };
    }
  }
  return { game: candidate, guaranteed: false, attempts };
}

// Picks the covered square least likely to hide a mine, as a simple estimate.
export function chooseGuess(game, random = Math.random) {
  const { mines, safe } = deduce(game);
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

// Decides the autoplayer's next move and explains it in plain words.
export function nextAgentMove(game, random = Math.random) {
  if (game.phase === "won" || game.phase === "lost") return null;

  const hint = findHint(game);
  if (hint?.kind === "start") {
    return { action: "reveal", index: hint.cells[0], kind: "start", clues: [], text: "Opening in the middle. The first square is always safe." };
  }
  if (hint?.kind === "wrong-flag") {
    return { action: "unflag", index: hint.cells[0], kind: "logic", clues: [], text: `Removing a wrong flag. ${explainHint(game, hint)}` };
  }
  if (hint) {
    return {
      action: hint.kind === "safe" ? "reveal" : "flag",
      index: hint.cells[0],
      kind: "logic",
      clues: hint.clues,
      text: explainStep(game, hint),
    };
  }

  const guess = chooseGuess(game, random);
  if (!guess) return null;
  const where = `row ${Math.floor(guess.index / game.columns) + 1}, column ${(guess.index % game.columns) + 1}`;
  return {
    action: game.board[guess.index].flagged ? "unflag" : "reveal",
    index: guess.index,
    kind: "guess",
    clues: [],
    text: `No move is certain, so guessing ${where} (about ${Math.round(guess.risk * 100)}% risk).`,
  };
}
