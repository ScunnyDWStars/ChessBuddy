import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import type { Color, GameReview, ParsedGame, Score } from './lib/types';
import { baseTimeSeconds, parsePgn } from './lib/pgn';
import { analyzeGame } from './lib/analyze';
import { getBrowserEngine } from './lib/engine/engine';
import { loadOpeningBook } from './lib/openings';
import { listRecent, loadReview, reviewKey, saveReview, type RecentReview } from './lib/storage';
import { other, parseUci } from './lib/chessUtils';
import { winProbFor } from './lib/scoring';
import { Board, type Arrow } from './components/Board';
import { EvalBar } from './components/EvalBar';
import { PlayerStrip, CoachAvatar } from './components/common';
import { SummaryView } from './components/SummaryView';
import { MoveReviewView, RETRYABLE, type RetryState } from './components/MoveReviewView';
import { InsightsView } from './components/InsightsView';
import { LoadView } from './components/LoadView';
import { MoveList } from './components/MoveList';
import { takeExtensionImport } from './lib/extensionBridge';

type Tab = 'review' | 'insights' | 'load';

const BEST_ARROW = 'rgba(129, 182, 76, 0.95)';

interface RetryBoard {
  fen: string;
  lastMove?: { from: string; to: string };
  selected: string | null;
}

export default function App() {
  const [game, setGame] = useState<ParsedGame | null>(null);
  const [review, setReview] = useState<GameReview | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ply, setPly] = useState(0);
  const [perspective, setPerspective] = useState<Color>('w');
  const [flipped, setFlipped] = useState(false);
  const [tab, setTabState] = useState<Tab>('load');
  const [started, setStarted] = useState(false);
  const [showBest, setShowBest] = useState(false);
  const [retry, setRetry] = useState<RetryState | null>(null);
  const [retryBoard, setRetryBoard] = useState<RetryBoard | null>(null);
  const [depth, setDepth] = useState(15);
  const [recent, setRecent] = useState<RecentReview[]>(() => listRecent());
  const runId = useRef(0);

  const setTab = (t: Tab) => {
    setTabState(t);
    setRetry(null);
    setRetryBoard(null);
  };

  const orientation: Color = flipped ? other(perspective) : perspective;

  const selectPly = useCallback(
    (p: number) => {
      if (!game) return;
      setPly(Math.max(0, Math.min(game.moves.length, p)));
      setShowBest(false);
      setRetry(null);
      setRetryBoard(null);
    },
    [game],
  );

  const runAnalysis = useCallback(async (g: ParsedGame, d: number) => {
    const id = ++runId.current;
    setReview(null);
    setError(null);
    setProgress({ done: 0, total: g.moves.length + 1 });
    try {
      const [book, engine] = [await loadOpeningBook(), getBrowserEngine()];
      const result = await analyzeGame(g, engine, {
        depth: d,
        book,
        onProgress: (done, total) => id === runId.current && setProgress({ done, total }),
      });
      if (id !== runId.current) return;
      setReview(result);
      setProgress(null);
      setRecent(saveReview(result));
    } catch (e) {
      if (id !== runId.current) return;
      console.error(e);
      setProgress(null);
      setError(`Analysis failed: ${(e as Error).message}. Your browser may not support WebAssembly workers.`);
    }
  }, []);

  const loadGame = useCallback(
    (pgn: string, username?: string | string[], perspectiveHint?: Color) => {
      let parsed: ParsedGame;
      try {
        parsed = parsePgn(pgn);
      } catch (e) {
        setError((e as Error).message);
        return;
      }
      // Review from the side of whichever player matches a known username,
      // else from the side the board was oriented to on the source site.
      const users = (Array.isArray(username) ? username : username ? [username] : []).map((u) => u.trim().toLowerCase());
      const side: Color = users.includes(parsed.headers.black.toLowerCase())
        ? 'b'
        : users.includes(parsed.headers.white.toLowerCase())
          ? 'w'
          : (perspectiveHint ?? 'w');
      setGame(parsed);
      setPerspective(side);
      setFlipped(false);
      setPly(0);
      setStarted(false);
      setShowBest(false);
      setRetry(null);
      setRetryBoard(null);
      setTab('review');
      setError(null);
      const cached = loadReview(reviewKey(parsed.pgn, depth));
      if (cached) {
        runId.current++;
        setProgress(null);
        setReview(cached);
      } else {
        void runAnalysis(parsed, depth);
      }
    },
    [depth, runAnalysis],
  );

  // A game sent from Chess.com / Lichess by the browser extension.
  useEffect(() => {
    const pickUp = () => {
      takeExtensionImport()
        .then((incoming) => incoming && loadGame(incoming.pgn, incoming.usernames, incoming.perspective))
        .catch((e: Error) => {
          setError(`Couldn't open the game from the extension: ${e.message}`);
          setTab('load');
        });
    };
    pickUp();
    window.addEventListener('hashchange', pickUp);
    return () => window.removeEventListener('hashchange', pickUp);
  }, []);

  const openRecent = (r: RecentReview) => {
    const cached = loadReview(r.key);
    if (!cached) {
      setError('That review is no longer cached. Load the game again to re-analyze it.');
      return;
    }
    runId.current++;
    setGame(cached.game);
    setReview(cached);
    setProgress(null);
    setPerspective('w');
    setFlipped(false);
    setPly(0);
    setStarted(false);
    setTab('review');
  };

  // Keyboard navigation like chess.com: ← → Home End, F to flip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || !game) return;
      if (e.key === 'ArrowRight') selectPly(ply + 1);
      else if (e.key === 'ArrowLeft') selectPly(ply - 1);
      else if (e.key === 'Home') selectPly(0);
      else if (e.key === 'End') selectPly(game.moves.length);
      else if (e.key === 'f' || e.key === 'F') setFlipped((f) => !f);
      else return;
      e.preventDefault();
      if (review && !started && tab === 'review' && e.key.startsWith('Arrow')) setStarted(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, ply, review, started, tab, selectPly]);

  const current = ply > 0 && review ? review.moves[ply - 1] : null;
  const plyInfo = ply > 0 && game ? game.moves[ply - 1] : null;

  // ----- Retry ("find a better move") -----
  const startRetry = () => {
    if (!current) return;
    setRetry({ ply: current.ply, status: 'waiting' });
    setRetryBoard({ fen: current.fenBefore, selected: null });
    setShowBest(false);
  };

  const showSolution = () => {
    if (!current?.bestMove) return;
    const chess = new Chess(current.fenBefore);
    const m = chess.move(parseUci(current.bestMove.uci));
    setRetryBoard({ fen: chess.fen(), lastMove: { from: m.from, to: m.to }, selected: null });
    setRetry({
      ply: current.ply,
      status: 'solved',
      message: `The best move was **${m.san}**. The idea: ${current.bestLine.slice(0, 6).join(' ')}.`,
    });
  };

  const attempt = async (from: string, to: string) => {
    if (!current || !retry) return;
    const chess = new Chess(current.fenBefore);
    let move;
    try {
      move = chess.move({ from, to, promotion: 'q' });
    } catch {
      return;
    }
    const uci = move.lan;
    setRetryBoard({ fen: chess.fen(), lastMove: { from, to }, selected: null });
    if (uci === current.uci) {
      setRetry({ ply: retry.ply, status: 'wrong', message: `That's the move you played in the game (**${move.san}**). Look for something better.` });
      return;
    }
    if (uci === current.bestMove?.uci) {
      setRetry({ ply: retry.ply, status: 'correct', message: `**${move.san}** is the best move! ${current.bestLine.length > 1 ? `The point: ${current.bestLine.slice(0, 6).join(' ')}.` : ''}` });
      return;
    }
    setRetry({ ply: retry.ply, status: 'checking' });
    try {
      let score: Score;
      if (chess.isCheckmate()) score = { cp: move.color === 'w' ? 100000 : -100000, mate: 0 };
      else if (chess.isDraw()) score = { cp: 0 };
      else {
        const lines = await getBrowserEngine().analyze(chess.fen(), { depth: Math.min(review!.depth, 14), multipv: 1 });
        score = lines[0]?.score ?? { cp: 0 };
      }
      const loss = current.winBefore - winProbFor(score, current.color);
      const best = current.bestMove ? `**${current.bestMove.san}**` : 'the engine move';
      if (loss <= 0.03) {
        setRetry({ ply: retry.ply, status: 'correct', message: `**${move.san}** works just as well as ${best}. Well found!` });
      } else if (loss < current.loss * 0.5 && loss <= 0.08) {
        setRetry({ ply: retry.ply, status: 'close', message: `**${move.san}** is a clear improvement, but ${best} is even stronger. Try again or show the solution.` });
      } else {
        setRetry({ ply: retry.ply, status: 'wrong', message: `**${move.san}** isn't it. Think about checks, captures and threats — then try again.` });
      }
    } catch {
      setRetry({ ply: retry.ply, status: 'wrong', message: 'Could not check that move. Try again.' });
    }
  };

  const retryInteractive = retry && retryBoard && (retry.status === 'waiting' || retry.status === 'wrong' || retry.status === 'close');
  const retryTargets = useMemo(() => {
    if (!retryBoard?.selected || !current) return [];
    return new Chess(current.fenBefore).moves({ square: retryBoard.selected as Square, verbose: true }).map((m) => m.to);
  }, [retryBoard?.selected, current]);

  const onSquareClick = (sq: string) => {
    if (!retryInteractive || !current || !retryBoard) return;
    const chess = new Chess(current.fenBefore);
    if (retryBoard.selected && retryTargets.includes(sq as Square)) {
      void attempt(retryBoard.selected, sq);
      return;
    }
    const piece = chess.get(sq as Square);
    if (piece && piece.color === current.color) setRetryBoard({ fen: current.fenBefore, selected: sq });
    else setRetryBoard({ fen: current.fenBefore, selected: null });
  };

  // ----- What the board shows -----
  let boardFen = game ? (plyInfo ? plyInfo.fenAfter : game.startFen) : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  let lastMove = plyInfo ? { from: plyInfo.from, to: plyInfo.to } : undefined;
  let classification = current?.classification;
  let animateKey: string | undefined = plyInfo ? `p${ply}` : undefined;
  const arrows: Arrow[] = [];
  let evalScore: Score | null = review ? (current ? current.evalAfter : review.initialEval) : null;

  if (retry && retryBoard) {
    boardFen = retryBoard.fen;
    lastMove = retryBoard.lastMove;
    classification =
      retry.status === 'correct' || retry.status === 'solved' ? 'best' : retry.status === 'close' ? 'good' : retry.status === 'wrong' && lastMove ? 'mistake' : undefined;
    animateKey = lastMove ? `r${retryBoard.fen}` : undefined;
    evalScore = current?.evalBefore ?? null;
  } else if (showBest && current?.bestMove) {
    const chess = new Chess(current.fenBefore);
    const m = chess.move(parseUci(current.bestMove.uci));
    boardFen = chess.fen();
    lastMove = { from: m.from, to: m.to };
    classification = 'best';
    animateKey = `b${ply}`;
    evalScore = current.evalBefore;
  } else if (current?.bestMove && current.bestMove.uci !== current.uci && current.classification !== 'book') {
    const { from, to } = parseUci(current.bestMove.uci);
    if (RETRYABLE.has(current.classification) || current.classification === 'good' || current.classification === 'excellent') {
      arrows.push({ from, to, color: BEST_ARROW });
    }
  }

  const headers = game?.headers;
  const top: Color = orientation === 'w' ? 'b' : 'w';
  const bottom: Color = orientation;
  const clockFor = (c: Color): number | undefined => {
    if (!game) return undefined;
    const moves = game.moves.slice(0, ply).filter((m) => m.color === c && m.clock !== undefined);
    if (moves.length) return moves[moves.length - 1].clock;
    // Before a side's first move, show the starting clock if the game has clock data.
    const hasClocks = game.moves.some((m) => m.clock !== undefined);
    return hasClocks ? baseTimeSeconds(game.headers.timeControl) : undefined;
  };
  const toMove: Color = boardFen.split(' ')[1] === 'b' ? 'b' : 'w';
  const strip = (c: Color) => (
    <PlayerStrip
      name={headers ? (c === 'w' ? headers.white : headers.black) : c === 'w' ? 'White' : 'Black'}
      rating={headers ? (c === 'w' ? headers.whiteElo : headers.blackElo) : undefined}
      color={c}
      fen={boardFen}
      clock={clockFor(c)}
      active={toMove === c}
    />
  );

  const panelTitle = tab === 'insights' ? 'Insights' : tab === 'load' ? 'Load Game' : 'Game Review';

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <img src={`${import.meta.env.BASE_URL}pieces/wN.svg`} alt="" />
          <span>
            Chess<b>Buddy</b>
          </span>
        </div>
        <nav>
          <button className={tab === 'review' ? 'active' : ''} onClick={() => game && setTab('review')} disabled={!game}>
            <SideIcon d="M12 2l3 6.5 7 .9-5.1 4.8 1.3 7L12 17.8 5.8 21.2l1.3-7L2 9.4l7-.9z" /> Review
          </button>
          <button className={tab === 'insights' ? 'active' : ''} onClick={() => review && setTab('insights')} disabled={!review}>
            <SideIcon d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke /> Insights
          </button>
          <button className={tab === 'load' ? 'active' : ''} onClick={() => setTab('load')}>
            <SideIcon d="M12 4v12M6 10l6 6 6-6M4 20h16" stroke /> Load Game
          </button>
        </nav>
        <div className="sidebar-foot">
          <button onClick={() => setFlipped((f) => !f)} title="Flip board (F)">
            <SideIcon d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" stroke /> Flip
          </button>
        </div>
      </aside>

      <main className="board-area">
        <div className="board-column">
          {strip(top)}
          <div className="board-row">
            <EvalBar score={evalScore} orientation={orientation} />
            <Board
              fen={boardFen}
              orientation={orientation}
              lastMove={lastMove}
              classification={review || retry ? classification : undefined}
              arrows={arrows}
              animateKey={animateKey}
              selected={retryBoard?.selected}
              targets={retryInteractive ? retryTargets : []}
              onSquareClick={retryInteractive ? onSquareClick : undefined}
            />
          </div>
          {strip(bottom)}
        </div>
      </main>

      <section className="panel">
        <header className="panel-header">
          <span className="panel-title">
            <SideIcon d="M12 2l3 6.5 7 .9-5.1 4.8 1.3 7L12 17.8 5.8 21.2l1.3-7L2 9.4l7-.9z" /> {panelTitle}
          </span>
          {tab === 'review' && review && started && (
            <button className="summary-link" onClick={() => setStarted(false)} title="Back to the game summary">
              ‹ Summary
            </button>
          )}
          {game && tab !== 'load' && (
            <button
              className="side-switch"
              onClick={() => {
                setPerspective(other(perspective));
                setFlipped(false);
              }}
              title="Switch which player you are reviewing"
            >
              <span className={`side-dot ${perspective}`} />
              <span className="side-name">{perspective === 'w' ? headers?.white : headers?.black}</span>
              <span className="swap">⇄</span>
            </button>
          )}
        </header>

        {tab === 'load' && (
          <LoadView depth={depth} onDepth={setDepth} onLoad={loadGame} recent={recent} onOpenRecent={openRecent} error={error} />
        )}

        {tab === 'insights' && review && <InsightsView review={review} perspective={perspective} onJump={(p) => {
          setStarted(true);
          setTab('review');
          selectPly(p);
        }} />}

        {tab === 'review' && game && !review && (
          <div className="analyzing">
            <div className="coach-row">
              <CoachAvatar size={56} />
              <div className="bubble">
                {error ? (
                  error
                ) : (
                  <>
                    Analyzing <strong>{game.headers.white}</strong> vs <strong>{game.headers.black}</strong> with Stockfish… You can browse the moves
                    while I work.
                  </>
                )}
              </div>
            </div>
            {progress && (
              <div className="progress">
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
                <span>
                  {Math.round((progress.done / progress.total) * 100)}% · position {progress.done} of {progress.total}
                </span>
              </div>
            )}
            {error && (
              <button className="btn-secondary" onClick={() => runAnalysis(game, depth)}>
                Try again
              </button>
            )}
            <MoveList moves={game.moves} ply={ply} onSelect={selectPly} />
          </div>
        )}

        {tab === 'review' && review && !started && (
          <SummaryView
            review={review}
            perspective={perspective}
            ply={ply}
            onSelectPly={(p) => {
              setStarted(true);
              selectPly(p);
            }}
            onStart={() => {
              setStarted(true);
              selectPly(0);
            }}
          />
        )}

        {tab === 'review' && review && started && (
          <MoveReviewView
            review={review}
            ply={ply}
            perspective={perspective}
            showBest={showBest}
            retry={retry}
            onSelectPly={selectPly}
            onToggleBest={() => setShowBest((s) => !s)}
            onRetry={startRetry}
            onExitRetry={() => {
              setRetry(null);
              setRetryBoard(null);
            }}
            onShowSolution={showSolution}
          />
        )}
      </section>
    </div>
  );
}

function SideIcon({ d, stroke }: { d: string; stroke?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={d}
        fill={stroke ? 'none' : 'currentColor'}
        stroke={stroke ? 'currentColor' : 'none'}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
