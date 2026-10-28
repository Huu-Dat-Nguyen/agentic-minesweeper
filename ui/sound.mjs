// Short synthesized tones; no audio files needed.
const TONES = {
  reveal: [[660, 0.05]],
  flag: [[440, 0.07]],
  win: [[523, 0.12], [659, 0.12], [784, 0.22]],
  lose: [[220, 0.2], [147, 0.32]],
};

// Which tone a move earns: the result if it ended the game, else by the kind of move.
export function soundFor(type, game) {
  if (game.phase === "won") return "win";
  if (game.phase === "lost") return "lose";
  return type === "flag" ? "flag" : "reveal";
}

// `isOn()` is asked before every tone, so the setting can change at any time.
export function createSound(isOn) {
  let context = null;

  function play(kind) {
    if (!isOn()) return;
    try {
      context ??= new AudioContext();
      let start = context.currentTime;
      for (const [frequency, length] of TONES[kind]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = kind === "lose" ? "sawtooth" : "triangle";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.07, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + length + 0.02);
        start += length * 0.9;
      }
    } catch {
      // Audio is optional; ignore browsers that block or lack it.
    }
  }

  return { play };
}
