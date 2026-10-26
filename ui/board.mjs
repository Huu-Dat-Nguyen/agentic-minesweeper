// Draws the board into one element. Cells are built once per board size;
// afterwards only the cells whose visible state changed are repainted.
import { positionLabel } from "../core/grid.mjs";

const NO_HINT = Object.freeze({ cells: [], clues: [] });

// What one cell looks like. `position` is its spoken position, e.g. "Row 1, column 2".
export function cellView(cell, { phase, hinted = false, hintClue = false, ghost = false, position }) {
  const classes = [];
  let text = "";

  if (cell.revealed) {
    classes.push("is-revealed");
    if (cell.mine) {
      classes.push("is-mine");
      text = "✹";
    } else if (cell.adjacent > 0) {
      classes.push(`number-${cell.adjacent}`);
      text = String(cell.adjacent);
    }
  } else if (cell.flagged) {
    classes.push("is-flagged");
    text = "⚑";
  }

  if (phase === "lost" && cell.mine && !cell.flagged) {
    classes.push("is-exposed-mine");
    text = "✹";
  } else if (ghost && cell.mine && !cell.revealed && !cell.flagged) {
    classes.push("is-ghost-mine");
    text = "✹";
  }
  if (phase === "lost" && cell.flagged && !cell.mine) {
    classes.push("is-wrong-flag");
    text = "×";
  }
  if (hinted) classes.push("is-hint");
  if (hintClue) classes.push("is-hint-clue");

  return { classes, text, label: cellLabel(cell, { phase, hinted, ghost, position }) };
}

function cellLabel(cell, { phase, hinted, ghost, position }) {
  if (cell.revealed && cell.mine) return `${position}, mine`;
  if (cell.revealed) {
    return cell.adjacent === 0
      ? `${position}, empty`
      : `${position}, ${cell.adjacent} adjacent ${cell.adjacent === 1 ? "mine" : "mines"}`;
  }
  if ((phase === "lost" || ghost) && cell.mine) return `${position}, mine`;
  if (cell.flagged && phase === "lost" && !cell.mine) return `${position}, incorrect flag`;
  return (cell.flagged ? `${position}, flagged` : `${position}, covered`) + (hinted ? ", hinted" : "");
}

// The indices to repaint when going from `prev` to `next`. Both are
// { game, hint, ghost }; `prev` is null for a board that was never drawn.
export function changedCells(prev, next) {
  const { board } = next.game;
  if (
    !prev
    || prev.game.rows !== next.game.rows
    || prev.game.columns !== next.game.columns
    || prev.ghost !== next.ghost
    || (prev.game.phase === "lost") !== (next.game.phase === "lost")
  ) {
    return board.map((_, index) => index);
  }

  const changed = new Set();
  board.forEach((cell, index) => {
    if (prev.game.board[index] !== cell) changed.add(index);
  });
  const before = prev.hint ?? NO_HINT;
  const after = next.hint ?? NO_HINT;
  for (const key of ["cells", "clues"]) {
    const was = new Set(before[key]);
    const now = new Set(after[key]);
    for (const index of [...was, ...now]) {
      if (was.has(index) !== now.has(index)) changed.add(index);
    }
  }
  return [...changed];
}

function spokenPosition(game, index) {
  const position = positionLabel(game, index);
  return position[0].toUpperCase() + position.slice(1);
}

export function createBoard(element) {
  let shown = null;
  let activeIndex = null;

  function build({ rows, columns, board }) {
    element.style.setProperty("--columns", String(columns));
    element.style.setProperty("--rows", String(rows));
    const fragment = document.createDocumentFragment();
    board.forEach((_, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cell";
      button.dataset.index = String(index);
      button.setAttribute("role", "gridcell");
      button.tabIndex = -1;
      fragment.append(button);
    });
    element.replaceChildren(fragment);
    activeIndex = null;
  }

  // `hint` is { cells, clues } or null; `ghost` faintly shows hidden mines (replay).
  function render(game, { hint = null, ghost = false, active = 0, focus = false } = {}) {
    const next = { game, hint, ghost };
    if (!shown || shown.game.rows !== game.rows || shown.game.columns !== game.columns) {
      build(game);
      shown = null;
    }

    const hinted = new Set(hint?.cells);
    const clues = new Set(hint?.clues);
    for (const index of changedCells(shown, next)) {
      const view = cellView(game.board[index], {
        phase: game.phase,
        hinted: hinted.has(index),
        hintClue: clues.has(index),
        ghost,
        position: spokenPosition(game, index),
      });
      const button = element.children[index];
      button.className = ["cell", ...view.classes].join(" ");
      button.textContent = view.text;
      button.setAttribute("aria-label", view.label);
    }
    shown = next;

    if (activeIndex !== active) {
      if (activeIndex !== null) element.children[activeIndex].tabIndex = -1;
      element.children[active].tabIndex = 0;
      activeIndex = active;
    }
    if (focus) element.children[active].focus();
  }

  return { render };
}
