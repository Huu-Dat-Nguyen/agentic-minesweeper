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
| `config.mjs` | Supabase URL and publishable key (public by design; RLS protects the data). Never add a secret or service_role key. |
| `data/supabase.mjs` | `createSupabase`: Adapter over Supabase Auth and REST with plain fetch (sign-up/in/out, token refresh, profile, games, `top_times`). Throws readable errors. |
| `data/cloud.mjs` | `CloudStore`: same interface as `LocalStore`, with stats and best times derived from the player's saved games; failed saves wait in the outbox. Not wired into `app.mjs` until S9. |
| `supabase/schema.sql` | Tables `profiles` and `games`, RLS, profile trigger, `top_times` function. Run once in the Supabase SQL Editor. |
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
- Never-negative mine counter, four-digit timer, per-difficulty best times in `localStorage` (`minefield.bestTimes.v1`); custom boards keep stats but no best time (`core/stats.mjs` `tracksBestTime`, bestKey `null`).
- Reveal/Flag touch modes, arrow-key navigation, Enter/Space to activate, live-region announcements.
- Tools row: No-guess toggle, Hint, Watch AI, Daily, Share, Replay, Stats, Settings.
- Every game has a seed. The first reveal places mines from it, so a share link (`?r&c&m&seed&start&ng`) or daily link (`?daily=YYYY-MM-DD`) rebuilds the same board and opens its start square.
- Games with hints, the AI, or an undo after a loss are "assisted" and don't count toward stats or best times.
- Stored in `localStorage` (writer -> key -> readers), all through `data/store.mjs` `LocalStore`, which is the only code that touches these keys:
  - `LocalStore.recordGame` (called by `app.mjs` `finishMessage`, first unassisted finish only) -> `minefield.stats.v1` (key per `statsKey`, shape from `core/stats.mjs`) -> `loadStats` (stats dialog in `ui/dialogs.mjs`, `recordGame`). `resetStats` clears it.
  - `LocalStore.recordGame` (wins that beat the stored time) -> `minefield.bestTimes.v1` (whole seconds keyed by mode `bestKey`, daily times as `daily:DATE`; invalid values dropped on load) -> `bestTime` (BEST display in `app.mjs` `showBest`), `recordGame`. Reset stats keeps it.
  - `ui/dialogs.mjs` settings dialog (colorblind, contrast, sound, reduceMotion) and `app.mjs` no-guess toggle -> `minefield.settings.v1` (via `saveSettings`, which merges) -> `loadSettings` (`ui/dialogs.mjs` at start, `app.mjs` at start).
  - `LocalStore.saveSession` (`data/supabase.mjs`, on sign-in, token refresh and sign-out) -> `minefield.session.v1` (tokens, `expires_at` seconds, user id/email) -> `createSupabase` at start via `loadSession`.
  - `LocalStore.saveOutbox` (`CloudStore.recordGame` appends; `flush` removes after a successful save) -> `minefield.outbox.v1` (newest 50 game rows not yet saved) -> `CloudStore.flush`/`load`.
- Supabase (writer -> table -> readers): `CloudStore.recordGame`/`flush` -> `games` (one row per first finish, assisted included; RLS: own rows only, insert and select) -> `CloudStore.load` (stats, best times, history via `core/stats.mjs` `statsFromGames`/`bestTimesFromGames`) and the `top_times` function (unassisted wins, one row per player). The sign-up trigger -> `profiles` (username, `stats_reset_at`); `CloudStore.resetStats` sets `stats_reset_at` -> `CloudStore.load` (only later games count for stats; best times use all games).

## Engine conventions

- Engine functions are pure: they return a new game object and never mutate their input. Invalid or no-op moves return the same object unchanged; invalid board sizes or random sources throw.
- Game `phase` is `ready`, `playing`, `won`, or `lost`. Mines are placed on the first reveal and never on the revealed cell (its neighbors may still be mines).
- Every move (including undo) goes through `core/moves.mjs` `applyMove`, which keeps pre-move snapshots in `history` and records the move; replay rebuilds a game from its seed and moves.
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
Get-ChildItem *.mjs, core\*.mjs, ui\*.mjs, data\*.mjs, sw.js | ForEach-Object { node --check $_.FullName }
```

For UI changes, also check gameplay, outcomes, keyboard/touch controls, and desktop/mobile layouts in a browser (serve with `py -m http.server 8000`; modules do not load from `file://`). The service worker serves network-first, but a browser may still hold old files; force-reload when testing. Report what was and was not verified.

## Status (2026-10-26)

- v1 (`bc67f76`) is live on `main`: 30 tests pass; phone layout, sound and the install prompt are not yet checked live.
- v2 rewrite (S0–S7) is done on branch `feature/v2-rewrite`, not merged: 99 tests pass, seeded boards match v1, game screens pixel-identical; results in `report/rewrite-comparison.md`. H2 decided 2026-10-28: custom boards have no best time. Plan in the checklist below. Stop after each step, report, and wait for the user's go-ahead.
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
- [x] S7. Rewrite check + report: full browser check, `report/rewrite-comparison.md`, build-page v2 table, README and this file.
- [x] S8. Supabase schema + adapter: `supabase/schema.sql` with RLS, `data/supabase.mjs`, `CloudStore` (fake-fetch tests). Project `zsulmktqcdervnlbbqah` (publishable key in `config.mjs`); schema run by the user 2026-10-28. Checked live signed out: leaderboard and usernames readable, games unreadable and unsaveable, profiles not editable, trigger function not callable. Signed-in checks need a user-made account (S9).
- [ ] S9. Account UI + per-player stats against the real project.
- [ ] S10. Leaderboard + history dialogs, "Accounts and leaderboard" build-page section, final docs and check.

## v1 improvement checklist (done)

All ten v1 ideas were built, checked, and merged in PR #1: no-guess mode, hints, AI autoplayer, daily challenge, shareable boards, replay, stats, offline app, accessibility options, and the build page.
