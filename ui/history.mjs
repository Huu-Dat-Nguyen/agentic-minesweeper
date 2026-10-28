// "Your games" in the account dialog: the newest saved games, each with a Replay button.
import { DIFFICULTIES } from "../core/engine.mjs";
import { framesFromRecord } from "./replay.mjs";

const SHOWN = 20;

// The record core/moves.mjs replays, from a `games` table row.
export function recordFromRow(row) {
  return {
    config: { rows: row.rows, columns: row.columns, mines: row.mines },
    seed: row.seed,
    noGuess: Boolean(row.no_guess),
    moves: row.moves,
  };
}

export function modeLabel(row) {
  if (row.mode === "daily") return `Daily ${row.date_key}`;
  return DIFFICULTIES[row.mode]?.label ?? "Custom";
}

// Display rows for the newest games (`rows` is newest first, as CloudStore.games returns it).
export function historyRows(rows, limit = SHOWN) {
  return rows.slice(0, limit).map((row) => ({
    when: new Date(row.created_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }),
    mode: modeLabel(row),
    result: (row.won ? "Won" : "Lost") + (row.assisted ? " · with help" : ""),
    time: `${row.seconds}s`,
    row,
  }));
}

// `getGames()` returns the player's saved games, newest first. `onReplay(frames)` plays a saved game;
// the account dialog closes first.
export function createHistory({ getGames, onReplay }) {
  const list = document.querySelector("#history-list");
  const message = document.querySelector("#history-message");
  const dialog = list.closest("dialog");

  function watch(row) {
    let frames;
    try {
      frames = framesFromRecord(recordFromRow(row), row.start !== null && row.start !== undefined);
    } catch {
      message.textContent = "This game can't be replayed.";
      return;
    }
    dialog.close();
    onReplay(frames);
  }

  function item({ when, mode, result, time, row }) {
    const button = Object.assign(document.createElement("button"), { type: "button", className: "tool-button", textContent: "Replay" });
    button.addEventListener("click", () => watch(row));
    const text = Object.assign(document.createElement("span"), { textContent: `${when} · ${mode} · ${result} · ${time}` });
    const li = document.createElement("li");
    li.append(text, button);
    return li;
  }

  return {
    show() {
      const rows = historyRows(getGames());
      message.textContent = rows.length === 0 ? "No saved games yet." : "";
      list.replaceChildren(...rows.map(item));
    },
  };
}
