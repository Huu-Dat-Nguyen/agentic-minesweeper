# Agent Instructions

Minefield is a Minesweeper website in plain HTML, CSS, and JavaScript with no dependencies, backend, or build step. It doubles as a showcase of agentic coding: human prompts set direction, agents implement and verify.

- Live site: https://huu-dat-nguyen.github.io/agentic-minesweeper/
- Repository: https://github.com/Huu-Dat-Nguyen/agentic-minesweeper (public; GitHub Pages deploys `main` from the repository root on every push)

## Files

| Path | Role |
|---|---|
| `core/grid.mjs` | Single home for board geometry: `MAX_ROWS`/`MAX_COLUMNS`, `sizeError`, `rowCol`/`indexAt`, `inBounds`, cached `neighborIndices`, `positionLabel`, `isFinished`. |
| `core/engine.mjs` | Pure game rules on cell indices: `DIFFICULTIES`, `createGame`, `reveal`/`revealEach` (optional `safeArea` first reveal), `toggleFlag`, `chord`, `countFlags`. Games carry `safeLeft`. No DOM. |
| `core/solver.mjs` | Logic solver on visible information only: `deduce`, `findHint`/`explainHint`, `isSolvable`, `generateBoard` (no-guess), `chooseGuess`, `nextAgentMove`. |
| `core/seed.mjs` | Seeded random, daily keys and start squares, `encodeShare`/`encodeDaily`/`decodeShare`. |
| `core/stats.mjs` | `threeBV`, `rate`, `recordResult`, `summarize`, `sanitizeStats`. |
| `core/moves.mjs` | A game is seed + moves: `startGame`, `applyMove` (the one path for play and replay), `toRecord`, `replay`. |
| `modes.mjs` | Strategy objects for normal, daily and shared games (keys, links, labels, share texts, restart) and session factories. |
| `ui/*.mjs` | `board` (repaints changed cells only), `input` (events to intents, one guard spot), `agent`, `replay`, `dialogs` (stats, settings, share), `sound`, `clock`. |
| `data/store.mjs` | `LocalStore`: the only code touching `localStorage` (see the data map below). |
| `app.mjs` | Wiring only: session, one `play()` path for every move, one `interrupt()` facade. |
| `tests/` | `node:test` suites for every module; `sw.test.mjs` keeps the offline file list complete. |
| `tests/golden.test.mjs`, `tests/fixtures/` | v1 outputs (`golden.json`, written by `make-golden.mjs` at `bc67f76`, where the v1 modules it imports exist) that seeded boards, daily boards and share links must keep matching. |
| `index.html`, `css/game.css` | Game markup, dialogs, and the dark, viewport-filling layout (on `css/base.css`). |
| `build.html`, `css/build.css` | Public "How it was built" timeline page. Updated at the end of every v2 step. |
| `css/base.css` | Shared colors, reset, header, focus and reduced motion for every page. |
| `docs/coding-rules.md` | Snapshot of the author's coding rules that v2 follows. |
| `report/` | v2 comparison: `baseline-audit.md`, `*-metrics.json` (from `measure.mjs`), `shots.mjs` (headless screenshots), `pixel-diff.py` (compare screenshot sets), later `rewrite-comparison.md`. |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and app install. Same-origin GETs only; bump `CACHE_NAME` when the list changes (`tests/sw.test.mjs` checks the list). |
| `README.md` | Public write-up: prompt/result table, features, local play, deployment. |
| `minefield-preview.png`, `docs/images/` | Public README and build-page images. |
| `.claude/launch.json` | Local preview server (`py -m http.server 8000`). |
| `log` | Private, gitignored prompt history (restarted at v2; the v1 log was lost). |
| `before-*.png` | Private, gitignored historical screenshots. Never overwrite, delete, or publish. |

## Features

- Beginner (9 × 9, 10 mines), Intermediate (16 × 16, 40), Expert (16 × 30, 99), and Custom (1–24 rows, 1–40 columns, 1 to cells − 1 mines).
- Safe first reveal, clues, flood reveal, flags, restart, win/loss feedback.
- Chording via right-click or the C key on a revealed number when adjacent flags match.
- Undo of any move, including after a win or loss.
- Never-negative mine counter, four-digit timer, per-difficulty best times in `localStorage` (`minefield.bestTimes.v1`).
- Reveal/Flag touch modes, arrow-key navigation, Enter/Space to activate, live-region announcements.
- Tools row: No-guess toggle, Hint, Watch AI, Daily, Share, Replay, Stats, Settings.
- Every game has a seed. The first reveal places mines from it, so a share link (`?r&c&m&seed&start&ng`) or daily link (`?daily=YYYY-MM-DD`) rebuilds the same board and opens its start square.
- Games with hints, the AI, or an undo after a loss are "assisted" and don't count toward stats or best times.
- Stored in `localStorage` (writer -> key -> readers), all through `data/store.mjs` `LocalStore`, which is the only code that touches these keys:
  - `LocalStore.recordGame` (called by `app.mjs` `finishMessage`, first unassisted finish only) -> `minefield.stats.v1` (key per `statsKey`, shape from `core/stats.mjs`) -> `loadStats` (stats dialog in `ui/dialogs.mjs`, `recordGame`). `resetStats` clears it.
  - `LocalStore.recordGame` (wins that beat the stored time) -> `minefield.bestTimes.v1` (whole seconds keyed by mode `bestKey`, daily times as `daily:DATE`; invalid values dropped on load) -> `bestTime` (BEST display in `app.mjs` `showBest`), `recordGame`. Reset stats keeps it.
  - `ui/dialogs.mjs` settings dialog (colorblind, contrast, sound, reduceMotion) and `app.mjs` no-guess toggle -> `minefield.settings.v1` (via `saveSettings`, which merges) -> `loadSettings` (`ui/dialogs.mjs` at start, `app.mjs` at start).

## Engine conventions

- Engine functions are pure: they return a new game object and never mutate their input. Invalid or no-op moves return the same object unchanged; invalid board sizes or random sources throw.
- Game `phase` is `ready`, `playing`, `won`, or `lost`. Mines are placed on the first reveal and never on the revealed cell (its neighbors may still be mines).
- Undo works by `app.mjs` pushing pre-action snapshots onto a history array; `undo(game, history)` pops the last one.
- The solver never reads hidden mines or trusts player flags. Its rules: single clues, overlapping clue pairs, and the total mine count. No-guess boards are only guaranteed solvable by these rules.
- `generateBoard` uses a fixed attempt limit (300, or 40 for boards over 24% mines) so seeded boards come out the same everywhere. Changing the generator or solver changes what old share links produce.
- Add or update tests for every rule, solver, seed, or stats change.

## Guidelines

- Read the existing code first and preserve user changes. Make focused, complete updates; no unrelated refactors.
- Keep rules in the engine and out of the UI. Validate all inputs.
- Preserve accessibility, keyboard support, touch controls, and responsive behavior.
- Keep the dark viewport-filling design unless asked otherwise. Do not force browser fullscreen; large boards scroll inside the game area, not the page.
- No new dependencies, secrets, or unsafe fallbacks.
- Before visual changes, save a new, clearly named baseline screenshot. Never overwrite earlier ones.
- When behavior or setup changes, update `README.md` (features and the prompt/result table) and this file.
- Append each prompt and a concise, accurate summary to `log` as a new numbered entry. Never rewrite past entries or record secrets.
- Keep `/log` and `before-*.png` out of Git. Only curated images go public.

## Verify

```powershell
node --test
node --check .\app.mjs
node --check .\game-engine.mjs
node --check .\solver.mjs
node --check .\sw.js
```

For UI changes, also check gameplay, outcomes, keyboard/touch controls, and desktop/mobile layouts in a browser (serve with `py -m http.server 8000`; modules do not load from `file://`). The service worker serves network-first, but a browser may still hold old files; force-reload when testing. Report what was and was not verified.

## Status (2026-10-26)

- v1 (`bc67f76`) is live on `main`: 30 tests pass; phone layout, sound and the install prompt are not yet checked live.
- v2 work is on branch `feature/v2-rewrite`; plan in the checklist below. Stop after each step, report, and wait for the user's go-ahead.
- Each step ends with: tests and checks passing, a new timeline entry in `build.html`, a `log` entry, and its box ticked here.
- Seeded output must keep matching `tests/fixtures/golden.json`; if it can't, stop and ask.

## v2 checklist (about 1 hour each; database only after the rewrite)

- [x] S0. Baseline: branch, coding-rules snapshot, golden fixtures, baseline metrics and audit, `before-v2-*.png`, new log, build page on `css/base.css` with a v2 section.
- [x] S1. Core grid + engine: `core/grid.mjs` (single home for index math, neighbors, labels, size checks, `isFinished`), `core/engine.mjs`; tests under `tests/`.
- [x] S2. Solver, seed, stats, moves: `core/solver.mjs`, `core/seed.mjs`, `core/stats.mjs`, new `core/moves.mjs` (games as seed + move list); golden must match; time `generateBoard`.
- [x] S3. Modes + board: `modes.mjs` (Strategy for normal/daily/shared), `ui/board.mjs` (update changed cells only), bare `app.mjs` with basic play.
- [x] S4. Input + tools: `ui/input.mjs`, hint, `ui/agent.mjs`, undo, daily, share, one `interrupt()` facade.
- [x] S5. Replay, dialogs, sound: `ui/replay.mjs` on moves, `ui/dialogs.mjs`, `ui/sound.mjs`, `data/store.mjs` `LocalStore` reading the existing keys.
- [x] S6. CSS + offline: `css/game.css` on `base.css`, merge duplicates, update `sw.js`, remove old files.
- [ ] S7. Rewrite check + report: full browser check, `report/rewrite-comparison.md`, build-page v2 table, README and this file.
- [ ] S8. Supabase schema + adapter: `supabase/schema.sql` with RLS, `data/supabase.mjs`, `CloudStore` (fake-fetch tests). User creates the project.
- [ ] S9. Account UI + per-player stats against the real project.
- [ ] S10. Leaderboard + history dialogs, "Accounts and leaderboard" build-page section, final docs and check.

## v1 improvement checklist (done)

All ten v1 ideas were built, checked, and merged in PR #1: no-guess mode, hints, AI autoplayer, daily challenge, shareable boards, replay, stats, offline app, accessibility options, and the build page.
