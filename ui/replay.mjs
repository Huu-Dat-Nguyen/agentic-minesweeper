// Replays a finished game from its move list (core/moves.mjs); it keeps no timeline of its own.
import { isFinished } from "../core/grid.mjs";
import { replay as framesOf, toRecord } from "../core/moves.mjs";
import { formatTime } from "./clock.mjs";

const MIN_GAP_MS = 250;
const MAX_GAP_MS = 1600;

// A seeded (daily or shared) game starts with its first square already open, so
// its replay begins at that board instead of the empty one.
export function replayFrames(state, seeded) {
  const frames = framesOf(toRecord(state));
  return seeded ? frames.slice(1) : frames;
}

// Only a finished game with at least one move to watch.
export function canReplay(state, seeded) {
  return isFinished(state.game) && state.moves.length > (seeded ? 1 : 0);
}

// getState() and isSeeded() describe the game; say(text) shows a message;
// onChange() asks the app to redraw (it reads game() and isActive()).
export function createReplay({ button, getState, isSeeded, say, onChange }) {
  const controls = document.querySelector(".play-controls");
  const bar = document.querySelector("#replay-bar");
  const backButton = document.querySelector("#replay-back");
  const playButton = document.querySelector("#replay-play");
  const forwardButton = document.querySelector("#replay-forward");
  const slider = document.querySelector("#replay-slider");
  const position = document.querySelector("#replay-position");
  const speed = document.querySelector("#replay-speed");
  const exitButton = document.querySelector("#replay-exit");
  let run = null; // { frames, index, playing, timer } while a replay is open

  const lastIndex = () => run.frames.length - 1;

  function showFrame() {
    const seconds = Math.floor(run.frames[run.index].at / 1000);
    slider.value = String(run.index);
    position.textContent = `Move ${run.index} of ${lastIndex()} · ${formatTime(seconds)}s`;
    onChange();
  }

  function setPlaying(playing) {
    run.playing = playing;
    playButton.textContent = playing ? "⏸" : "▶";
    playButton.setAttribute("aria-label", playing ? "Pause" : "Play");
  }

  // Plays moves with their real timing, sped up and kept between short limits.
  function schedule() {
    window.clearTimeout(run.timer);
    if (run.index >= lastIndex()) {
      setPlaying(false);
      return;
    }
    const gap = run.frames[run.index + 1].at - run.frames[run.index].at;
    run.timer = window.setTimeout(() => {
      run.index += 1;
      showFrame();
      schedule();
    }, Math.min(MAX_GAP_MS, Math.max(MIN_GAP_MS, gap)) / Number(speed.value));
  }

  function play() {
    if (run.index >= lastIndex()) {
      run.index = 0;
      showFrame();
    }
    setPlaying(true);
    schedule();
  }

  function pause() {
    window.clearTimeout(run.timer);
    setPlaying(false);
  }

  function step(delta) {
    pause();
    run.index = Math.min(lastIndex(), Math.max(0, run.index + delta));
    showFrame();
  }

  function start() {
    const state = getState();
    if (!canReplay(state, isSeeded())) return;
    run = { frames: replayFrames(state, isSeeded()), index: 0, playing: false, timer: null };
    slider.max = String(lastIndex());
    controls.hidden = true;
    bar.hidden = false;
    say("Replay: mines are shown faintly. Use the controls to step through each move.");
    showFrame();
    play();
    playButton.focus();
  }

  // `announce` is for the player closing it; anything else that interrupts leaves the redraw and message to the caller.
  function stop(announce = false) {
    if (!run) return;
    window.clearTimeout(run.timer);
    run = null;
    bar.hidden = true;
    controls.hidden = false;
    if (!announce) return;
    say("Replay closed. Start a new game when you're ready.");
    onChange();
    button.focus();
  }

  button.addEventListener("click", start);
  backButton.addEventListener("click", () => step(-1));
  forwardButton.addEventListener("click", () => step(1));
  playButton.addEventListener("click", () => (run.playing ? pause() : play()));
  slider.addEventListener("input", () => {
    pause();
    run.index = Number(slider.value);
    showFrame();
  });
  speed.addEventListener("change", () => {
    if (run?.playing) schedule();
  });
  exitButton.addEventListener("click", () => stop(true));

  return {
    stop,
    isActive: () => run !== null,
    game: () => run?.frames[run.index].game ?? null,
    // Enables the button only when there is something to watch.
    sync: () => {
      button.disabled = !canReplay(getState(), isSeeded());
    },
  };
}
