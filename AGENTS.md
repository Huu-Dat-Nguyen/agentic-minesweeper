# Agent Instructions

Minefield is a Minesweeper website in plain HTML, CSS, and JavaScript with no dependencies, backend, or build step. It doubles as a showcase of agentic coding: human prompts set direction, agents implement and verify.

- Live site: https://huu-dat-nguyen.github.io/agentic-minesweeper/
- Repository: https://github.com/Huu-Dat-Nguyen/agentic-minesweeper (public; GitHub Pages deploys `main` from the repository root on every push)

## Files

| Path | Role |
|---|---|
| `game-engine.mjs` | Pure game rules: `DIFFICULTIES`, `MAX_ROWS`/`MAX_COLUMNS`, `createGame`, `revealCell`, `toggleFlag`, `chordCell`, `undo`. No DOM access. |
| `game-engine.test.mjs` | `node:test` suite for the engine. |
| `app.mjs` | UI: rendering, input (mouse, touch, keyboard), timer, mine counter, undo history, custom-board form, best times. |
| `index.html`, `styles.css` | Markup and the dark, viewport-filling responsive layout. |
| `README.md` | Public write-up: prompt/result table, features, local play, deployment. |
| `minefield-preview.png`, `docs/images/` | Public README images. |
| `log` | Private, gitignored prompt history. |
| `before-*.png` | Private, gitignored historical screenshots. Never overwrite, delete, or publish. |

## Features

- Beginner (9 × 9, 10 mines), Intermediate (16 × 16, 40), Expert (16 × 30, 99), and Custom (1–24 rows, 1–40 columns, 1 to cells − 1 mines).
- Safe first reveal, clues, flood reveal, flags, restart, win/loss feedback.
- Chording via right-click or the C key on a revealed number when adjacent flags match.
- Undo of any move, including after a win or loss.
- Never-negative mine counter, four-digit timer, per-difficulty best times in `localStorage` (`minefield.bestTimes.v1`).
- Reveal/Flag touch modes, arrow-key navigation, Enter/Space to activate, live-region announcements.

## Engine conventions

- Engine functions are pure: they return a new game object and never mutate their input. Invalid or no-op moves return the same object unchanged; invalid board sizes or random sources throw.
- Game `phase` is `ready`, `playing`, `won`, or `lost`. Mines are placed on the first reveal and never on the revealed cell (its neighbors may still be mines).
- Undo works by `app.mjs` pushing pre-action snapshots onto a history array; `undo(game, history)` pops the last one.
- Add or update engine tests for every rule change.

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
```

For UI changes, also check gameplay, outcomes, keyboard/touch controls, and desktop/mobile layouts in a browser (serve with `py -m http.server 8000`). Report what was and was not verified.

## Status (2026-10-12)

- All 16 engine tests and both syntax checks pass.
- Local `main` matches `origin/main`. The latest commit added custom boards, undo, keyboard chording, and best times.
- Next: run a clean-clone smoke test against the live site; keep docs, tests, and the published site in sync.
