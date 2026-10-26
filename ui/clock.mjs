// The game timer: runs while a game is being played and shows whole seconds.
export function formatTime(seconds) {
  return String(Math.min(seconds, 9999)).padStart(4, "0");
}

export function createClock(element) {
  let elapsed = 0;
  let since = null;
  let timer = null;

  const ms = () => elapsed + (since === null ? 0 : Date.now() - since);
  const seconds = () => Math.floor(ms() / 1000);
  const show = () => {
    element.textContent = formatTime(seconds());
  };

  function stop() {
    if (since !== null) elapsed += Date.now() - since;
    since = null;
    window.clearInterval(timer);
    show();
  }

  function reset() {
    stop();
    elapsed = 0;
    show();
  }

  // Runs while `phase` is "playing", stops at the end, and resets on a fresh board.
  function sync(phase) {
    if (phase === "playing") {
      if (since === null) {
        since = Date.now();
        timer = window.setInterval(show, 250);
      }
    } else if (phase === "ready") {
      reset();
    } else {
      stop();
    }
  }

  return { ms, seconds, sync, reset };
}
