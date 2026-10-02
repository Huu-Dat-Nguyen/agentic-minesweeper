import {
  chordCell,
  createGame,
  DIFFICULTIES,
  revealCell,
  toggleFlag,
} from "./game-engine.mjs";

const boardElement = document.querySelector("#board");
const boardScroll = document.querySelector("#board-scroll");
const mineCountElement = document.querySelector("#mine-count");
const timerElement = document.querySelector("#timer-display");
const messageElement = document.querySelector("#game-message");
const boardSizeElement = document.querySelector("#board-size");
const restartButton = document.querySelector("#restart-button");
const difficultyButtons = [...document.querySelectorAll("[data-difficulty]")];
const modeButtons = [...document.querySelectorAll("[data-mode]")];

let difficulty = "beginner";
let game = createGame(DIFFICULTIES[difficulty]);
let mode = "reveal";
let activeIndex = 0;
let timerStartedAt = null;
let finalElapsedSeconds = 0;
let timerInterval = null;

function startNewGame(nextDifficulty = difficulty) {
  difficulty = nextDifficulty;
  game = createGame(DIFFICULTIES[difficulty]);
  activeIndex = 0;
  timerStartedAt = null;
  finalElapsedSeconds = 0;
  window.clearInterval(timerInterval);
  timerInterval = null;

  for (const button of difficultyButtons) {
    const selected = button.dataset.difficulty === difficulty;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }

  const { rows, columns, mines } = DIFFICULTIES[difficulty];
  boardSizeElement.textContent = `${rows} × ${columns} · ${mines} mines`;
  timerElement.textContent = "000";
  messageElement.textContent = "Choose a square. The first one is on us.";
  restartButton.textContent = "☺";
  restartButton.setAttribute("aria-label", "Start a new game");
  renderBoard();
}

function setMode(nextMode) {
  mode = nextMode;
  for (const button of modeButtons) {
    const selected = button.dataset.mode === mode;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }

  if (game.phase === "won" || game.phase === "lost") return;
  messageElement.textContent = mode === "flag"
    ? "Flag mode: select a square to mark or unmark it."
    : game.phase === "ready"
      ? "Choose a square. The first one is on us."
      : "Select a square to reveal it.";
}

function renderBoard(restoreFocus = false) {
  const fragment = document.createDocumentFragment();
  boardElement.style.setProperty("--columns", String(game.columns));
  boardElement.style.setProperty("--rows", String(game.rows));
  boardElement.setAttribute(
    "aria-label",
    `${DIFFICULTIES[difficulty].label} Minesweeper board, ${game.rows} rows by ${game.columns} columns`,
  );

  game.board.forEach((cell, index) => {
    const row = Math.floor(index / game.columns);
    const column = index % game.columns;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cell";
    button.dataset.index = String(index);
    button.setAttribute("role", "gridcell");
    button.tabIndex = index === activeIndex ? 0 : -1;

    if (cell.revealed) {
      button.classList.add("is-revealed");
      if (cell.mine) {
        button.classList.add("is-mine");
        button.textContent = "✹";
      } else if (cell.adjacent > 0) {
        button.classList.add(`number-${cell.adjacent}`);
        button.textContent = String(cell.adjacent);
      }
    } else if (cell.flagged) {
      button.classList.add("is-flagged");
      button.textContent = "⚑";
    }

    if (game.phase === "lost" && cell.mine && !cell.flagged) {
      button.classList.add("is-exposed-mine");
      button.textContent = "✹";
    }
    if (game.phase === "lost" && cell.flagged && !cell.mine) {
      button.classList.add("is-wrong-flag");
      button.textContent = "×";
    }

    button.setAttribute("aria-label", getCellLabel(cell, row, column));
    fragment.append(button);
  });

  boardElement.replaceChildren(fragment);
  updateMineCounter();

  if (restoreFocus) {
    boardElement.querySelector(`[data-index="${activeIndex}"]`)?.focus();
  }
}

function getCellLabel(cell, row, column) {
  const position = `Row ${row + 1}, column ${column + 1}`;
  if (cell.revealed && cell.mine) return `${position}, mine`;
  if (cell.revealed) {
    return cell.adjacent === 0
      ? `${position}, empty`
      : `${position}, ${cell.adjacent} adjacent ${cell.adjacent === 1 ? "mine" : "mines"}`;
  }
  if (game.phase === "lost" && cell.mine) return `${position}, mine`;
  if (cell.flagged && game.phase === "lost" && !cell.mine) return `${position}, incorrect flag`;
  return cell.flagged ? `${position}, flagged` : `${position}, covered`;
}

function updateMineCounter() {
  const flags = game.board.reduce((count, cell) => count + Number(cell.flagged), 0);
  const remaining = game.mineCount - flags;
  const formatted = remaining < 0
    ? `-${String(Math.abs(remaining)).padStart(2, "0")}`
    : String(remaining).padStart(3, "0");
  mineCountElement.textContent = formatted;
  mineCountElement.setAttribute("aria-label", `${remaining} mines remaining`);
}

function getAdjacentFlagCount(row, column) {
  let count = 0;
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) continue;
      const nextRow = row + rowOffset;
      const nextColumn = column + columnOffset;
      if (
        nextRow >= 0
        && nextRow < game.rows
        && nextColumn >= 0
        && nextColumn < game.columns
        && game.board[nextRow * game.columns + nextColumn].flagged
      ) {
        count += 1;
      }
    }
  }
  return count;
}

function formatTime(seconds) {
  return String(Math.min(seconds, 999)).padStart(3, "0");
}

function updateTimer() {
  const elapsed = timerStartedAt === null
    ? finalElapsedSeconds
    : Math.floor((Date.now() - timerStartedAt) / 1000);
  timerElement.textContent = formatTime(elapsed);
}

function updateAfterAction(previousPhase, actionDescription) {
  if (previousPhase === "ready" && game.phase !== "ready" && game.phase !== "lost") {
    timerStartedAt = Date.now();
    timerInterval = window.setInterval(updateTimer, 250);
  }

  if (game.phase === "lost" || game.phase === "won") {
    if (timerStartedAt !== null) {
      finalElapsedSeconds = Math.floor((Date.now() - timerStartedAt) / 1000);
      timerStartedAt = null;
    }
    window.clearInterval(timerInterval);
    timerInterval = null;
    updateTimer();
    restartButton.textContent = game.phase === "won" ? "★" : "×";
    restartButton.setAttribute(
      "aria-label",
      game.phase === "won" ? "You won. Start a new game" : "Game over. Start a new game",
    );
  }

  if (game.phase === "won") {
    messageElement.textContent = `Beautifully done. You cleared the field in ${formatTime(finalElapsedSeconds)} seconds.`;
  } else if (game.phase === "lost") {
    messageElement.textContent = "A mine was hiding there. Take a breath and try again.";
  } else {
    messageElement.textContent = actionDescription;
  }
}

function activateCell(button, requestedMode = mode) {
  const index = Number(button.dataset.index);
  if (!Number.isInteger(index)) return;
  activeIndex = index;
  const row = Math.floor(index / game.columns);
  const column = index % game.columns;
  const previousPhase = game.phase;

  if (requestedMode === "flag") {
    const wasFlagged = game.board[index].flagged;
    game = toggleFlag(game, row, column);
    const changed = game.board[index].flagged !== wasFlagged;
    updateAfterAction(previousPhase, changed
      ? game.board[index].flagged
        ? `Flag placed at row ${row + 1}, column ${column + 1}.`
        : `Flag removed from row ${row + 1}, column ${column + 1}.`
      : game.phase === "ready"
        ? "A revealed square cannot be flagged."
        : "That move is not available.");
  } else {
    const wasRevealed = game.board[index].revealed;
    const wasFlagged = game.board[index].flagged;
    game = revealCell(game, row, column);
    const description = wasRevealed
      ? "That square is already revealed."
      : wasFlagged
        ? "That square is flagged. Remove its flag before revealing it."
        : game.phase === "playing"
          ? "Square revealed. Use the numbers to find a safe path."
          : "Square revealed.";
    updateAfterAction(previousPhase, description);
  }

  renderBoard(true);
}

boardElement.addEventListener("click", (event) => {
  const button = event.target.closest(".cell");
  if (button) activateCell(button);
});

boardElement.addEventListener("contextmenu", (event) => {
  const button = event.target.closest(".cell");
  if (!button) return;
  event.preventDefault();
  const index = Number(button.dataset.index);
  if (!Number.isInteger(index)) return;

  const cell = game.board[index];
  if (!cell.revealed) {
    activateCell(button, "flag");
    return;
  }

  if (cell.adjacent === 0 || game.phase === "won" || game.phase === "lost") return;

  activeIndex = index;
  const row = Math.floor(index / game.columns);
  const column = index % game.columns;
  const previousPhase = game.phase;
  const previousGame = game;
  game = chordCell(game, row, column);
  const flagCount = getAdjacentFlagCount(row, column);
  let message = "Neighbors cleared.";
  if (game === previousGame) {
    if (flagCount < cell.adjacent) {
      message = `Place exactly ${cell.adjacent} flag${cell.adjacent === 1 ? "" : "s"} around this number to clear its neighbors.`;
    } else if (flagCount > cell.adjacent) {
      message = `Remove flags until exactly ${cell.adjacent} remain around this number.`;
    } else {
      message = "There are no covered neighbors left to clear.";
    }
  } else if (game.phase === "lost") {
    message = "A mine was among the squares cleared. Take a breath and try again.";
  } else if (game.phase === "won") {
    message = "Beautifully done. You cleared the field.";
  }
  updateAfterAction(previousPhase, message);
  renderBoard(true);
});

boardElement.addEventListener("keydown", (event) => {
  const button = event.target.closest(".cell");
  if (!button) return;

  const index = Number(button.dataset.index);
  const row = Math.floor(index / game.columns);
  const column = index % game.columns;
  let nextIndex = index;

  switch (event.key) {
    case "ArrowUp":
      nextIndex = Math.max(0, index - game.columns);
      break;
    case "ArrowDown":
      nextIndex = Math.min(game.board.length - 1, index + game.columns);
      break;
    case "ArrowLeft":
      if (column > 0) nextIndex = index - 1;
      break;
    case "ArrowRight":
      if (column < game.columns - 1) nextIndex = index + 1;
      break;
    case "Home":
      nextIndex = event.ctrlKey ? 0 : row * game.columns;
      break;
    case "End":
      nextIndex = event.ctrlKey
        ? game.board.length - 1
        : row * game.columns + game.columns - 1;
      break;
    default:
      return;
  }

  event.preventDefault();
  activeIndex = nextIndex;
  boardElement.querySelector(`[data-index="${activeIndex}"]`)?.focus();
});

for (const button of difficultyButtons) {
  button.addEventListener("click", () => startNewGame(button.dataset.difficulty));
}

for (const button of modeButtons) {
  button.addEventListener("click", () => setMode(button.dataset.mode));
}

restartButton.addEventListener("click", () => startNewGame());
boardScroll.addEventListener("focus", () => {
  if (document.activeElement === boardScroll) {
    boardElement.querySelector(`[data-index="${activeIndex}"]`)?.focus();
  }
});

startNewGame();
