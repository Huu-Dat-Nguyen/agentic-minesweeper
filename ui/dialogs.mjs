// The stats, settings and share dialogs.
import { DIFFICULTIES } from "../core/engine.mjs";
import { summarize } from "../core/stats.mjs";

const STATS_ROWS = [
  ...Object.entries(DIFFICULTIES).map(([key, { label }]) => [key, label]),
  ["custom", "Custom"],
  ["daily", "Daily"],
];

// kind: "time" | "rate" | "percent" | undefined for a plain count. null means no data yet.
export function formatStat(value, kind) {
  if (value === null) return "—";
  if (kind === "time") return `${value}s`;
  if (kind === "rate") return value.toFixed(2);
  if (kind === "percent") return `${value}%`;
  return String(value);
}

// One { label, cells } per stats row; `stats` is the stored stats object.
export function statsRows(stats) {
  return STATS_ROWS.map(([key, label]) => {
    const summary = summarize(stats[key]);
    return {
      label,
      cells: [
        formatStat(summary.played),
        formatStat(summary.played === 0 ? null : summary.winRate, "percent"),
        formatStat(summary.streak),
        formatStat(summary.bestStreak),
        formatStat(summary.bestTime, "time"),
        formatStat(summary.averageTime, "time"),
        formatStat(summary.bestRate, "rate"),
      ],
    };
  });
}

const SETTING_INPUTS = {
  colorblind: "#setting-colorblind",
  contrast: "#setting-contrast",
  sound: "#setting-sound",
  reduceMotion: "#setting-motion",
};

function createStatsDialog(store, onOpen) {
  const dialog = document.querySelector("#stats-dialog");
  const body = document.querySelector("#stats-body");

  function open() {
    onOpen();
    const rows = statsRows(store.loadStats()).map(({ label, cells }) => {
      const row = document.createElement("tr");
      const heading = document.createElement("th");
      heading.scope = "row";
      heading.textContent = label;
      row.append(heading, ...cells.map((text) => Object.assign(document.createElement("td"), { textContent: text })));
      return row;
    });
    body.replaceChildren(...rows);
    if (!dialog.open) dialog.showModal();
  }

  document.querySelector("#stats-button").addEventListener("click", open);
  document.querySelector("#reset-stats").addEventListener("click", () => {
    if (!window.confirm("Reset all stats in this browser? Best times are kept.")) return;
    store.resetStats();
    open();
  });
}

// Applies the stored settings now and on every change. `onChange(key, value)` hears each change.
function createSettings(store, onOpen, onChange) {
  const dialog = document.querySelector("#settings-dialog");
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  let settings = { colorblind: false, contrast: false, sound: false, reduceMotion, ...store.loadSettings() };

  function apply() {
    const root = document.documentElement;
    root.toggleAttribute("data-colorblind", settings.colorblind);
    root.toggleAttribute("data-high-contrast", settings.contrast);
    root.toggleAttribute("data-reduce-motion", settings.reduceMotion);
    for (const [key, selector] of Object.entries(SETTING_INPUTS)) document.querySelector(selector).checked = Boolean(settings[key]);
  }

  for (const [key, selector] of Object.entries(SETTING_INPUTS)) {
    document.querySelector(selector).addEventListener("change", (event) => {
      settings = { ...settings, [key]: event.target.checked };
      store.saveSettings({ [key]: settings[key] });
      apply();
      onChange(key, settings[key]);
    });
  }
  document.querySelector("#settings-button").addEventListener("click", () => {
    onOpen();
    dialog.showModal();
  });
  apply();
  return (key) => settings[key];
}

function createShareDialog() {
  const dialog = document.querySelector("#share-dialog");
  const title = document.querySelector("#share-title");
  const note = document.querySelector("#share-note");
  const textArea = document.querySelector("#share-text");
  const copyButton = document.querySelector("#copy-share");
  const nativeButton = document.querySelector("#native-share");

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(textArea.value);
      copyButton.textContent = "Copied";
    } catch {
      textArea.select();
      copyButton.textContent = document.execCommand("copy") ? "Copied" : "Select and copy";
    }
  });

  nativeButton.addEventListener("click", async () => {
    try {
      await navigator.share({ text: textArea.value });
    } catch {
      // The person closed the share sheet; nothing to do.
    }
  });

  return (heading, description, text) => {
    title.textContent = heading;
    note.textContent = description;
    textArea.value = text;
    nativeButton.hidden = typeof navigator.share !== "function";
    copyButton.textContent = "Copy";
    dialog.showModal();
  };
}

// onOpen() runs before the stats or settings dialog opens (the app stops the AI);
// onSetting(key, value) hears each settings change.
// Returns setting(key) for the current value and openShare(heading, note, text).
export function createDialogs({ store, onOpen, onSetting }) {
  createStatsDialog(store, onOpen);
  return {
    setting: createSettings(store, onOpen, onSetting),
    openShare: createShareDialog(),
  };
}
