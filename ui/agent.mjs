// "Watch AI": plays the solver's next move on a timer. It never touches the game
// itself; every move goes through the play(type, index, options) it is given.
import { isFinished } from "../core/grid.mjs";
import { nextAgentMove } from "../core/solver.mjs";

const DELAY_MS = 550;
const LOSS_MESSAGE = "AI: that guess hit a mine. Logic ran out of certain moves.";

export function createAgent({ button, getGame, play }) {
  const icon = button.querySelector(".tool-icon");
  const text = button.querySelector(".tool-text");
  let running = false;
  let timer = null;

  function show() {
    button.setAttribute("aria-pressed", String(running));
    button.setAttribute("aria-label", running ? "Stop the AI" : "Watch AI play");
    icon.textContent = running ? "■" : "▶";
    text.textContent = running ? "Stop AI" : "Watch AI";
  }

  function stop() {
    window.clearTimeout(timer);
    timer = null;
    if (!running) return;
    running = false;
    show();
  }

  function step() {
    timer = null;
    const move = nextAgentMove(getGame());
    if (!move) {
      stop();
      return;
    }
    play(move.action === "reveal" ? "reveal" : "flag", move.index, {
      message: `AI: ${move.text}`,
      loss: LOSS_MESSAGE,
      hint: { cells: [move.index], clues: move.clues },
      assisted: true,
      focus: false,
    });
    if (isFinished(getGame())) stop();
    else timer = window.setTimeout(step, DELAY_MS);
  }

  function start() {
    running = true;
    show();
    step();
  }

  return { start, stop, isRunning: () => running };
}
