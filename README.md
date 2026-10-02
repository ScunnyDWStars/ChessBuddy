# ChessBuddy — Game Review

An engine-powered chess game review in the style of chess.com's **Game Review**. Load a game you played and get:

- **Move-by-move coaching**: every move is classified as Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Miss, Blunder or Forced. A coach explains why ("This leaves your bishop on h6 insufficiently protected — gxh6 wins it. Best was Bxb6…").
- **Evaluation bar and advantage graph**: the bar follows the position, and the graph is clickable, with markers on key moments.
- **Summary report**: accuracy for both players, counts per classification, an estimated *game rating*, and how each phase went (opening, middlegame, endgame).
- **Retry**: on any inaccuracy, mistake, miss or blunder, try to find a better move on the board. The engine checks your attempt.
- **Insights / improvement plan**: recurring problems that cost rating points (hanging pieces, missed tactics, king safety, time trouble, converting winning positions, opening habits, endgame technique), each with a concrete way to practise and links to the moves involved.

Everything runs in the browser. Stockfish 19 runs as WebAssembly in a pool of web workers, so no server is needed.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Type-checks and builds a static site into `dist/` (deployable anywhere, including sub-paths) |
| `npm run preview` | Serves the production build |
| `npm test` | Unit tests plus an integration test that runs the real Stockfish WASM build over sample games |
| `npm run typecheck` | TypeScript only |
| `npm run build:openings` | Regenerates `src/data/openings.json` from `scripts/openings-src/*.tsv` |

### Loading games

- **Paste PGN** or **upload a `.pgn` file**. Multi-game files show a picker. `%clk` comments are read for clock data.
- **Import by username** from Chess.com (public API) or Lichess. If your username matches a player, the review is shown from your side.
- **Sample games**: a club blitz game full of instructive errors, Morphy's Opera Game and the Immortal Game.

Use the **⇄ switch** in the panel header to review either player. Keyboard shortcuts: `←` `→` step through moves, `Home`/`End` jump to the start or end, `F` flips the board.

## How the analysis works

1. Every position is evaluated by Stockfish at the chosen depth (Fast 12 / Standard 15 / Deep 18) with MultiPV 2.
2. Scores are converted to **win probability** with lichess' logistic model. Each move's **expected-points loss** is the mover's win probability with the best move minus their win probability after the move played.
3. Classification thresholds follow chess.com's published expected-points scale:

   | Loss | Class |
   | --- | --- |
   | engine's top move | Best |
   | ≤ 0.02 | Excellent |
   | ≤ 0.05 | Good |
   | ≤ 0.10 | Inaccuracy |
   | ≤ 0.20 | Mistake |
   | > 0.20 | Blunder |

   These special cases are checked first:
   - **Book**: the position is in the opening book (≈7.8k positions from the lichess opening list).
   - **Forced**: the move was the only legal move.
   - **Brilliant**: a sound sacrifice. After the move, a piece can be won by static exchange, yet the move is still best or near-best and the position stays good.
   - **Great**: the only good move (the second-best move is at least 0.15 worse), or the move that punishes an opponent's blunder. Recaptures and moves that deliver mate don't count.
   - **Miss**: the opponent gave you a chance (they blundered, or material or mate was available) and the move lets it slip without making your position worse than before their error.
4. **Accuracy** follows the shape of lichess' per-move formula, but with a steeper decay (`ACCURACY_DECAY`), and the game accuracy is the plain average of the move scores. Both were calibrated against Chess.com's own Game Review of a real game (`tests/calibration.test.ts`): ChessBuddy gives 80.5 / 78.0 where Chess.com gives 80.6 / 76.0. The **game rating** is a rough mapping from accuracy, so treat it as an estimate.
5. Explanations come from static exchange evaluation (hanging pieces), material swings along the engine's principal variations, and mate detection.

Finished reviews are cached in `localStorage`, so reopening a recent game is instant.

## Project layout

```
src/
  lib/
    engine/      UCI parsing, engine driver, web-worker pool
    analyze.ts   orchestrates evaluation → classification → feedback → summary
    classify.ts  move classification (pure, unit-tested)
    feedback.ts  coach text
    insights.ts  improvement plan
    scoring.ts   win %, accuracy, rating estimate
    chessUtils.ts static exchange, hanging pieces, phases
    pgn.ts / importers.ts / openings.ts / storage.ts
  components/    Board, EvalBar, EvalGraph, MoveList, Summary / Review / Insights / Load views
public/
  engine/        Stockfish 19 lite single-threaded WASM build
  pieces/        piece set
tests/           vitest suites (including a Node harness for the WASM engine)
```

## Credits and licenses

- [Stockfish.js](https://github.com/nmrugg/stockfish.js) / [Stockfish](https://stockfishchess.org): GPLv3. See `public/engine/COPYING.txt`.
- Piece set "cburnett" by Colin M.L. Burnett: CC BY-SA 3.0 / GPLv2+, via [lichess](https://github.com/lichess-org/lila).
- Opening names from [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings): CC0.
- [chess.js](https://github.com/jhlywa/chess.js): BSD-2-Clause.

ChessBuddy is not affiliated with Chess.com. The interface takes its look from Chess.com's review screen, but all code, icons and artwork here are original or openly licensed.
