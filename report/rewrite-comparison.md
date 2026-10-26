# v1 vs v2: what the rewrite under the coding rules changed

**Question:** what did rewriting Minefield under [the coding rules](../docs/coding-rules.md) improve over v1, measured?

**Answer:**
- **Structure improved:** most duplicated logic was removed, and the 1,102-line page script is now 17 small modules; the largest is 398 lines.
- **Speed:** each move on an Expert board takes 1.3 ms instead of 7.7 ms.
- **Tests:** they went from 30 to 96.
- **Nothing visible changed:** the game looks pixel-identical, and every old link builds the same board.
- **But it is not smaller:** app code grew 14% (1,841 → 2,107 lines), and board generation is no faster.

Compared: v1 = commit `bc67f76` (live site). v2 = branch `feature/v2-rewrite`, measured 2026-10-26.

## Evidence

### Size and tests
Measured with `node report/measure.mjs`. Raw numbers: [baseline-metrics.json](baseline-metrics.json) and [v2-metrics.json](v2-metrics.json).

| | v1 | v2 | Change |
|---|---|---|---|
| App JavaScript lines (excluding tests) | 1,841 | 2,107 | +14% |
| JavaScript files | 6 | 17 | modular |
| Largest JS file | `app.mjs` 1,102 | `app.mjs` 398 | −64% |
| Longest function in the page script | `renderBoard` 59 lines | `finishMessage` 21 lines | −64% |
| CSS lines | 1,561 | 1,538 | −1% |
| Test lines / tests | 551 / 30 | 1,228 / 96 | 3.2× as many tests |
| HTML lines | 392 | 497 | build page grew (new entries) |

Why the app code grew:
- **Module wiring:** 11 new modules each have their own imports and a small factory.
- **Behavior v1 did not have:**
  - games saved as move lists, so they can be replayed
  - validated best times
  - a replay lock on the board
  - an offline file-list check

### Speed
| Measure | v1 | v2 |
|---|---|---|
| DOM work per flag on Expert (480 squares) | 480 new buttons | 1 new text node, 2 squares updated |
| Time per flag on Expert (avg of 10, in-app browser) | 7.7 ms | 1.3 ms |
| No-guess Expert board generation (median of 9) | 17 ms | 19 ms |
| Same, v1 and v2 timed side by side in one process | 27–31 ms | 27–29 ms |

How each row was measured:
- **DOM work and time per flag:** a MutationObserver on the live v1 site and on local v2, using the same share link.
- **Board generation:** the 17 ms vs 19 ms gap is run-to-run noise. The side-by-side timing, with both versions in one process, shows no difference.

### Same behavior as v1
- **Golden fixtures:** 20 seeded boards, 3 daily boards, 8 share links and the random number sequences all match v1 exactly ([fixtures](../tests/fixtures/golden.json), [test](../tests/golden.test.mjs)).
- **Random-game comparison:** v1 and v2 were run side by side on random games:
  - Engine: about 3,000 random games, identical after every move.
  - Solver: 19,340 positions, identical deductions, hints, explanations and AI moves.
- **Pixel diff:** all 10 game screenshots (desktop and phone: board, play, stats, settings, share) are identical to v1 ([pixel-diff.py](pixel-diff.py)).
- **Live comparison:** the daily board for 2026-10-26 opens identically on the live v1 site and on v2.
- **Saved data:** storage keys and formats are unchanged, so players keep their stats and best times.

### The rule audit, item by item
An independent read-only audit checked each v1 finding in [baseline-audit.md](baseline-audit.md) against v2.

| Status | Items |
|---|---|
| Fixed | D2 labels, D3 size check (JS), D5 3BV/s, D6 finished check, D7 URLs, D8 board config, D10 stats labels, H1 storage, H6 double deduce, H7 full redraw, H8 double flag count, L1 unused exports, L2 dead code, L3 kind branches → Strategy, L4 stop sequence → Facade, L5 page script size |
| Fixed during the final check | D1 index math (last copy), D4 neighbor flag count (now `flagsAround`), D9 selected-button loop |
| Partly fixed | D11/D12 CSS: shared base and merged rules, but some literal colors remain, and one green (`#88c6a0`) is kept to stay pixel-identical. H3 offline list: test-guarded, but `CACHE_NAME` is still bumped by hand. H4/H5 solver: fewer copies, but `deduce` still restarts its search after each find. |
| Not fixed | H2: every custom size shares one best time and stats row. Fixing it changes what players see, so it is left for the author to decide. |

### Bugs found and fixed during the rewrite
| Bug | In v1? | Fix |
|---|---|---|
| Watch AI loops forever if the middle square is flagged before the first move | yes | Start hint skips flagged squares (test added) |
| Resetting stats with the dialog open throws an error | yes | Fixed in S5 |
| No-guess first reveal on a flagged square tries 300 boards | v2 only (S2) | Checked before generating |
| Share link kept the old start square after undoing the first reveal | v2 only | `start` cleared on undo (test added) |
| Replay rebuilt the wrong board if No-guess was toggled after an undone reveal | v2 only | Toggle applies to the next board once a reveal is recorded |
| Mine counter and face showed the live game during a replay | v2 only | They follow the frame on screen |

## Limits
- **Line counts:** these come from a simple script, not a parser. Function counts miss some inner functions.
- **Timing:** measured on one laptop; times vary between runs.
- **Single checks:** the per-move DOM timing used one board size (Expert) and one kind of move (flag).
- **Not tested:**
  - real sound output
  - the install prompt
  - a real phone (phone layout was checked by screenshots and an emulated 375 px viewport)
- **Code written by AI workers:** Sonnet coding workers wrote most v2 code and the main model reviewed it. The audit was a separate read-only pass. It is not a human review.

## Next steps
1. Decide H2: give each custom board size its own best time, or keep one shared row.
2. Merge `feature/v2-rewrite` into `main` when ready; pushing deploys the live site. Then add accounts (S8–S10).
