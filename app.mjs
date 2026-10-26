// Wiring only: turns UI events into moves and draws the result.
import { countFlags, DIFFICULTIES } from "./core/engine.mjs";
import { isFinished, MAX_COLUMNS, MAX_ROWS, neighborIndices, positionLabel, sizeError } from "./core/grid.mjs";
import { applyMove, startGame } from "./core/moves.mjs";
import { decodeShare } from "./core/seed.mjs";
import { explainHint, findHint } from "./core/solver.mjs";
import { rate, threeBV } from "./core/stats.mjs";
import { LocalStore } from "./data/store.mjs";
import { dailySession, MODES, normalSession, READY_MESSAGE, sessionFromShare } from "./modes.mjs";
import { createAgent } from "./ui/agent.mjs";
import { createBoard } from "./ui/board.mjs";
import { createInput } from "./ui/input.mjs";
import { createShareDialog } from "./ui/share.mjs";

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
const noGuessButton = document.querySelector("#no-guess-button");
const hintButton = document.querySelector("#hint-button");
const agentButton = document.querySelector("#agent-button");
const dailyButton = document.querySelector("#daily-button");
const shareButton = document.querySelector("#share-button");

const LOSS_MESSAGE = "A mine was hiding there. Take a breath and try again.";
const CHORD_LOSS_MESSAGE = "A mine was among the squares cleared. Take a breath and try again.";
const CUSTOM_ERROR = `Custom board needs 1–${MAX_ROWS} rows, 1–${MAX_COLUMNS} columns, and 1 to rows×columns−1 mines.`;
const FACES = {
  won: ["★", "You won. Start a new game"],
  lost: ["×", "Game over. Start a new game"],
};

const board = createBoard(boardElement);
const store = new LocalStore(() => window.localStorage);
const shareDialog = createShareDialog();
let settings = { noGuess: false, ...store.loadSettings() };
let session;
let state;
let assisted = false;
let mode = "reveal";
let activeIndex = 0;
let hint = null;
const clock = { elapsed: 0, since: null, timer: null };

function formatTime(seconds) {
  return String(Math.min(seconds, 9999)).padStart(4, "0");
}

function elapsedMs() {
  return clock.elapsed + (clock.since === null ? 0 : Date.now() - clock.since);
}

function elapsedSeconds() {
  return Math.floor(elapsedMs() / 1000);
}

function updateTimer() {
  timerElement.textContent = formatTime(elapsedSeconds());
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
  dailyButton.classList.toggle("is-on", session.mode === MODES.daily);
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

function showNoGuess() {
  noGuessButton.setAttribute("aria-pressed", String(settings.noGuess));
  noGuessButton.classList.toggle("is-on", settings.noGuess);
}

function render(focus = false) {
  const { game } = state;
  board.render(game, { hint, active: activeIndex, focus });
  const remaining = Math.max(0, game.mineCount - countFlags(game));
  mineCountElement.textContent = String(remaining).padStart(3, "0");
  mineCountElement.setAttribute("aria-label", `${remaining} mines remaining`);
  const [symbol, label] = FACES[game.phase] ?? ["☺", "Start a new game"];
  restartButton.textContent = symbol;
  restartButton.setAttribute("aria-label", label);
}

// Stops everything that runs or shows on its own (the AI, a hint) before the player acts.
function interrupt() {
  agent.stop();
  if (hint) {
    hint = null;
    render();
  }
}

function begin(next) {
  interrupt();
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
  begin(normalSession(difficulty, config, settings.noGuess));
}

function finishMessage(game, lossMessage) {
  if (game.phase === "lost") return lossMessage;
  const seconds = elapsedSeconds();
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

function firstRevealNote() {
  if (!state.noGuess) return "";
  return state.guaranteed
    ? " No-guess board: every square can be worked out by logic."
    : " No guess-free layout was found for this board, so it may need a guess.";
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
// options: message and loss replace the usual texts, hint is shown after the move,
// assisted marks the game as helped, focus overrides whether a square takes focus.
function play(type, index, options = {}) {
  const before = state.game;
  state = applyMove(state, { type, index, at: elapsedMs() });
  const { game } = state;
  if (options.assisted || (type === "undo" && game !== before && before.phase === "lost")) assisted = true;
  if (game !== before) syncClock();
  hint = isFinished(game) ? null : options.hint ?? null;
  if (options.hint) activeIndex = index;

  if (game !== before && isFinished(game)) {
    messageElement.textContent = finishMessage(game, options.loss ?? (type === "chord" ? CHORD_LOSS_MESSAGE : LOSS_MESSAGE));
  } else {
    const opened = !before.initialized && game.initialized;
    messageElement.textContent = (options.message ?? MESSAGES[type](before, game, index)) + (opened ? firstRevealNote() : "");
  }
  render(options.focus ?? (type !== "undo" || game !== before));
}

// A player's move: it ends anything running on its own first.
function act(type, index) {
  interrupt();
  activeIndex = index;
  play(type, index);
}

const agent = createAgent({ button: agentButton, getGame: () => state.game, play });

function showHint() {
  interrupt();
  if (isFinished(state.game)) {
    messageElement.textContent = "This game is over. Start a new one for more hints.";
    return;
  }
  const found = findHint(state.game);
  if (!found) {
    messageElement.textContent = "Hint: no square is certain right now. This spot needs a guess.";
    return;
  }
  if (found.kind !== "start") assisted = true;
  hint = { cells: found.cells, clues: found.clues };
  activeIndex = found.cells[0];
  messageElement.textContent = `Hint: ${explainHint(state.game, found)}`;
  render();
}

// The setting decides the next normal board; a board that has not started yet follows it too.
function toggleNoGuess() {
  settings = { ...settings, noGuess: !settings.noGuess };
  store.saveSettings({ noGuess: settings.noGuess });
  if (!state.game.initialized) {
    session = { ...session, noGuess: settings.noGuess };
    state = { ...state, noGuess: settings.noGuess };
    showSession();
  }
  showNoGuess();
  messageElement.textContent = settings.noGuess
    ? state.game.initialized
      ? "No-guess is on. Your next board will never need a guess."
      : "No-guess is on. This board will never need a guess."
    : "No-guess is off. Boards are classic random layouts.";
}

function toggleAgent() {
  if (agent.isRunning()) {
    agent.stop();
    messageElement.textContent = "AI stopped. Your move.";
    return;
  }
  interrupt();
  if (isFinished(state.game)) begin(session.mode.restart(session, settings.noGuess));
  agent.start();
}

function openShare() {
  interrupt();
  if (state.start === null) {
    messageElement.textContent = "Reveal a square first, then share this exact board.";
    return;
  }
  const { share, shareAddress } = session.mode;
  const link = `${window.location.origin}${window.location.pathname}${shareAddress({ ...session, start: state.start })}`;
  const summary = share.summary(session, state.game, { seconds: elapsedSeconds(), assisted });
  shareDialog.open(share.title, share.note, `${summary}\n${link}`);
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

createInput({
  boardElement,
  scrollElement: document.querySelector("#board-scroll"),
  getGame: () => state.game,
  getActive: () => activeIndex,
  getMode: () => mode,
  onMove(index) {
    activeIndex = index;
    render(true);
  },
  onAction: act,
});

for (const button of difficultyButtons) {
  button.addEventListener("click", () => startNew(button.dataset.difficulty));
}
for (const button of modeButtons) {
  button.addEventListener("click", () => setMode(button.dataset.mode));
}
restartButton.addEventListener("click", () => begin(session.mode.restart(session, settings.noGuess)));
undoButton.addEventListener("click", () => {
  interrupt();
  play("undo");
});
noGuessButton.addEventListener("click", toggleNoGuess);
hintButton.addEventListener("click", showHint);
agentButton.addEventListener("click", toggleAgent);
dailyButton.addEventListener("click", () => begin(dailySession()));
shareButton.addEventListener("click", openShare);
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

showNoGuess();
startFromAddress();

if ("serviceWorker" in navigator && window.location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Offline support is optional; the game works without it.
    });
  });
}
