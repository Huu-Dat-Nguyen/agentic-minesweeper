# Agent Instructions

Minefield is a Minesweeper website in plain HTML, CSS, and JavaScript with no dependencies, backend, or build step. It doubles as a showcase of agentic coding: human prompts set direction, agents implement and verify.

- Live site: https://huu-dat-nguyen.github.io/agentic-minesweeper/
- Repository: https://github.com/Huu-Dat-Nguyen/agentic-minesweeper (public; GitHub Pages deploys `main` from the repository root on every push)

## Files

| Path | Role |
|---|---|
| `game-engine.mjs` | Pure game rules: `DIFFICULTIES`, `MAX_ROWS`/`MAX_COLUMNS`, `createGame`, `revealCell` (optional `safeArea` first reveal), `toggleFlag`, `chordCell`, `undo`, `neighborIndices`. No DOM access. |
| `solver.mjs` | Logic solver using only visible information: `deduce`, `findHint`/`explainHint`, `isSolvable`, `generateBoard` (no-guess layouts), `chooseGuess`, `nextAgentMove`. |
| `seed.mjs` | Seeded random (`createRandom`), daily date keys and start squares, share-link `encodeShare`/`decodeShare` with validation. |
| `stats.mjs` | `threeBV`, `recordResult`, `summarize`, `sanitizeStats`. |
| `game-engine.test.mjs`, `features.test.mjs` | `node:test` suites for the engine and for solver, seeds, and stats. |
| `app.mjs` | UI: rendering, input (mouse, touch, keyboard), timer, undo history, tools (hint, AI, daily, share, replay, stats, settings), sound, service-worker registration. |
| `index.html`, `styles.css` | Markup, dialogs, and the dark, viewport-filling responsive layout. |
| `build.html`, `build.css` | Public "How it was built" timeline page. |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and app install. Bump `CACHE_NAME` in `sw.js` when its file list changes. |
| `README.md` | Public write-up: prompt/result table, features, local play, deployment. |
| `minefield-preview.png`, `docs/images/` | Public README and build-page images. |
| `.claude/launch.json` | Local preview server (`py -m http.server 8000`). |
| `log` | Private, gitignored prompt history. |
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
- Stored in `localStorage`: `minefield.bestTimes.v1` (daily times keyed `daily:DATE`), `minefield.stats.v1`, `minefield.settings.v1`.

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

## Status (2026-10-12)

- All 30 tests (16 engine, 14 feature) and the syntax checks pass.
- The ten-idea expansion below was merged to `main` in PR #1 (`61bf362`) and is live. Four existing bugs were fixed along the way: Undo needed two presses, Custom boards threw an error, the custom panel showed on every level, and the timer started at three digits.
- The live site was smoke-tested after deploy: new files served, bug fixes, no-guess, hint, share-link reproduction, daily, Watch AI, replay, stats, settings, service-worker cache, and the build page. Not yet checked live: phone layout, sound, and the install prompt.
- Local `main` matches `origin/main`. The merged branch `feature/ten-idea-expansion` still exists on GitHub and can be deleted.
- Next: keep docs, tests, and the published site in sync; when the solver or generator changes, note that old share links will produce different boards.

## Improvement checklist

All ten items are done, checked in a browser, reviewed, and merged.

- [x] 1. No-guess mode: boards that can be solved by logic alone (`solver.mjs`, seeded by `seed.mjs`).
- [x] 2. Hint button: highlight a square the numbers prove safe (or a mine) and explain why; hinted games don't count toward best times.
- [x] 3. AI autoplayer: watch the solver play step by step with explanations.
- [x] 4. Daily challenge: same seeded no-guess Intermediate board for everyone each day, with a spoiler-free shareable result.
- [x] 5. Shareable boards: seed, size, and first square in the URL so others play the same board.
- [x] 6. Game replay: play or step through a finished game move by move, with mines shown faintly.
- [x] 7. Stats: games played, win rate, streaks, best and average times, and best 3BV/s per mode (`stats.mjs`).
- [x] 8. Offline app (PWA): manifest, icons, and a network-first service worker (`sw.js`); still no dependencies.
- [x] 9. Accessibility options: colorblind-safe numbers, high contrast, synthesized sound, and reduced motion.
- [x] 10. "How it was built" page (`build.html`): prompt-by-prompt timeline with results and commit links.
