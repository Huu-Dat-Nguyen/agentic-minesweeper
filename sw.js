// Offline support: serve fresh files when online and fall back to the cache
// when offline. Bump CACHE_NAME when the file list changes.
const CACHE_NAME = "minefield-v4";
// Every file the site needs offline. tests/sw.test.mjs checks this list against the disk.
const APP_FILES = [
  "./",
  "index.html",
  "build.html",
  "css/base.css",
  "css/build.css",
  "css/game.css",
  "app.mjs",
  "modes.mjs",
  "config.mjs",
  "core/engine.mjs",
  "core/grid.mjs",
  "core/moves.mjs",
  "core/seed.mjs",
  "core/solver.mjs",
  "core/stats.mjs",
  "ui/agent.mjs",
  "ui/board.mjs",
  "ui/clock.mjs",
  "ui/dialogs.mjs",
  "ui/input.mjs",
  "ui/replay.mjs",
  "ui/sound.mjs",
  "data/cloud.mjs",
  "data/store.mjs",
  "data/supabase.mjs",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "minefield-preview.png",
  "docs/images/minefield-early-build.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      // Daily and shared links add a query string; offline they still open the game.
      .catch(() => caches.match(request, { ignoreSearch: request.mode === "navigate" })),
  );
});
