// The Leaders dialog: fastest unassisted wins per mode, read from the public top_times call.
import { dateKey } from "../core/seed.mjs";
import { rate } from "../core/stats.mjs";

// Table rows for the entries topTimes returns (best first). `ownName` marks the signed-in player's row.
export function leaderRows(entries, ownName) {
  return entries.map(({ username, seconds, three_bv }, index) => ({
    rank: index + 1,
    player: username,
    seconds,
    rate: rate(three_bv, seconds).toFixed(2),
    own: ownName !== null && username === ownName,
  }));
}

// `api` is the createSupabase adapter. `getName()` is the signed-in username, or null.
// `onOpen()` runs before the dialog opens.
export function createLeaderboard({ api, getName, onOpen }) {
  const dialog = document.querySelector("#leaders-dialog");
  const tabs = [...document.querySelectorAll("[data-leaders]")];
  const wrap = document.querySelector("#leaders-wrap");
  const body = document.querySelector("#leaders-body");
  const status = document.querySelector("#leaders-status");
  let latest = 0; // Only the newest request may draw, so a slow tab cannot overwrite a newer one.

  function cells(row) {
    const rank = Object.assign(document.createElement("th"), { scope: "row", textContent: String(row.rank) });
    const values = [row.player, String(row.seconds), row.rate].map((text) => Object.assign(document.createElement("td"), { textContent: text }));
    const tr = document.createElement("tr");
    tr.classList.toggle("is-own", row.own);
    tr.append(rank, ...values);
    return tr;
  }

  async function show(key) {
    const request = ++latest;
    for (const tab of tabs) tab.setAttribute("aria-pressed", String(tab.dataset.leaders === key));
    wrap.hidden = true;
    status.textContent = "Loading times…";
    try {
      const entries = await api.topTimes(key, key === "daily" ? dateKey() : null);
      if (request !== latest) return;
      status.textContent = entries.length === 0 ? "No times yet. Win an unassisted game to be first." : "";
      body.replaceChildren(...leaderRows(entries, getName()).map(cells));
      wrap.hidden = entries.length === 0;
    } catch (error) {
      if (request !== latest) return;
      status.textContent = `Couldn't load times: ${error.message}`;
    }
  }

  for (const tab of tabs) tab.addEventListener("click", () => show(tab.dataset.leaders));
  document.querySelector("#leaders-button").addEventListener("click", () => {
    onOpen();
    dialog.showModal();
    show("beginner");
  });
}
