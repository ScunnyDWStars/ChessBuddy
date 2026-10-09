# ChessBuddy — Game Review

An engine-powered chess game review in the style of chess.com's **Game Review**. Load a game you played and get:

- **Move-by-move coaching**: every move is classified as Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Miss, Blunder or Forced. A coach explains why ("This leaves your bishop on h6 insufficiently protected — gxh6 wins it. Best was Bxb6…").
- **Evaluation bar and advantage graph**: the bar follows the position, and the graph is clickable, with markers on key moments.
- **Summary report**: accuracy for both players, counts per classification, an estimated *game rating*, and how each phase went (opening, middlegame, endgame).
- **Retry**: on any inaccuracy, mistake, miss or blunder, try to find a better move on the board. The engine checks your attempt.
- **Insights / improvement plan**: recurring problems that cost rating points (hanging pieces, missed tactics, king safety, time trouble, converting winning positions, opening habits, endgame technique), each with a concrete way to practise and links to the moves involved.

- **Progress dashboard**: every game you review is saved in your browser. See your accuracy trend, typical game rating, recurring problems (for example "leaving pieces en prise in 6 of your last 10 games"), accuracy by phase and how you score with each opening.
- **Practice (puzzles from your own mistakes)**: each mistake, miss or blunder you make becomes a puzzle: find the move you missed. Puzzles use spaced repetition: solved ones come back after 1, 3, 7 and 21 days, missed ones come back tomorrow. You can filter by theme (hanging pieces, missed tactics, missed mates, king safety).

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
| `npm run build:extension` | Builds the browser extension into `dist-extension/` (add `-- --zip` for a zip file) |
| `npm run build:openings` | Regenerates `src/data/openings.json` from `scripts/openings-src/*.tsv` |

### Loading games

- **Paste PGN** or **upload a `.pgn` file**. Multi-game files show a picker. `%clk` comments are read for clock data.
- **Import by username** from Chess.com (public API) or Lichess. If your username matches a player, the review is shown from your side.
- **Sample games**: a club blitz game full of instructive errors, Morphy's Opera Game and the Immortal Game.

Enter **your usernames** on the Load page (or in the extension popup) so ChessBuddy knows which side is you. That side is saved to your Progress and Practice; sample games are not. Use the **⇄ switch** in the panel header to review either player. Keyboard shortcuts: `←` `→` step through moves, `Home`/`End` jump to the start or end, `F` flips the board.

## Android phone (installable app)

ChessBuddy is published to **https://scunnydwstars.github.io/ChessBuddy/** by `.github/workflows/pages.yml` on every push. It is an installable web app (PWA):

1. Open the address in **Chrome on Android** and tap **Install** (on the Load page, or Chrome menu ⋮ → **Install app / Add to Home screen**).
2. Open **ChessBuddy** from your home screen. It runs full screen and works offline once installed; the service worker (`scripts/sw-template.js`, generated at build time) caches the app and the engine.
3. On the Load page, enter your **Chess.com** and/or **Lichess** username, then use **Review my latest game** to review your most recent game in one tap.
4. **Share to ChessBuddy:** in the Chess.com or Lichess app, open a finished game, tap **Share** and choose **ChessBuddy**. A shared link is looked up through the public Chess.com API (it can take a minute or two to appear there after the game ends) or the Lichess export API. Shared PGN text is reviewed directly.

The phone keeps its own library of games and puzzles.

**One-time setup for the repository owner:** Settings → Pages → Build and deployment → Source: **GitHub Actions**. Then re-run the "Deploy to GitHub Pages" workflow (Actions tab).

## Browser extension (Chrome, Edge, Brave)

The extension adds a **Review with ChessBuddy** button to Chess.com and Lichess game pages. When a game ends, the button pulses. Clicking it collects the finished game straight from the site and opens the full review in a new tab, so you don't need to download a PGN. In the toolbar popup you can choose what happens when a game ends: **save it automatically** (it is queued, and analysed and added to Progress the next time ChessBuddy is open; the toolbar badge shows how many are waiting) and/or **open the review straight away**.

**Install**
1. Build it with `npm run build:extension -- --zip`, or use a provided `chessbuddy-extension.zip`, and unzip it into a folder.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.
4. Click the ChessBuddy icon in the toolbar and enter your Chess.com and/or Lichess username, so games are reviewed from your side.

**How it collects games**
- **Chess.com:** the game data Chess.com's own board uses (`/callback/{live|daily}/game/{id}`). It is available as soon as the game ends and includes clock times. The move list is decoded with [chess-tcn](https://github.com/chess-tcn/chess-tcn-js). If that fails, the extension falls back to the public API archive (which can lag a few minutes behind), and then to reading the move list on the page.
- **Lichess:** the official export endpoint (`/game/export/{id}`).

Everything runs locally. The game is passed to the review tab through the browser's session storage and is never sent anywhere else.

Source: `extension/` (manifest, content script, background worker, popup) and `src/lib/chesscom.ts` / `src/lib/extensionBridge.ts`.

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

Your games, reviews and puzzles are stored in IndexedDB (`src/lib/db.ts`, `src/lib/library.ts`) in your browser only. The web version and the extension keep separate libraries, because they run on different origins.

## Project layout

```
src/
  lib/
    engine/      UCI parsing, engine driver, web-worker pool
    analyze.ts   orchestrates evaluation → classification → feedback → summary
    classify.ts  move classification (pure, unit-tested)
    feedback.ts  coach text
    insights.ts  improvement plan
    library.ts   saved games, reviews and puzzles (IndexedDB via db.ts)
    progress.ts  dashboard aggregation
    puzzles.ts   puzzles from your mistakes + spaced repetition
    checkMove.ts judges "find the better move" attempts (Retry and Practice)
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
- [chess-tcn](https://github.com/chess-tcn/chess-tcn-js): MIT.

ChessBuddy is not affiliated with Chess.com. The interface takes its look from Chess.com's review screen, but all code, icons and artwork here are original or openly licensed.
