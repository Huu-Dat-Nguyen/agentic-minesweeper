// Turns mouse and keyboard events on the board into intents. It knows no game rules
// beyond which squares a chord can start from; app.mjs decides what an intent does.
import { indexAt, isFinished, rowCol } from "../core/grid.mjs";

// The square an arrow, Home or End key moves to, or null for any other key.
// Up and Down stop at the first and last square, as in v1.
export function nextIndex({ rows, columns }, index, key, ctrl = false) {
  const { row, column } = rowCol(columns, index);
  const last = rows * columns - 1;
  switch (key) {
    case "ArrowUp": return Math.max(0, index - columns);
    case "ArrowDown": return Math.min(last, index + columns);
    case "ArrowLeft": return column > 0 ? index - 1 : index;
    case "ArrowRight": return column < columns - 1 ? index + 1 : index;
    case "Home": return ctrl ? 0 : indexAt(columns, row, 0);
    case "End": return ctrl ? last : indexAt(columns, row, columns - 1);
    default: return null;
  }
}

// Chording only makes sense on a revealed number while the game is on.
export function canChord(game, index) {
  const cell = game.board[index];
  return cell.revealed && cell.adjacent > 0 && !isFinished(game);
}

// getGame() and getActive() read the current game and active square;
// onMove(index) moves focus; onAction(type, index) asks for a "reveal", "flag" or "chord".
export function createInput({ boardElement, scrollElement, getGame, getActive, getMode, onMove, onAction }) {
  const indexOf = (event) => {
    const button = event.target.closest(".cell");
    return button ? Number(button.dataset.index) : null;
  };

  boardElement.addEventListener("click", (event) => {
    const index = indexOf(event);
    if (index !== null) onAction(getMode() === "flag" ? "flag" : "reveal", index);
  });

  boardElement.addEventListener("contextmenu", (event) => {
    const index = indexOf(event);
    if (index === null) return;
    event.preventDefault();
    const game = getGame();
    if (!game.board[index].revealed) onAction("flag", index);
    else if (canChord(game, index)) onAction("chord", index);
  });

  boardElement.addEventListener("keydown", (event) => {
    const index = indexOf(event);
    if (index === null) return;
    const game = getGame();
    if (event.key === "c" || event.key === "C") {
      if (!canChord(game, index)) return;
      event.preventDefault();
      onAction("chord", index);
      return;
    }
    const next = nextIndex(game, index, event.key, event.ctrlKey);
    if (next === null) return;
    event.preventDefault();
    onMove(next);
  });

  scrollElement.addEventListener("focus", () => {
    if (document.activeElement === scrollElement) onMove(getActive());
  });
}
