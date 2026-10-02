# Agent Instructions

## Project

Minefield is a no-dependency Minesweeper website built with HTML, CSS, and JavaScript. It is published at https://huu-dat-nguyen.github.io/agentic-minesweeper/ from the public Huu-Dat-Nguyen/agentic-minesweeper repository.

Implemented: Beginner (9 × 9, 10 mines), Intermediate (16 × 16, 40 mines), Expert (16 × 30, 99 mines), safe first reveal, clues, flood reveal, flags, timer, counter, restart, win/loss, touch controls, right-click flagging/chording, keyboard navigation, and a dark viewport-filling layout. Covered and revealed cells have distinct surfaces.

## Guidelines

- Inspect existing code and preserve user changes. Make focused, complete updates.
- Keep game rules independent from the UI and testable. Validate actions and preserve accessibility, keyboard support, touch controls, and responsive behavior.
- Keep the dark viewport-filling design unless asked to change it. Do not force browser fullscreen; contain necessary scrolling within the board.
- Avoid unnecessary dependencies, secrets, unsafe fallbacks, and unrelated refactors.
- Update the README when setup or behavior changes. Append prompts and concise, accurate summaries to the plain-text `log`; never overwrite history or record secrets.
- Before visual changes, save a clearly named baseline screenshot and preserve earlier screenshots.

## Verify

There is no build step or package install. Run:

```powershell
node --test
node --check .\app.mjs
node --check .\game-engine.mjs
```

For UI changes, verify gameplay, outcomes, keyboard/touch controls, and desktop/mobile layouts in a browser. Report checks and limitations accurately.

## Status and next steps

- The 11 game-engine tests and JavaScript syntax checks pass.
- `before-fixes.png` and `before-fullscreen-dark-theme.png` are private historical backups; do not overwrite or publish them. Cropped copies referenced by the README live in `docs/images/`.
- Local `main` tracks `origin/main`; Git is installed. The showcase preview is `minefield-preview.png`.
- `/log` and original historical screenshots are excluded from Git. Only curated README image assets are public.
- GitHub Pages is enabled from `main` / repository root; the public site has been loaded and gameplay/difficulty changes verified in-browser.
- Future work: run a clean-clone smoke test and keep docs, tests, and the published site in sync.
