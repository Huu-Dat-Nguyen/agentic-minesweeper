// Takes before/after screenshots with headless Chrome over the DevTools protocol.
// Serve the site first (py -m http.server 8000), then:
//   node report/shots.mjs <prefix>      e.g. before-v2 -> ./before-v2-desktop-play.png
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const prefix = process.argv[2];
if (!prefix) throw new Error("Usage: node report/shots.mjs <prefix>");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SITE = "http://localhost:8000/";
const PORT = 9333;

const VIEWPORTS = { desktop: [1440, 900, false], mobile: [390, 844, true] };
// Each scene: page path and a script run before the capture.
const SCENES = {
  ready: ["", ""],
  play: ["?r=9&c=9&m=10&seed=abc123&start=40", ""],
  stats: ["", "document.querySelector('#stats-button').click()"],
  settings: ["", "document.querySelector('#settings-button').click()"],
  share: ["?r=9&c=9&m=10&seed=abc123&start=40", "document.querySelector('#share-button').click()"],
  build: ["build.html", ""],
};

await fetch(SITE).catch(() => {
  throw new Error(`Nothing is served at ${SITE}; start py -m http.server 8000 first.`);
});

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, "--no-first-run",
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "shots-"))}`, "about:blank",
]);
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

let target;
for (let tries = 0; !target && tries < 40; tries += 1) {
  await wait(250);
  target = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json()).then((list) => list.find((t) => t.type === "page")).catch(() => null);
}
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((done) => socket.addEventListener("open", done));
let nextId = 0;
const pending = new Map();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  pending.get(message.id)?.(message.result);
});
const send = (method, params = {}) => new Promise((done) => {
  nextId += 1;
  pending.set(nextId, done);
  socket.send(JSON.stringify({ id: nextId, method, params }));
});

for (const [view, [width, height, mobile]] of Object.entries(VIEWPORTS)) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  for (const [scene, [path, script]] of Object.entries(SCENES)) {
    await send("Page.navigate", { url: SITE + path });
    await wait(1200);
    if (script) await send("Runtime.evaluate", { expression: script });
    await wait(400);
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    const file = `${prefix}-${view}-${scene}.png`;
    writeFileSync(file, Buffer.from(data, "base64"));
    console.log(file);
  }
}
socket.close();
chrome.kill();
