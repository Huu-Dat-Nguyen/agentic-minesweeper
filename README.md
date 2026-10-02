# Minefield

> A modern, dark take on classic Minesweeper. Read the clues, flag the mines, and clear the board.

**[Play online](https://huu-dat-nguyen.github.io/agentic-minesweeper/)** · **[GitHub repository](https://github.com/Huu-Dat-Nguyen/agentic-minesweeper)** · **[GitHub profile](https://github.com/Huu-Dat-Nguyen)**

![Minefield gameplay](./minefield-preview.png)

## Features

- Three classic difficulties: Beginner (9 × 9), Intermediate (16 × 16), Expert (16 × 30).
- Safe first reveal, number clues, automatic empty-area reveal, flags, timer, mine counter, restart, and win/loss states.
- Right-click to flag a covered square or chord a revealed number when adjacent flags match.
- Touch-friendly controls, keyboard navigation, and accessible game announcements.
- Responsive, viewport-filling dark design. Large mobile boards scroll within the board.
- No framework, dependencies, backend, or build step.

## Play locally

Open `index.html` in a modern browser, or serve the folder with Python:

```powershell
py -m http.server 8000
```

Open <http://localhost:8000>.

## Controls

- Choose **Reveal** or **Flag**, then select a square. Your first reveal is safe.
- On desktop, right-click covered squares to flag them; right-click a revealed number to clear neighbors when the adjacent flag count matches.
- With the board focused: arrow keys move, Home/End go to row ends, Ctrl+Home/Ctrl+End go to board ends, and Enter/Space activates a square.

## Tests

Requires Node.js 18 or later. No packages needed:

```powershell
node --test
node --check .\app.mjs
node --check .\game-engine.mjs
```

## Publish with GitHub Pages

1. Push this project to a public GitHub repository named `agentic-minesweeper`.
2. Open **Settings → Pages**.
3. Choose **Deploy from a branch**, select the default branch and `/ (root)`, then save.
4. Wait for deployment, open the Pages URL, and verify the game works.
5. Replace the placeholder links above with your verified profile and live-site URLs.

## About

Personal project by **[Huu Dat Nguyen](https://github.com/Huu-Dat-Nguyen)**. Add a license only after choosing one; no license is currently declared.
