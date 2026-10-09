import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { Classification, Color, GameReview, ParsedGame, Score } from './lib/types';
import { baseTimeSeconds, parsePgn } from './lib/pgn';
import { analyzeGame } from './lib/analyze';
import { getBrowserEngine } from './lib/engine/engine';
import { loadOpeningBook } from './lib/openings';
import { reviewKey } from './lib/storage';
import { other, parseUci } from './lib/chessUtils';
import { evaluateAttempt } from './lib/checkMove';
import {
  getGame,
  getReview,
  knownUsernames,
  listGames,
  listPuzzles,
  migrateLegacyReviews,
  pickSide,
  recordGame,
  setMyColor,
  type GameRecord,
} from './lib/library';
import { duePuzzles, type Puzzle, type PuzzleTheme } from './lib/puzzles';
import { isExtensionPage, onQueueChanged, payloadToPgn, readQueue, removeFromQueue, takeExtensionImport } from './lib/extensionBridge';
import { useMoveInput } from './hooks/useMoveInput';
import { usePracticeSession } from './hooks/usePracticeSession';
import { Board, type Arrow } from './components/Board';
import { EvalBar } from './components/EvalBar';
import { PlayerStrip, CoachAvatar } from './components/common';
import { SummaryView } from './components/SummaryView';
import { MoveReviewView, RETRYABLE, type RetryState } from './components/MoveReviewView';
import { InsightsView } from './components/InsightsView';
import { LoadView } from './components/LoadView';
import { MoveList } from './components/MoveList';
import { ProgressView } from './components/ProgressView';
import { PracticeView } from './components/PracticeView';

type Tab = 'review' | 'insights' | 'progress' | 'practice' | 'load';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const BEST_ARROW = 'rgba(129, 182, 76, 0.95)';

/** Whether the game on screen is saved to your library, and how its side was decided. */
interface GameSession {
  key: string;
  record: boolean;
  side: { color: Color; source: GameRecord['colorSource'] };
}

export default function App() {
  const [game, setGame] = useState<ParsedGame | null>(null);
  const [review, setReview] = useState<GameReview | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ply, setPly] = useState(0);
  const [perspective, setPerspective] = useState<Color>('w');
  const [flipped, setFlipped] = useState(false);
  // The extension's "Open ChessBuddy" button links to #progress.
  const [tab, setTabState] = useState<Tab>(() => (location.hash === '#progress' ? 'progress' : 'load'));
  const [started, setStarted] = useState(false);
  const [showBest, setShowBest] = useState(false);
  const [retry, setRetry] = useState<RetryState | null>(null);
  const [retryBoard, setRetryBoard] = useState<{ fen: string; lastMove?: { from: string; to: string } } | null>(null);
  const [depth, setDepth] = useState(15);
  const [games, setGames] = useState<GameRecord[]>([]);
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [queueProgress, setQueueProgress] = useState<{ done: number; total: number } | null>(null);
  const runId = useRef(0);
  const session = useRef<GameSession | null>(null);
  const depthRef = useRef(depth);
  depthRef.current = depth;

  const refreshLibrary = useCallback(async () => {
    const [g, p] = await Promise.all([listGames(), listPuzzles()]);
    setGames(g);
    setPuzzles(p);
  }, []);

  useEffect(() => {
    void migrateLegacyReviews().then(refreshLibrary);
  }, [refreshLibrary]);

  const practice = usePracticeSession(puzzles, () => void listPuzzles().then(setPuzzles));

  const clearRetry = () => {
    setRetry(null);
    setRetryBoard(null);
  };

  const setTab = (t: Tab) => {
    setTabState(t);
    clearRetry();
  };

  const orientation: Color = flipped ? other(perspective) : perspective;

  const selectPly = useCallback(
    (p: number) => {
      if (!game) return;
      setPly(Math.max(0, Math.min(game.moves.length, p)));
      setShowBest(false);
      clearRetry();
    },
    [game],
  );

  const runAnalysis = useCallback(
    async (g: ParsedGame, d: number) => {
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
        const s = session.current;
        if (s?.record) {
          await recordGame(result, s.side.color, s.side.source);
          await refreshLibrary();
        }
      } catch (e) {
        if (id !== runId.current) return;
        console.error(e);
        setProgress(null);
        setError(`Analysis failed: ${(e as Error).message}. Your browser may not support WebAssembly workers.`);
      }
    },
    [refreshLibrary],
  );

  const showGame = (parsed: ParsedGame, side: Color, startPly = 0) => {
    setGame(parsed);
    setPerspective(side);
    setFlipped(false);
    setPly(startPly);
    setStarted(startPly > 0);
    setShowBest(false);
    clearRetry();
    setTab('review');
    setError(null);
  };

  const loadGame = useCallback(
    async (pgn: string, username?: string | string[], perspectiveHint?: Color, opts: { record?: boolean } = {}) => {
      let parsed: ParsedGame;
      try {
        parsed = parsePgn(pgn);
      } catch (e) {
        setError((e as Error).message);
        return;
      }
      const record = opts.record ?? true;
      const given = Array.isArray(username) ? username : username ? [username] : [];
      const side = pickSide(parsed.headers, [...given, ...(record ? await knownUsernames() : [])], perspectiveHint);
      const key = reviewKey(parsed.pgn, depth);
      session.current = { key, record, side };
      showGame(parsed, side.color);
      const cached = await getReview(key);
      if (cached) {
        runId.current++;
        setProgress(null);
        setReview(cached);
        if (record && !(await getGame(key))) {
          await recordGame(cached, side.color, side.source);
          await refreshLibrary();
        }
      } else {
        void runAnalysis(parsed, depth);
      }
    },
    [depth, runAnalysis, refreshLibrary],
  );

  /** Opens a game from your library, optionally at a given move. */
  const openStored = async (key: string, atPly = 0) => {
    const [stored, record] = await Promise.all([getReview(key), getGame(key)]);
    if (!stored) {
      setError('That review is no longer saved. Load the game again to re-analyse it.');
      setTab('load');
      return;
    }
    runId.current++;
    session.current = { key, record: true, side: { color: record?.myColor ?? 'w', source: record?.colorSource ?? 'chosen' } };
    setReview(stored);
    setProgress(null);
    showGame(stored.game, record?.myColor ?? 'w', atPly);
  };

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

  // Games the extension saved in the background: analyse them one by one.
  useEffect(() => {
    if (!isExtensionPage()) return;
    let running = false;
    const drain = async () => {
      if (running) return;
      running = true;
      try {
        let queue = await readQueue();
        let done = 0;
        while (queue.length) {
          const item = queue[0];
          setQueueProgress({ done, total: done + queue.length });
          try {
            const parsed = parsePgn(payloadToPgn(item.payload));
            const key = reviewKey(parsed.pgn, depthRef.current);
            if (!(await getGame(key))) {
              const analysed = (await getReview(key)) ?? (await analyzeGame(parsed, getBrowserEngine(), { depth: depthRef.current, book: await loadOpeningBook() }));
              const side = pickSide(parsed.headers, await knownUsernames(), item.payload.perspective);
              await recordGame(analysed, side.color, side.source);
              await refreshLibrary();
            }
          } catch (e) {
            console.error('Skipping a saved game that could not be analysed', e);
          }
          await removeFromQueue(item.id);
          done++;
          queue = await readQueue();
        }
      } finally {
        running = false;
        setQueueProgress(null);
      }
    };
    void drain();
    return onQueueChanged(() => void drain());
  }, [refreshLibrary]);

  // Keyboard navigation like chess.com: ← → Home End, F to flip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      if (e.key === 'f' || e.key === 'F') {
        setFlipped((f) => !f);
        e.preventDefault();
        return;
      }
      if (!game || tab !== 'review') return;
      if (e.key === 'ArrowRight') selectPly(ply + 1);
      else if (e.key === 'ArrowLeft') selectPly(ply - 1);
      else if (e.key === 'Home') selectPly(0);
      else if (e.key === 'End') selectPly(game.moves.length);
      else return;
      e.preventDefault();
      if (review && !started && e.key.startsWith('Arrow')) setStarted(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, ply, review, started, tab, selectPly]);

  const switchSide = () => {
    const next = other(perspective);
    setPerspective(next);
    setFlipped(false);
    // For saved games whose side wasn't set by a username, the switch also says which side is yours.
    const s = session.current;
    if (s?.record && s.side.source === 'chosen') {
      s.side = { color: next, source: 'chosen' };
      void setMyColor(s.key, next).then(refreshLibrary);
    }
  };

  const current = ply > 0 && review ? review.moves[ply - 1] : null;
  const plyInfo = ply > 0 && game ? game.moves[ply - 1] : null;

  // ----- Retry ("find a better move") -----
  const startRetry = () => {
    if (!current) return;
    setRetry({ ply: current.ply, status: 'waiting' });
    setRetryBoard({ fen: current.fenBefore });
    setShowBest(false);
  };

  const showSolution = () => {
    if (!current?.bestMove) return;
    const chess = new Chess(current.fenBefore);
    const m = chess.move(parseUci(current.bestMove.uci));
    setRetryBoard({ fen: chess.fen(), lastMove: { from: m.from, to: m.to } });
    setRetry({ ply: current.ply, status: 'solved', message: `The best move was **${m.san}**. The idea: ${current.bestLine.slice(0, 6).join(' ')}.` });
  };

  const attempt = async (from: string, to: string) => {
    if (!current || !retry || !review) return;
    setRetry({ ply: retry.ply, status: 'checking' });
    const res = await evaluateAttempt(
      { fen: current.fenBefore, color: current.color, bestUci: current.bestMove?.uci, playedUci: current.uci, winBefore: current.winBefore, playedLoss: current.loss },
      from,
      to,
      getBrowserEngine(),
      Math.min(review.depth, 14),
    ).catch(() => null);
    if (!res) {
      setRetry({ ply: retry.ply, status: 'wrong', message: 'Could not check that move. Try again.' });
      return;
    }
    setRetryBoard({ fen: res.fenAfter, lastMove: { from: res.from, to: res.to } });
    const best = current.bestMove ? `**${current.bestMove.san}**` : 'the engine move';
    const messages = {
      correct:
        res.uci === current.bestMove?.uci
          ? `**${res.san}** is the best move! ${current.bestLine.length > 1 ? `The point: ${current.bestLine.slice(0, 6).join(' ')}.` : ''}`
          : `**${res.san}** works just as well as ${best}. Well found!`,
      close: `**${res.san}** is a clear improvement, but ${best} is even stronger. Try again or show the solution.`,
      wrong: `**${res.san}** isn't it. Think about checks, captures and threats — then try again.`,
      played: `That's the move you played in the game (**${res.san}**). Look for something better.`,
    };
    setRetry({ ply: retry.ply, status: res.verdict === 'played' ? 'wrong' : res.verdict, message: messages[res.verdict] });
  };

  const retryInteractive = !!retry && !!retryBoard && (retry.status === 'waiting' || retry.status === 'wrong' || retry.status === 'close');
  const retryInput = useMoveInput(retryInteractive && current ? current.fenBefore : null, current?.color ?? null, (from, to) => void attempt(from, to));
  const onRetrySquare = (sq: string) => {
    if (current && retryBoard && retryBoard.fen !== current.fenBefore) setRetryBoard({ fen: current.fenBefore });
    retryInput.onSquareClick(sq);
  };

  // ----- What the board shows -----
  let boardFen = game ? (plyInfo ? plyInfo.fenAfter : game.startFen) : START_FEN;
  let lastMove = plyInfo ? { from: plyInfo.from, to: plyInfo.to } : undefined;
  let classification: Classification | undefined = review ? current?.classification : undefined;
  let animateKey: string | undefined = plyInfo ? `p${ply}` : undefined;
  const arrows: Arrow[] = [];
  let evalScore: Score | null = review ? (current ? current.evalAfter : review.initialEval) : null;
  let boardOrientation = orientation;
  let selected: string | null | undefined;
  let targets: string[] = [];
  let onSquareClick: ((sq: string) => void) | undefined;
  let names: Record<Color, { name: string; rating?: string }> = {
    w: { name: game?.headers.white ?? 'White', rating: game?.headers.whiteElo },
    b: { name: game?.headers.black ?? 'Black', rating: game?.headers.blackElo },
  };
  let showClocks = true;

  if (tab === 'practice') {
    const p = practice.current;
    boardFen = practice.board?.fen ?? START_FEN;
    lastMove = practice.board?.lastMove;
    const status = practice.status;
    classification =
      status === 'correct' || status === 'solved' ? 'best' : status === 'close' ? 'good' : (status === 'wrong' || status === 'played') && lastMove ? 'mistake' : undefined;
    animateKey = lastMove ? `q${boardFen}` : undefined;
    evalScore = null;
    boardOrientation = flipped ? other(p?.color ?? 'w') : (p?.color ?? 'w');
    selected = practice.selected;
    targets = practice.targets;
    onSquareClick = practice.interactive ? practice.onSquareClick : undefined;
    names = { w: { name: p?.white ?? 'White' }, b: { name: p?.black ?? 'Black' } };
    showClocks = false;
  } else if (retry && retryBoard) {
    boardFen = retryBoard.fen;
    lastMove = retryBoard.lastMove;
    classification =
      retry.status === 'correct' || retry.status === 'solved' ? 'best' : retry.status === 'close' ? 'good' : retry.status === 'wrong' && lastMove ? 'mistake' : undefined;
    animateKey = lastMove ? `r${retryBoard.fen}` : undefined;
    evalScore = current?.evalBefore ?? null;
    selected = retryInput.selected;
    targets = retryInteractive ? retryInput.targets : [];
    onSquareClick = retryInteractive ? onRetrySquare : undefined;
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

  const clockFor = (c: Color): number | undefined => {
    if (!game || !showClocks) return undefined;
    const moves = game.moves.slice(0, ply).filter((m) => m.color === c && m.clock !== undefined);
    if (moves.length) return moves[moves.length - 1].clock;
    // Before a side's first move, show the starting clock if the game has clock data.
    const hasClocks = game.moves.some((m) => m.clock !== undefined);
    return hasClocks ? baseTimeSeconds(game.headers.timeControl) : undefined;
  };
  const toMove: Color = boardFen.split(' ')[1] === 'b' ? 'b' : 'w';
  const strip = (c: Color) => (
    <PlayerStrip name={names[c].name} rating={names[c].rating} color={c} fen={boardFen} clock={clockFor(c)} active={toMove === c} />
  );

  const dueCount = useMemo(() => duePuzzles(puzzles).length, [puzzles]);
  const recent = useMemo(() => [...games].sort((a, b) => b.savedAt - a.savedAt).slice(0, 6), [games]);
  const panelTitle = { review: 'Game Review', insights: 'Insights', progress: 'Progress', practice: 'Practice', load: 'Load Game' }[tab];
  const practise = (themes?: PuzzleTheme[]) => {
    practice.chooseThemes(themes ?? null);
    setTab('practice');
  };

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
          <button className={tab === 'progress' ? 'active' : ''} onClick={() => setTab('progress')}>
            <SideIcon d="M3 17l6-6 4 4 8-8M15 7h6v6" stroke /> Progress
          </button>
          <button className={tab === 'practice' ? 'active' : ''} onClick={() => setTab('practice')}>
            <SideIcon d="M13 2L4 14h7l-1 8 9-12h-7z" /> Practice
            {dueCount > 0 && <span className="nav-badge">{dueCount}</span>}
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
          {strip(boardOrientation === 'w' ? 'b' : 'w')}
          <div className="board-row">
            <EvalBar score={evalScore} orientation={boardOrientation} />
            <Board
              fen={boardFen}
              orientation={boardOrientation}
              lastMove={lastMove}
              classification={classification}
              arrows={arrows}
              animateKey={animateKey}
              selected={selected}
              targets={targets}
              onSquareClick={onSquareClick}
            />
          </div>
          {strip(boardOrientation)}
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
          {game && (tab === 'review' || tab === 'insights') && (
            <button className="side-switch" onClick={switchSide} title="Switch which player you are reviewing">
              <span className={`side-dot ${perspective}`} />
              <span className="side-name">{perspective === 'w' ? game.headers.white : game.headers.black}</span>
              <span className="swap">⇄</span>
            </button>
          )}
        </header>

        {tab === 'load' && (
          <LoadView
            depth={depth}
            onDepth={setDepth}
            onLoad={(pgn, user) => void loadGame(pgn, user)}
            onLoadSample={(pgn, user) => void loadGame(pgn, user, undefined, { record: false })}
            recent={recent}
            onOpenRecent={(key) => void openStored(key)}
            error={error}
          />
        )}

        {tab === 'progress' && (
          <ProgressView
            games={games}
            puzzles={puzzles}
            pending={queueProgress}
            onOpenGame={(key) => void openStored(key)}
            onPractise={practise}
            onLoad={() => setTab('load')}
          />
        )}

        {tab === 'practice' && (
          <PracticeView session={practice} puzzles={puzzles} onOpenGame={(key, p) => void openStored(key, p)} onLoad={() => setTab('load')} />
        )}

        {tab === 'insights' && review && (
          <InsightsView
            review={review}
            perspective={perspective}
            onJump={(p) => {
              setStarted(true);
              setTab('review');
              selectPly(p);
            }}
          />
        )}

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
            onExitRetry={clearRetry}
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
