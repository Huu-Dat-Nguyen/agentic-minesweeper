# Agent Instructions

## Project

Minefield is a no-dependency Minesweeper website built with HTML, CSS, and JavaScript. It runs locally and is designed for GitHub Pages; it is not yet published.

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
- `before-fixes.png` and `before-fullscreen-dark-theme.png` are historical screenshots; do not overwrite them.
- Git is initialized on `main`; Git and GitHub CLI are installed. The showcase preview is `minefield-preview.png`.
- `/log` and historical screenshots are excluded from Git.
- Next: authenticate GitHub CLI, create and push the public `agentic-minesweeper` repository, enable Pages, verify the live URL, and update README links.
- Do not claim publication until the repository and deployed site are verified.
