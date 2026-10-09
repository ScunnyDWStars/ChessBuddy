import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { duePuzzles, schedule, type Puzzle, type PuzzleResult, type PuzzleTheme } from '../lib/puzzles';
import { evaluateAttempt } from '../lib/checkMove';
import { getBrowserEngine } from '../lib/engine/engine';
import { parseUci, PIECE_NAME } from '../lib/chessUtils';
import { savePuzzle } from '../lib/library';
import { useMoveInput } from './useMoveInput';

export type PracticeStatus = 'waiting' | 'checking' | 'correct' | 'close' | 'wrong' | 'played' | 'solved';

const CHECK_DEPTH = 14;

/**
 * State for the Practice tab: which puzzle is up, what the board shows,
 * checking attempts with the engine and updating the spaced-repetition
 * schedule once per puzzle (first answer counts).
 */
export function usePracticeSession(puzzles: Puzzle[], onSaved: () => void) {
  const [themes, setThemes] = useState<PuzzleTheme[] | null>(null);
  const [extra, setExtra] = useState(false);
  const [current, setCurrent] = useState<Puzzle | null>(null);
  const [board, setBoard] = useState<{ fen: string; lastMove?: { from: string; to: string } } | null>(null);
  const [status, setStatus] = useState<PracticeStatus>('waiting');
  const [message, setMessage] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);
  const [stats, setStats] = useState({ solved: 0, tried: 0, streak: 0 });
  const done = useRef(new Set<string>());
  const timers = useRef<number[]>([]);

  const filtered = useMemo(() => (themes ? puzzles.filter((p) => themes.includes(p.theme)) : puzzles), [puzzles, themes]);
  const due = useMemo(() => duePuzzles(filtered), [filtered]);
  // "Practise anyway": everything, least recently due first.
  const queue = useMemo(
    () => (extra ? [...filtered].sort((a, b) => a.srs.due - b.srs.due) : due).filter((p) => !done.current.has(p.id)),
    [extra, filtered, due],
  );

  const clearTimers = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  };

  const start = (p: Puzzle | null) => {
    clearTimers();
    setCurrent(p);
    setBoard(p ? { fen: p.fen } : null);
    setStatus('waiting');
    setMessage(null);
    setHint(null);
    setRecorded(false);
  };

  // Pick the first puzzle when the queue appears (or after changing filters).
  useEffect(() => {
    if (!current && queue.length) start(queue[0]);
  }, [queue]);

  useEffect(() => clearTimers, []);

  const record = async (p: Puzzle, result: PuzzleResult) => {
    if (recorded) return;
    setRecorded(true);
    done.current.add(p.id);
    setStats((s) => ({
      solved: s.solved + (result === 'correct' ? 1 : 0),
      tried: s.tried + 1,
      streak: result === 'correct' ? s.streak + 1 : 0,
    }));
    try {
      await savePuzzle({ ...p, srs: schedule(p.srs, result) });
      onSaved();
    } catch {
      /* the session still works without saving */
    }
  };

  const attempt = async (from: string, to: string) => {
    const p = current;
    if (!p) return;
    setStatus('checking');
    setMessage(null);
    const res = await evaluateAttempt(
      { fen: p.fen, color: p.color, bestUci: p.solution, playedUci: p.playedUci, winBefore: p.winBefore, playedLoss: p.loss },
      from,
      to,
      getBrowserEngine(),
      CHECK_DEPTH,
    ).catch(() => null);
    if (!res) {
      setStatus('waiting');
      setMessage('Could not check that move. Try again.');
      return;
    }
    setBoard({ fen: res.fenAfter, lastMove: { from: res.from, to: res.to } });
    if (res.verdict === 'correct') {
      setStatus('correct');
      setMessage(
        res.uci === p.solution
          ? `**${res.san}** is the move! ${p.bestLine.length > 1 ? `The idea: ${p.bestLine.slice(0, 6).join(' ')}.` : ''}`
          : `**${res.san}** works just as well as **${p.solutionSan}**. Well found!`,
      );
      void record(p, hint ? 'hinted' : 'correct');
    } else if (res.verdict === 'close') {
      setStatus('close');
      setMessage(`**${res.san}** is better than the game move, but there's something stronger. Try again.`);
    } else if (res.verdict === 'played') {
      setStatus('played');
      setMessage(`That's what you played in the game (**${res.san}**). Look for something better.`);
      void record(p, 'wrong');
    } else {
      setStatus('wrong');
      setMessage(`**${res.san}** isn't it. Check every check, capture and threat, then try again.`);
      void record(p, 'wrong');
    }
  };

  const interactive = !!current && (status === 'waiting' || status === 'close' || status === 'wrong' || status === 'played');
  const input = useMoveInput(interactive ? current!.fen : null, current?.color ?? null, (from, to) => void attempt(from, to));

  const onSquareClick = (sq: string) => {
    if (!current || !interactive) return;
    // After a failed try, the next click starts again from the puzzle position.
    if (board && board.fen !== current.fen) {
      setBoard({ fen: current.fen });
      setStatus('waiting');
    }
    input.onSquareClick(sq);
  };

  const showHint = () => {
    if (!current) return;
    const { from } = parseUci(current.solution);
    const piece = new Chess(current.fen).get(from as Square);
    setHint(from);
    setMessage(`Look at your ${piece ? PIECE_NAME[piece.type] : 'piece'} on **${from}**.`);
  };

  /** Plays the solution and the start of the engine line on the board. */
  const showSolution = () => {
    const p = current;
    if (!p) return;
    clearTimers();
    void record(p, 'wrong');
    setStatus('solved');
    setMessage(`The best move was **${p.solutionSan}**: ${p.bestLine.slice(0, 6).join(' ')}. In the game you played ${p.playedSan}.`);
    const chess = new Chess(p.fen);
    const line = [p.solution];
    // Follow the engine's line for a few more plies if it starts with the solution.
    const sans = p.bestLine[0] === p.solutionSan ? p.bestLine.slice(1, 4) : [];
    const steps: { fen: string; lastMove: { from: string; to: string } }[] = [];
    try {
      const m = chess.move(parseUci(line[0]));
      steps.push({ fen: chess.fen(), lastMove: { from: m.from, to: m.to } });
      for (const san of sans) {
        const n = chess.move(san);
        steps.push({ fen: chess.fen(), lastMove: { from: n.from, to: n.to } });
      }
    } catch {
      /* show as much of the line as is legal */
    }
    steps.forEach((s, i) => timers.current.push(window.setTimeout(() => setBoard(s), i * 900)));
  };

  const next = () => {
    const nextP = queue.find((p) => p.id !== current?.id) ?? null;
    start(nextP);
  };

  const chooseThemes = (t: PuzzleTheme[] | null) => {
    setThemes(t);
    setExtra(false);
    start(null);
  };

  const practiseAnyway = () => {
    done.current.clear();
    setExtra(true);
    start(null);
  };

  return {
    current,
    board,
    status,
    message,
    themes,
    queueLength: queue.length,
    dueCount: due.length,
    filteredCount: filtered.length,
    extra,
    stats,
    hintSquare: hint,
    selected: input.selected ?? hint,
    targets: interactive ? input.targets : [],
    interactive,
    onSquareClick,
    showHint,
    showSolution,
    next,
    chooseThemes,
    practiseAnyway,
  };
}

export type PracticeSession = ReturnType<typeof usePracticeSession>;
