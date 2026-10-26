// Wiring only: turns UI events into moves and draws the result.
import { countFlags, DIFFICULTIES } from "./core/engine.mjs";
import { isFinished, MAX_COLUMNS, MAX_ROWS, neighborIndices, positionLabel, sizeError } from "./core/grid.mjs";
import { applyMove, startGame } from "./core/moves.mjs";
import { decodeShare } from "./core/seed.mjs";
import { rate, threeBV } from "./core/stats.mjs";
import { normalSession, READY_MESSAGE, sessionFromShare } from "./modes.mjs";
import { createBoard } from "./ui/board.mjs";

const boardElement = document.querySelector("#board");
const mineCountElement = document.querySelector("#mine-count");
const timerElement = document.querySelector("#timer-display");
const messageElement = document.querySelector("#game-message");
const boardSizeElement = document.querySelector("#board-size");
const restartButton = document.querySelector("#restart-button");
const undoButton = document.querySelector("#undo-button");
const customSizeElement = document.querySelector("#custom-size");
const customInputs = {
  rows: document.querySelector("#custom-rows"),
  columns: document.querySelector("#custom-columns"),
  mines: document.querySelector("#custom-mines"),
};
const applyCustomButton = document.querySelector("#apply-custom");
const difficultyButtons = [...document.querySelectorAll("[data-difficulty]")];
const modeButtons = [...document.querySelectorAll("[data-mode]")];

const LOSS_MESSAGE = "A mine was hiding there. Take a breath and try again.";
const CHORD_LOSS_MESSAGE = "A mine was among the squares cleared. Take a breath and try again.";
const CUSTOM_ERROR = `Custom board needs 1–${MAX_ROWS} rows, 1–${MAX_COLUMNS} columns, and 1 to rows×columns−1 mines.`;
const FACES = {
  won: ["★", "You won. Start a new game"],
  lost: ["×", "Game over. Start a new game"],
};

const board = createBoard(boardElement);
let session;
let state;
let assisted = false;
let mode = "reveal";
let activeIndex = 0;
const clock = { elapsed: 0, since: null, timer: null };

function formatTime(seconds) {
  return String(Math.min(seconds, 9999)).padStart(4, "0");
}

function elapsedMs() {
  return clock.elapsed + (clock.since === null ? 0 : Date.now() - clock.since);
}

function updateTimer() {
  timerElement.textContent = formatTime(Math.floor(elapsedMs() / 1000));
}

function startClock() {
  if (clock.since !== null) return;
  clock.since = Date.now();
  clock.timer = window.setInterval(updateTimer, 250);
}

function stopClock() {
  if (clock.since !== null) clock.elapsed += Date.now() - clock.since;
  clock.since = null;
  window.clearInterval(clock.timer);
  updateTimer();
}

// The clock runs while the game is being played, stops at the end, and resets on a fresh board.
function syncClock() {
  const { phase } = state.game;
  if (phase === "playing") {
    startClock();
    return;
  }
  stopClock();
  if (phase === "ready") {
    clock.elapsed = 0;
    updateTimer();
  }
}

function setAddress(search) {
  try {
    window.history.replaceState(null, "", `${window.location.pathname}${search}`);
  } catch {
    // Some embedded or file:// contexts block address changes; the game still works.
  }
}

function readCustomConfig() {
  const config = {
    rows: Number(customInputs.rows.value),
    columns: Number(customInputs.columns.value),
    mines: Number(customInputs.mines.value),
  };
  return sizeError(config) ? null : config;
}

function boardName() {
  const names = { custom: "Custom", daily: "Daily challenge" };
  return names[session.difficulty] ?? DIFFICULTIES[session.difficulty].label;
}

function showSession() {
  const { difficulty, config, noGuess } = session;
  for (const button of difficultyButtons) {
    const selected = button.dataset.difficulty === difficulty;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  customSizeElement.hidden = difficulty !== "custom";
  if (difficulty === "custom") {
    for (const key of Object.keys(customInputs)) customInputs[key].value = String(config[key]);
  }
  const parts = [`${config.rows} × ${config.columns}`, `${config.mines} mines`];
  if (noGuess) parts.push("no-guess");
  const prefix = session.mode.sizePrefix(session);
  if (prefix) parts.unshift(prefix);
  boardSizeElement.textContent = parts.join(" · ");
  boardElement.setAttribute("aria-label", `${boardName()} Minesweeper board, ${config.rows} rows by ${config.columns} columns`);
}

function render(focus = false) {
  const { game } = state;
  board.render(game, { active: activeIndex, focus });
  const remaining = Math.max(0, game.mineCount - countFlags(game));
  mineCountElement.textContent = String(remaining).padStart(3, "0");
  mineCountElement.setAttribute("aria-label", `${remaining} mines remaining`);
  const [symbol, label] = FACES[game.phase] ?? ["☺", "Start a new game"];
  restartButton.textContent = symbol;
  restartButton.setAttribute("aria-label", label);
}

function begin(next) {
  session = next;
  state = startGame(session);
  assisted = false;
  activeIndex = session.start ?? 0;
  stopClock();
  clock.elapsed = 0;
  updateTimer();
  showSession();
  setAddress(session.mode.address(session));
  messageElement.textContent = session.mode.startMessage(session);
  render();
}

function startNew(difficulty) {
  const config = difficulty === "custom" ? readCustomConfig() : DIFFICULTIES[difficulty];
  if (!config) {
    messageElement.textContent = CUSTOM_ERROR;
    return;
  }
  begin(normalSession(difficulty, config));
}

function finishMessage(game, lossMessage) {
  if (game.phase === "lost") return lossMessage;
  const seconds = Math.floor(elapsedMs() / 1000);
  if (assisted) {
    return `Cleared in ${formatTime(seconds)} seconds with help. Assisted games don't count toward stats or best times.`;
  }
  const boardValue = threeBV(game);
  // S5: record the finished game in stats and best times here (once, unassisted only).
  return `Beautifully done. You cleared the field in ${formatTime(seconds)} seconds · 3BV ${boardValue} · ${rate(boardValue, seconds).toFixed(2)} 3BV/s.`;
}

function chordHint(game, index) {
  const needed = game.board[index].adjacent;
  const flags = neighborIndices(game, index).filter((neighbor) => game.board[neighbor].flagged).length;
  if (flags < needed) return `Place exactly ${needed} flag${needed === 1 ? "" : "s"} around this number to clear its neighbors.`;
  if (flags > needed) return `Remove flags until exactly ${needed} remain around this number.`;
  return "There are no covered neighbors left to clear.";
}

// What to say after a move. `before` and `after` are the games either side of it.
const MESSAGES = {
  undo: (before, after) => (after === before ? "Nothing to undo yet." : "Undone. The board is back one move."),
  flag(before, after, index) {
    const where = positionLabel(after, index);
    if (after !== before) return after.board[index].flagged ? `Flag placed at ${where}.` : `Flag removed from ${where}.`;
    return before.board[index].revealed ? "A revealed square cannot be flagged." : "That move is not available.";
  },
  reveal(before, after, index) {
    if (after === before && before.board[index].revealed) return "That square is already revealed.";
    if (after === before && before.board[index].flagged) return "That square is flagged. Remove its flag before revealing it.";
    return after.phase === "playing" ? "Square revealed. Use the numbers to find a safe path." : "Square revealed.";
  },
  chord: (before, after, index) => (after === before ? chordHint(before, index) : "Neighbors cleared."),
};

// The one place a move is applied: records it, runs the clock, says what happened, redraws.
function play(type, index) {
  const before = state.game;
  state = applyMove(state, { type, index, at: elapsedMs() });
  const { game } = state;
  if (type === "undo" && game !== before && before.phase === "lost") assisted = true;
  if (game !== before) syncClock();

  messageElement.textContent = game !== before && isFinished(game)
    ? finishMessage(game, type === "chord" ? CHORD_LOSS_MESSAGE : LOSS_MESSAGE)
    : MESSAGES[type](before, game, index);
  render(type !== "undo" || game !== before);
}

function playAt(type, index) {
  activeIndex = index;
  play(type, index);
}

function setMode(next) {
  mode = next;
  for (const button of modeButtons) {
    const selected = button.dataset.mode === mode;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  if (isFinished(state.game)) return;
  messageElement.textContent = mode === "flag"
    ? "Flag mode: select a square to mark or unmark it."
    : state.game.phase === "ready"
      ? READY_MESSAGE
      : "Select a square to reveal it.";
}

function cellIndex(event) {
  const button = event.target.closest(".cell");
  return button ? Number(button.dataset.index) : null;
}

boardElement.addEventListener("click", (event) => {
  const index = cellIndex(event);
  if (index !== null) playAt(mode === "flag" ? "flag" : "reveal", index);
});

boardElement.addEventListener("contextmenu", (event) => {
  const index = cellIndex(event);
  if (index === null) return;
  event.preventDefault();
  const cell = state.game.board[index];
  if (!cell.revealed) playAt("flag", index);
  else if (cell.adjacent > 0 && !isFinished(state.game)) playAt("chord", index);
});

for (const button of difficultyButtons) {
  button.addEventListener("click", () => startNew(button.dataset.difficulty));
}
for (const button of modeButtons) {
  button.addEventListener("click", () => setMode(button.dataset.mode));
}
restartButton.addEventListener("click", () => begin(session.mode.restart(session)));
undoButton.addEventListener("click", () => play("undo"));
applyCustomButton.addEventListener("click", () => startNew("custom"));
for (const input of Object.values(customInputs)) {
  input.addEventListener("change", () => {
    if (session.difficulty === "custom") startNew("custom");
  });
}

function startFromAddress() {
  const { search } = window.location;
  const shared = decodeShare(search);
  if (shared) {
    begin(sessionFromShare(shared));
    return;
  }
  startNew("beginner");
  if (search) messageElement.textContent = "That board link was not valid, so here is a fresh game.";
}

startFromAddress();

if ("serviceWorker" in navigator && window.location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Offline support is optional; the game works without it.
    });
  });
}
