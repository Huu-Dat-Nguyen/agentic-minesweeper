import {
  chordCell,
  createGame,
  DIFFICULTIES,
  MAX_COLUMNS,
  MAX_ROWS,
  revealCell,
  toggleFlag,
  undo,
} from "./game-engine.mjs";
import {
  createRandom,
  DAILY_CONFIG,
  dailySeed,
  dailyStartIndex,
  dateKey,
  decodeShare,
  encodeShare,
  makeSeed,
} from "./seed.mjs";
import { explainHint, findHint, generateBoard, nextAgentMove } from "./solver.mjs";
import { recordResult, sanitizeStats, summarize, threeBV } from "./stats.mjs";

const boardElement = document.querySelector("#board");
const boardScroll = document.querySelector("#board-scroll");
const mineCountElement = document.querySelector("#mine-count");
const timerElement = document.querySelector("#timer-display");
const messageElement = document.querySelector("#game-message");
const boardSizeElement = document.querySelector("#board-size");
const restartButton = document.querySelector("#restart-button");
const undoButton = document.querySelector("#undo-button");
const customSizeElement = document.querySelector("#custom-size");
const customRowsElement = document.querySelector("#custom-rows");
const customColumnsElement = document.querySelector("#custom-columns");
const customMinesElement = document.querySelector("#custom-mines");
const applyCustomButton = document.querySelector("#apply-custom");
const bestTimeElement = document.querySelector("#best-time");
const noGuessButton = document.querySelector("#no-guess-button");
const hintButton = document.querySelector("#hint-button");
const agentButton = document.querySelector("#agent-button");
const dailyButton = document.querySelector("#daily-button");
const shareButton = document.querySelector("#share-button");
const shareDialog = document.querySelector("#share-dialog");
const shareTitle = document.querySelector("#share-title");
const shareNote = document.querySelector("#share-note");
const shareTextElement = document.querySelector("#share-text");
const copyShareButton = document.querySelector("#copy-share");
const nativeShareButton = document.querySelector("#native-share");
const playControls = document.querySelector(".play-controls");
const replayButton = document.querySelector("#replay-button");
const replayBar = document.querySelector("#replay-bar");
const replayBackButton = document.querySelector("#replay-back");
const replayPlayButton = document.querySelector("#replay-play");
const replayForwardButton = document.querySelector("#replay-forward");
const replaySlider = document.querySelector("#replay-slider");
const replayPosition = document.querySelector("#replay-position");
const replaySpeed = document.querySelector("#replay-speed");
const replayExitButton = document.querySelector("#replay-exit");
const statsButton = document.querySelector("#stats-button");
const statsDialog = document.querySelector("#stats-dialog");
const statsBody = document.querySelector("#stats-body");
const resetStatsButton = document.querySelector("#reset-stats");
const settingsButton = document.querySelector("#settings-button");
const settingsDialog = document.querySelector("#settings-dialog");
const settingInputs = {
  colorblind: document.querySelector("#setting-colorblind"),
  contrast: document.querySelector("#setting-contrast"),
  sound: document.querySelector("#setting-sound"),
  reduceMotion: document.querySelector("#setting-motion"),
};
const difficultyButtons = [...document.querySelectorAll("[data-difficulty]")];
const modeButtons = [...document.querySelectorAll("[data-mode]")];

const BEST_TIME_KEY = "minefield.bestTimes.v1";
const SETTINGS_KEY = "minefield.settings.v1";
const STATS_KEY = "minefield.stats.v1";
const STATS_ROWS = [
  ["beginner", "Beginner"],
  ["intermediate", "Intermediate"],
  ["expert", "Expert"],
  ["custom", "Custom"],
  ["daily", "Daily"],
];
const AGENT_DELAY_MS = 550;
const READY_MESSAGE = "Choose a square. The first one is on us.";
const LOSS_MESSAGE = "A mine was hiding there. Take a breath and try again.";
const CUSTOM_ERROR = `Custom board needs 1–${MAX_ROWS} rows, 1–${MAX_COLUMNS} columns, and 1 to rows×columns−1 mines.`;

let difficulty = "beginner";
let game = createGame(DIFFICULTIES[difficulty]);
let session = null;
let history = [];
let mode = "reveal";
let activeIndex = 0;
let hint = null;
let agentRunning = false;
let agentTimer = null;
let elapsedMs = 0;
let runningSince = null;
let clockStarted = false;
let timerInterval = null;
let bestTimes = loadStored(BEST_TIME_KEY, {});
let settings = {
  noGuess: false,
  colorblind: false,
  contrast: false,
  sound: false,
  reduceMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  ...loadStored(SETTINGS_KEY, {}),
};
let audioContext = null;
let stats = sanitizeStats(loadStored(STATS_KEY, {}));
let timeline = [];
let replay = null;

function loadStored(key, fallback) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(key));
    if (stored && typeof stored === "object" && !Array.isArray(stored)) return stored;
  } catch {
    // Ignore unreadable stored values; the game works without them.
  }
  return fallback;
}

function saveStored(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode); the game still works.
  }
}

function isFinished(state = game) {
  return state.phase === "won" || state.phase === "lost";
}

function cellPosition(index) {
  return { row: Math.floor(index / game.columns), column: index % game.columns };
}

// Daily boards keep a best time per date; everything else per difficulty.
function bestKey() {
  return session?.kind === "daily" ? `daily:${session.date}` : difficulty;
}

function updateBestTimeDisplay() {
  const stored = bestTimes[bestKey()];
  bestTimeElement.textContent = typeof stored === "number" ? formatTime(stored) : "--";
}

function recordBestTime(seconds) {
  const key = bestKey();
  const stored = bestTimes[key];
  if (typeof stored === "number" && stored <= seconds) return false;
  bestTimes = { ...bestTimes, [key]: seconds };
  saveStored(BEST_TIME_KEY, bestTimes);
  return true;
}

function readCustomConfig() {
  const rows = Number(customRowsElement.value);
  const columns = Number(customColumnsElement.value);
  const mines = Number(customMinesElement.value);
  if (
    !Number.isInteger(rows) || !Number.isInteger(columns) || !Number.isInteger(mines)
    || rows < 1 || rows > MAX_ROWS
    || columns < 1 || columns > MAX_COLUMNS
    || mines < 1 || mines >= rows * columns
  ) {
    return null;
  }
  return { rows, columns, mines };
}

function startNewGame(nextDifficulty = difficulty) {
  if (nextDifficulty === "daily") nextDifficulty = "beginner";
  const config = nextDifficulty === "custom" ? readCustomConfig() : DIFFICULTIES[nextDifficulty];
  if (!config) {
    messageElement.textContent = CUSTOM_ERROR;
    return;
  }
  difficulty = nextDifficulty;
  beginSession(createGame(config), {
    kind: "normal",
    seed: makeSeed(),
    noGuess: settings.noGuess,
    start: null,
  });
  setAddress("");
  messageElement.textContent = READY_MESSAGE;
}

function presetFor({ rows, columns, mines }) {
  return Object.keys(DIFFICULTIES).find((key) => {
    const preset = DIFFICULTIES[key];
    return preset.rows === rows && preset.columns === columns && preset.mines === mines;
  });
}

// Daily and shared boards open their start square right away from the seed,
// so everyone with the same link gets the same board.
function startSeededGame({ kind, config, seed, start, noGuess, date = null }) {
  if (kind === "daily") {
    difficulty = "daily";
  } else {
    difficulty = presetFor(config) ?? "custom";
    if (difficulty === "custom") {
      customRowsElement.value = String(config.rows);
      customColumnsElement.value = String(config.columns);
      customMinesElement.value = String(config.mines);
    }
  }
  const result = generateBoard(createGame(config), start, createRandom(seed), { noGuess });
  beginSession(result.game, { kind, seed, noGuess, start, date, guaranteed: result.guaranteed });
  if (kind === "daily") {
    setAddress(`?daily=${date}`);
    messageElement.textContent = `Daily challenge for ${date}. The first square is open and the clock starts on your move.`;
  } else {
    setAddress(`?${encodeShare({ ...config, seed, start, noGuess })}`);
    messageElement.textContent = "Shared board loaded. The first square is open and the clock starts on your move.";
  }
}

function startDaily(date = dateKey()) {
  startSeededGame({
    kind: "daily",
    config: DAILY_CONFIG,
    seed: dailySeed(date),
    start: dailyStartIndex(date),
    noGuess: true,
    date,
  });
}

function beginSession(nextGame, details) {
  stopAgent();
  stopReplay(false);
  game = nextGame;
  session = { guaranteed: false, assisted: false, recorded: false, date: null, ...details };
  history = [];
  timeline = [{ game, at: 0 }];
  activeIndex = details.start ?? 0;
  hint = null;
  resetClock();

  for (const button of difficultyButtons) {
    const selected = button.dataset.difficulty === difficulty;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  customSizeElement.hidden = difficulty !== "custom";
  dailyButton.classList.toggle("is-on", session.kind === "daily");
  updateBoardSize();
  updateBestTimeDisplay();
  updateToolButtons();
  setFace();
  renderBoard();
}

function restartGame() {
  if (session.kind === "normal") {
    startNewGame();
  } else {
    startSeededGame({
      kind: session.kind,
      config: { rows: game.rows, columns: game.columns, mines: game.mineCount },
      seed: session.seed,
      start: session.start,
      noGuess: session.noGuess,
      date: session.date,
    });
  }
}

function setAddress(search) {
  try {
    window.history.replaceState(null, "", `${window.location.pathname}${search}`);
  } catch {
    // Some embedded or file:// contexts block address changes; the game still works.
  }
}

function applyCustomBoard() {
  if (!readCustomConfig()) {
    messageElement.textContent = CUSTOM_ERROR;
    return;
  }
  startNewGame("custom");
}

function updateBoardSize() {
  const parts = [`${game.rows} × ${game.columns}`, `${game.mineCount} mines`];
  if (session.noGuess) parts.push("no-guess");
  if (session.kind === "daily") parts.unshift(`Daily ${session.date}`);
  if (session.kind === "shared") parts.unshift("Shared");
  boardSizeElement.textContent = parts.join(" · ");
}

function setFace() {
  const faces = {
    won: ["★", "You won. Start a new game"],
    lost: ["×", "Game over. Start a new game"],
  };
  const [symbol, label] = faces[game.phase] ?? ["☺", "Start a new game"];
  restartButton.textContent = symbol;
  restartButton.setAttribute("aria-label", label);
}

function updateToolButtons() {
  noGuessButton.setAttribute("aria-pressed", String(settings.noGuess));
  noGuessButton.classList.toggle("is-on", settings.noGuess);
  agentButton.setAttribute("aria-pressed", String(agentRunning));
  agentButton.setAttribute("aria-label", agentRunning ? "Stop the AI" : "Watch AI play");
  agentButton.querySelector(".tool-icon").textContent = agentRunning ? "■" : "▶";
  agentButton.querySelector(".tool-text").textContent = agentRunning ? "Stop AI" : "Watch AI";
  replayButton.disabled = !isFinished() || timeline.length < 2;
}

function setMode(nextMode) {
  mode = nextMode;
  for (const button of modeButtons) {
    const selected = button.dataset.mode === mode;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }

  if (isFinished()) return;
  messageElement.textContent = mode === "flag"
    ? "Flag mode: select a square to mark or unmark it."
    : game.phase === "ready"
      ? READY_MESSAGE
      : "Select a square to reveal it.";
}

function boardLabel() {
  const names = { custom: "Custom", daily: "Daily challenge" };
  const name = names[difficulty] ?? DIFFICULTIES[difficulty].label;
  return `${name} Minesweeper board, ${game.rows} rows by ${game.columns} columns`;
}

function renderBoard(restoreFocus = false) {
  // During a replay the board shows a past state, with mines faintly visible.
  const view = replay ? timeline[replay.index].game : game;
  const fragment = document.createDocumentFragment();
  const hintCells = new Set(replay ? [] : hint?.cells ?? []);
  const hintClues = new Set(replay ? [] : hint?.clues ?? []);
  boardElement.style.setProperty("--columns", String(view.columns));
  boardElement.style.setProperty("--rows", String(view.rows));
  boardElement.setAttribute("aria-label", boardLabel());

  view.board.forEach((cell, index) => {
    const row = Math.floor(index / view.columns);
    const column = index % view.columns;
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

    if (view.phase === "lost" && cell.mine && !cell.flagged) {
      button.classList.add("is-exposed-mine");
      button.textContent = "✹";
    } else if (replay && cell.mine && !cell.revealed && !cell.flagged) {
      button.classList.add("is-ghost-mine");
      button.textContent = "✹";
    }
    if (view.phase === "lost" && cell.flagged && !cell.mine) {
      button.classList.add("is-wrong-flag");
      button.textContent = "×";
    }
    if (hintCells.has(index)) button.classList.add("is-hint");
    if (hintClues.has(index)) button.classList.add("is-hint-clue");

    button.setAttribute("aria-label", getCellLabel(view, cell, row, column, hintCells.has(index)));
    fragment.append(button);
  });

  boardElement.replaceChildren(fragment);
  updateMineCounter(view);

  if (restoreFocus) {
    boardElement.querySelector(`[data-index="${activeIndex}"]`)?.focus();
  }
}

function getCellLabel(view, cell, row, column, hinted) {
  const position = `Row ${row + 1}, column ${column + 1}`;
  const suffix = hinted ? ", hinted" : "";
  if (cell.revealed && cell.mine) return `${position}, mine`;
  if (cell.revealed) {
    return cell.adjacent === 0
      ? `${position}, empty`
      : `${position}, ${cell.adjacent} adjacent ${cell.adjacent === 1 ? "mine" : "mines"}`;
  }
  if ((view.phase === "lost" || replay) && cell.mine) return `${position}, mine`;
  if (cell.flagged && view.phase === "lost" && !cell.mine) return `${position}, incorrect flag`;
  return (cell.flagged ? `${position}, flagged` : `${position}, covered`) + suffix;
}

function countFlags(state) {
  return state.board.reduce((count, cell) => count + Number(cell.flagged), 0);
}

function updateMineCounter(view = game) {
  const flags = countFlags(view);
  const remaining = Math.max(0, view.mineCount - flags);
  mineCountElement.textContent = String(remaining).padStart(3, "0");
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
  return String(Math.min(seconds, 9999)).padStart(4, "0");
}

function elapsedMilliseconds() {
  return elapsedMs + (runningSince === null ? 0 : Date.now() - runningSince);
}

function elapsedSeconds() {
  return Math.floor(elapsedMilliseconds() / 1000);
}

function updateTimer() {
  timerElement.textContent = formatTime(elapsedSeconds());
}

function startClock() {
  if (runningSince !== null) return;
  clockStarted = true;
  runningSince = Date.now();
  timerInterval = window.setInterval(updateTimer, 250);
}

function stopClock() {
  if (runningSince !== null) {
    elapsedMs += Date.now() - runningSince;
    runningSince = null;
  }
  window.clearInterval(timerInterval);
  timerInterval = null;
  updateTimer();
}

function resetClock() {
  stopClock();
  elapsedMs = 0;
  clockStarted = false;
  updateTimer();
}

// Applies a new game state: keeps undo history, runs the clock, and handles the finish.
function commit(nextGame, description, lossMessage = LOSS_MESSAGE) {
  hint = null;
  if (nextGame === game) {
    messageElement.textContent = description;
    return false;
  }
  const flagsBefore = countFlags(game);
  history.push(game);
  game = nextGame;
  if (!clockStarted && game.phase === "playing") startClock();
  if (game.phase === "won") playSound("win");
  else if (game.phase === "lost") playSound("lose");
  else playSound(countFlags(game) === flagsBefore ? "reveal" : "flag");
  timeline.push({ game, at: elapsedMilliseconds() });

  if (isFinished()) {
    finishGame(lossMessage);
  } else {
    messageElement.textContent = description;
  }
  updateToolButtons();
  return true;
}

function statsKey() {
  return session.kind === "daily" ? "daily" : difficulty;
}

// Records the first finish of each unassisted game in stats and best times.
function finishGame(lossMessage) {
  stopClock();
  setFace();
  const seconds = elapsedSeconds();
  const boardValue = threeBV(game);
  const rate = (boardValue / Math.max(1, seconds)).toFixed(2);
  const counts = !session.recorded && !session.assisted;
  if (counts) {
    stats = recordResult(stats, statsKey(), { won: game.phase === "won", seconds, boardValue });
    saveStored(STATS_KEY, stats);
  }

  if (game.phase === "lost") {
    messageElement.textContent = lossMessage;
  } else if (session.assisted) {
    messageElement.textContent = `Cleared in ${formatTime(seconds)} seconds with help. Assisted games don't count toward stats or best times.`;
  } else {
    const newBest = counts && recordBestTime(seconds);
    updateBestTimeDisplay();
    messageElement.textContent = `${newBest ? "A new best time! " : "Beautifully done. "}You cleared the field in ${formatTime(seconds)} seconds · 3BV ${boardValue} · ${rate} 3BV/s.`;
  }
  session.recorded = true;
}

function undoLastMove() {
  stopAgent();
  stopReplay(false);
  hint = null;
  if (history.length === 0) {
    messageElement.textContent = "Nothing to undo yet.";
    return;
  }
  const wasFinished = isFinished();
  if (game.phase === "lost") session.assisted = true;
  game = undo(game, history);
  if (!game.initialized) {
    resetClock();
  } else if (wasFinished && !isFinished()) {
    startClock();
  }
  timeline.push({ game, at: elapsedMilliseconds() });
  setFace();
  updateToolButtons();
  messageElement.textContent = "Undone. The board is back one move.";
  renderBoard(true);
}

// The first reveal places the mines from this game's seed (and no-guess setting).
function revealAt(index) {
  const { row, column } = cellPosition(index);
  if (game.initialized || game.board[index].flagged) return revealCell(game, row, column);

  const result = generateBoard(game, index, createRandom(session.seed), { noGuess: session.noGuess });
  if (result.game !== game) {
    session.start = index;
    session.guaranteed = result.guaranteed;
  }
  return result.game;
}

function firstRevealNote() {
  if (!session.noGuess) return "";
  return session.guaranteed
    ? " No-guess board: every square can be worked out by logic."
    : " No guess-free layout was found for this board, so it may need a guess.";
}

function activateCell(button, requestedMode = mode) {
  const index = Number(button.dataset.index);
  if (!Number.isInteger(index) || replay) return;
  stopAgent();
  activeIndex = index;
  const { row, column } = cellPosition(index);

  if (requestedMode === "flag") {
    const wasFlagged = game.board[index].flagged;
    const next = toggleFlag(game, row, column);
    const changed = next.board[index].flagged !== wasFlagged;
    commit(next, changed
      ? next.board[index].flagged
        ? `Flag placed at row ${row + 1}, column ${column + 1}.`
        : `Flag removed from row ${row + 1}, column ${column + 1}.`
      : game.board[index].revealed
        ? "A revealed square cannot be flagged."
        : "That move is not available.");
  } else {
    const cell = game.board[index];
    const wasReady = !game.initialized;
    const next = revealAt(index);
    const description = cell.revealed
      ? "That square is already revealed."
      : cell.flagged
        ? "That square is flagged. Remove its flag before revealing it."
        : next.phase === "playing"
          ? "Square revealed. Use the numbers to find a safe path."
          : "Square revealed.";
    commit(next, description + (wasReady && next !== game ? firstRevealNote() : ""));
  }

  renderBoard(true);
}

function chordAt(index) {
  const cell = game.board[index];
  if (!cell.revealed || cell.adjacent === 0 || isFinished() || replay) return;
  stopAgent();
  activeIndex = index;
  const { row, column } = cellPosition(index);
  const next = chordCell(game, row, column);
  const flagCount = getAdjacentFlagCount(row, column);
  let message = "Neighbors cleared.";
  if (next === game) {
    if (flagCount < cell.adjacent) {
      message = `Place exactly ${cell.adjacent} flag${cell.adjacent === 1 ? "" : "s"} around this number to clear its neighbors.`;
    } else if (flagCount > cell.adjacent) {
      message = `Remove flags until exactly ${cell.adjacent} remain around this number.`;
    } else {
      message = "There are no covered neighbors left to clear.";
    }
  }
  commit(next, message, "A mine was among the squares cleared. Take a breath and try again.");
  renderBoard(true);
}

function showHint() {
  stopAgent();
  stopReplay();
  if (isFinished()) {
    messageElement.textContent = "This game is over. Start a new one for more hints.";
    return;
  }
  const found = findHint(game);
  if (!found) {
    hint = null;
    messageElement.textContent = "Hint: no square is certain right now. This spot needs a guess.";
    renderBoard();
    return;
  }
  if (found.kind !== "start") session.assisted = true;
  hint = { cells: found.cells, clues: found.clues };
  activeIndex = found.cells[0];
  messageElement.textContent = `Hint: ${explainHint(game, found)}`;
  renderBoard();
}

function toggleNoGuess() {
  settings = { ...settings, noGuess: !settings.noGuess };
  saveStored(SETTINGS_KEY, settings);
  if (!game.initialized) session.noGuess = settings.noGuess;
  updateToolButtons();
  updateBoardSize();
  messageElement.textContent = settings.noGuess
    ? game.initialized
      ? "No-guess is on. Your next board will never need a guess."
      : "No-guess is on. This board will never need a guess."
    : "No-guess is off. Boards are classic random layouts.";
}

function toggleAgent() {
  if (agentRunning) {
    stopAgent();
    messageElement.textContent = "AI stopped. Your move.";
    return;
  }
  stopReplay(false);
  if (isFinished()) restartGame();
  agentRunning = true;
  updateToolButtons();
  agentStep();
}

function stopAgent() {
  window.clearTimeout(agentTimer);
  agentTimer = null;
  if (!agentRunning) return;
  agentRunning = false;
  updateToolButtons();
}

function agentStep() {
  agentTimer = null;
  const move = nextAgentMove(game);
  if (!move) {
    stopAgent();
    return;
  }
  session.assisted = true;
  const { row, column } = cellPosition(move.index);
  const wasReady = !game.initialized;
  const next = move.action === "reveal" ? revealAt(move.index) : toggleFlag(game, row, column);
  activeIndex = move.index;
  commit(
    next,
    `AI: ${move.text}${wasReady ? firstRevealNote() : ""}`,
    "AI: that guess hit a mine. Logic ran out of certain moves.",
  );
  if (!isFinished()) hint = { cells: [move.index], clues: move.clues };
  renderBoard();

  if (isFinished()) {
    stopAgent();
  } else {
    agentTimer = window.setTimeout(agentStep, AGENT_DELAY_MS);
  }
}

function startReplay() {
  if (!isFinished() || timeline.length < 2) return;
  stopAgent();
  replay = { index: 0, playing: false, timer: null };
  replaySlider.max = String(timeline.length - 1);
  playControls.hidden = true;
  replayBar.hidden = false;
  messageElement.textContent = "Replay: mines are shown faintly. Use the controls to step through each move.";
  showReplayFrame();
  playReplay();
  replayPlayButton.focus();
}

function showReplayFrame() {
  const seconds = Math.floor(timeline[replay.index].at / 1000);
  replaySlider.value = String(replay.index);
  replayPosition.textContent = `Move ${replay.index} of ${timeline.length - 1} · ${formatTime(seconds)}s`;
  renderBoard();
}

function setReplayPlaying(playing) {
  replay.playing = playing;
  replayPlayButton.textContent = playing ? "⏸" : "▶";
  replayPlayButton.setAttribute("aria-label", playing ? "Pause" : "Play");
}

// Plays moves with their real timing, sped up and kept between short limits.
function playReplay() {
  if (replay.index >= timeline.length - 1) {
    replay.index = 0;
    showReplayFrame();
  }
  setReplayPlaying(true);
  scheduleReplayStep();
}

function scheduleReplayStep() {
  window.clearTimeout(replay.timer);
  if (replay.index >= timeline.length - 1) {
    setReplayPlaying(false);
    return;
  }
  const gap = timeline[replay.index + 1].at - timeline[replay.index].at;
  const delay = Math.min(1600, Math.max(250, gap)) / Number(replaySpeed.value);
  replay.timer = window.setTimeout(() => {
    replay.index += 1;
    showReplayFrame();
    scheduleReplayStep();
  }, delay);
}

function pauseReplay() {
  window.clearTimeout(replay.timer);
  setReplayPlaying(false);
}

function stepReplay(delta) {
  pauseReplay();
  replay.index = Math.min(timeline.length - 1, Math.max(0, replay.index + delta));
  showReplayFrame();
}

function stopReplay(render = true) {
  if (!replay) return;
  window.clearTimeout(replay.timer);
  replay = null;
  replayBar.hidden = true;
  playControls.hidden = false;
  if (render) {
    messageElement.textContent = "Replay closed. Start a new game when you're ready.";
    renderBoard();
    replayButton.focus();
  }
}

function formatStat(value, kind) {
  if (value === null) return "—";
  if (kind === "time") return `${value}s`;
  if (kind === "rate") return value.toFixed(2);
  if (kind === "percent") return `${value}%`;
  return String(value);
}

function openStats() {
  stopAgent();
  const rows = STATS_ROWS.map(([key, label]) => {
    const summary = summarize(stats[key]);
    const cells = [
      formatStat(summary.played),
      formatStat(summary.played === 0 ? null : summary.winRate, "percent"),
      formatStat(summary.streak),
      formatStat(summary.bestStreak),
      formatStat(summary.bestTime, "time"),
      formatStat(summary.averageTime, "time"),
      formatStat(summary.bestRate, "rate"),
    ];
    const row = document.createElement("tr");
    const heading = document.createElement("th");
    heading.scope = "row";
    heading.textContent = label;
    row.append(heading);
    for (const text of cells) {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.append(cell);
    }
    return row;
  });
  statsBody.replaceChildren(...rows);
  statsDialog.showModal();
}

function resetStats() {
  if (!window.confirm("Reset all stats in this browser? Best times are kept.")) return;
  stats = {};
  saveStored(STATS_KEY, stats);
  openStats();
}

function applySettings() {
  const root = document.documentElement;
  root.toggleAttribute("data-colorblind", settings.colorblind);
  root.toggleAttribute("data-high-contrast", settings.contrast);
  root.toggleAttribute("data-reduce-motion", settings.reduceMotion);
  for (const [key, input] of Object.entries(settingInputs)) input.checked = Boolean(settings[key]);
}

function changeSetting(key, value) {
  settings = { ...settings, [key]: value };
  saveStored(SETTINGS_KEY, settings);
  applySettings();
  if (key === "sound" && value) playSound("flag");
}

const TONES = {
  reveal: [[660, 0.05]],
  flag: [[440, 0.07]],
  win: [[523, 0.12], [659, 0.12], [784, 0.22]],
  lose: [[220, 0.2], [147, 0.32]],
};

// Short synthesized tones; no audio files needed.
function playSound(kind) {
  if (!settings.sound) return;
  try {
    audioContext ??= new AudioContext();
    let start = audioContext.currentTime;
    for (const [frequency, length] of TONES[kind]) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = kind === "lose" ? "sawtooth" : "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.07, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + length + 0.02);
      start += length * 0.9;
    }
  } catch {
    // Audio is optional; ignore browsers that block or lack it.
  }
}

function shareLink() {
  const base = `${window.location.origin}${window.location.pathname}`;
  if (session.kind === "daily") return `${base}?daily=${session.date}`;
  return `${base}?${encodeShare({
    rows: game.rows,
    columns: game.columns,
    mines: game.mineCount,
    seed: session.seed,
    start: session.start,
    noGuess: session.noGuess,
  })}`;
}

// A ten-square bar of how much of the board was cleared, without spoiling it.
function progressBar() {
  const safeCells = game.board.length - game.mineCount;
  const cleared = game.board.filter((cell) => cell.revealed && !cell.mine).length;
  const filled = Math.round((cleared / safeCells) * 10);
  return { bar: "🟩".repeat(filled) + "⬛".repeat(10 - filled), percent: Math.round((cleared / safeCells) * 100) };
}

function shareSummary() {
  const seconds = elapsedSeconds();
  const { bar, percent } = progressBar();
  const help = session.assisted ? " with help" : "";
  const size = `${game.rows}×${game.columns}, ${game.mineCount} mines`;
  const value = game.initialized ? threeBV(game) : 0;
  const rate = (value / Math.max(1, seconds)).toFixed(2);

  if (session.kind === "daily") {
    const lines = [`Minefield daily ${session.date}`];
    if (game.phase === "won") lines.push(`✅ Cleared in ${seconds}s${help} · ${rate} 3BV/s`);
    else if (game.phase === "lost") lines.push(`💥 Hit a mine with ${percent}% cleared`);
    else lines.push("Can you clear today's board?");
    if (isFinished()) lines.push(bar);
    return lines.join("\n");
  }
  if (game.phase === "won") return `I cleared this Minefield board (${size}) in ${seconds}s${help}. Can you beat it?`;
  if (game.phase === "lost") return `This Minefield board (${size}) got me at ${percent}% cleared. Can you finish it?\n${bar}`;
  return `Try this Minefield board: ${size}${session.noGuess ? ", no guessing needed" : ""}.`;
}

function openShare() {
  stopAgent();
  if (session.kind !== "daily" && session.start === null) {
    messageElement.textContent = "Reveal a square first, then share this exact board.";
    return;
  }
  shareTitle.textContent = session.kind === "daily" ? "Share the daily challenge" : "Share this board";
  shareNote.textContent = session.kind === "daily"
    ? "Everyone gets the same daily board. The bar shows how much you cleared without giving it away."
    : "Anyone with this link gets the same board, opened at the same first square.";
  shareTextElement.value = `${shareSummary()}\n${shareLink()}`;
  nativeShareButton.hidden = typeof navigator.share !== "function";
  copyShareButton.textContent = "Copy";
  shareDialog.showModal();
}

async function copyShareText() {
  try {
    await navigator.clipboard.writeText(shareTextElement.value);
    copyShareButton.textContent = "Copied";
  } catch {
    shareTextElement.select();
    copyShareButton.textContent = document.execCommand("copy") ? "Copied" : "Select and copy";
  }
}

async function nativeShare() {
  try {
    await navigator.share({ text: shareTextElement.value });
  } catch {
    // The person closed the share sheet; nothing to do.
  }
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
  if (!Number.isInteger(index) || replay) return;

  if (!game.board[index].revealed) {
    activateCell(button, "flag");
    return;
  }
  chordAt(index);
});

boardElement.addEventListener("keydown", (event) => {
  const button = event.target.closest(".cell");
  if (!button) return;

  const index = Number(button.dataset.index);
  const { row, column } = cellPosition(index);
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
    case "c":
    case "C":
      if (!game.board[index].revealed || game.board[index].adjacent === 0 || isFinished()) return;
      event.preventDefault();
      chordAt(index);
      return;
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

restartButton.addEventListener("click", restartGame);
undoButton.addEventListener("click", undoLastMove);
noGuessButton.addEventListener("click", toggleNoGuess);
hintButton.addEventListener("click", showHint);
agentButton.addEventListener("click", toggleAgent);
dailyButton.addEventListener("click", () => startDaily());
shareButton.addEventListener("click", openShare);
copyShareButton.addEventListener("click", copyShareText);
nativeShareButton.addEventListener("click", nativeShare);
replayButton.addEventListener("click", startReplay);
replayBackButton.addEventListener("click", () => stepReplay(-1));
replayForwardButton.addEventListener("click", () => stepReplay(1));
replayPlayButton.addEventListener("click", () => (replay.playing ? pauseReplay() : playReplay()));
replaySlider.addEventListener("input", () => {
  pauseReplay();
  replay.index = Number(replaySlider.value);
  showReplayFrame();
});
replaySpeed.addEventListener("change", () => {
  if (replay?.playing) scheduleReplayStep();
});
replayExitButton.addEventListener("click", () => stopReplay());
statsButton.addEventListener("click", openStats);
resetStatsButton.addEventListener("click", resetStats);
settingsButton.addEventListener("click", () => {
  stopAgent();
  settingsDialog.showModal();
});
for (const [key, input] of Object.entries(settingInputs)) {
  input.addEventListener("change", () => changeSetting(key, input.checked));
}
applyCustomButton.addEventListener("click", applyCustomBoard);
for (const input of [customRowsElement, customColumnsElement, customMinesElement]) {
  input.addEventListener("change", () => {
    if (difficulty === "custom") applyCustomBoard();
  });
}
boardScroll.addEventListener("focus", () => {
  if (document.activeElement === boardScroll) {
    boardElement.querySelector(`[data-index="${activeIndex}"]`)?.focus();
  }
});

function startFromAddress() {
  const search = window.location.search;
  const shared = decodeShare(search);
  if (shared?.type === "daily") {
    startDaily(shared.date);
  } else if (shared?.type === "shared") {
    const { rows, columns, mines, seed, start, noGuess } = shared;
    startSeededGame({ kind: "shared", config: { rows, columns, mines }, seed, start, noGuess });
  } else {
    startNewGame();
    if (search) messageElement.textContent = "That board link was not valid, so here is a fresh game.";
  }
}

applySettings();
startFromAddress();

if ("serviceWorker" in navigator && window.location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Offline support is optional; the game works without it.
    });
  });
}
