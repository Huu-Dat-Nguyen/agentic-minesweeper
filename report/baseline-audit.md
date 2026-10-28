# v1 baseline audit against the coding rules

Code: commit `bc67f76`. Date: 2026-10-26.

The rules are in [docs/coding-rules.md](../docs/coding-rules.md). The numbers are in [baseline-metrics.json](baseline-metrics.json).

The rewrite (v2) is measured against this list. Each item is marked fixed or kept, with a reason, in `rewrite-comparison.md`.

## Rule 1: duplicated logic
- D1. The index ↔ row/column math is written out in about 15 places across app.mjs, solver.mjs and game-engine.mjs.
- D2. The "row X, column Y" label is built in 5 places (solver.mjs ×3, app.mjs ×2).
- D3. Board-size validation is written 3 times (app.mjs, seed.mjs, game-engine.mjs).
- D4. app.mjs rewrites the neighbor loop in `getAdjacentFlagCount`, although `neighborIndices` exists. The tests have a third copy.
- D5. The 3BV/s rate is worked out 3 times (app.mjs ×2, stats.mjs).
- D6. The win/loss check (`phase === "won" || "lost"`) is open-coded 5 times outside `isFinished`.
- D7. The daily URL is built by hand twice, and the share URL is built twice.
- D8. The board config is rebuilt from a game twice.
- D9. The selected-button toggle loop, the "focus the active cell" code and the input guards are each repeated.
- D10. Stats row labels repeat `DIFFICULTIES[].label`.
- D11. styles.css and build.css share their `:root`, reset, header, focus and reduced-motion rules. `--green` drifted between them (`#83c5a1` vs `#88c6a0`).
- D12. Inside styles.css: the face and undo buttons are near-copies, two reduced-motion blocks exist, and hex colors are repeated instead of using variables.

## Rule 2: hidden links and costs
- H1. Three `localStorage` keys (best times, stats, settings) are read and written only in app.mjs. Their writers and readers aren't written down, and settings and best times are loaded without checking.
- H2. Each custom board size shares one best time and one stats row.
- H3. The sw.js cache list leaves out 2 images that the build page uses. `CACHE_NAME` is bumped by hand.
- H4. `isSolvable` copies the board and checks for a win on every safe reveal, inside up to 300 tries of `generateBoard`.
- H5. `deduce` rebuilds all its constraints after every single deduction.
- H6. `nextAgentMove` runs `deduce` twice when it has to guess.
- H7. `renderBoard` rebuilds every cell button on each move, each AI step and each replay frame.
- H8. `commit` counts the flags twice.

## Rule 3: lean code and patterns
- L1. Some exports are never imported: `explainStep`, `emptyEntry`, `isValidSeed`.
- L2. Unused or redundant code:
  - the `attempts` value returned by `generateBoard`
  - the `--paper` CSS variable
  - a redundant phase set in `toggleFlag`
  - `undo()`, which is effectively `history.pop()`
  - `session.guaranteed`, which is never shown
- L3. Strategy trigger: about 10 branches on `session.kind` (normal, daily, shared).
- L4. Facade trigger: the stop-agent + stop-replay + clear-hint sequence appears 4 times.
- L5. app.mjs is 1102 lines with 67 functions. The longest is `renderBoard` at 59 lines.
