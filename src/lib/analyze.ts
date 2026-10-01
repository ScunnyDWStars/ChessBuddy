import { Chess } from 'chess.js';
import type {
  AnalyzedMove,
  ClassCounts,
  Classification,
  Color,
  GameReview,
  ParsedGame,
  Phase,
  PositionEval,
  Score,
  SideSummary,
} from './types';
import type { Analyzer } from './engine/engine';
import { MATE_CP } from './engine/uci';
import { classifyMove } from './classify';
import { buildFeedback } from './feedback';
import { buildInsights } from './insights';
import { lookupOpening, type OpeningBook } from './openings';
import { estimateRating, gameAccuracy, whiteWinProb } from './scoring';
import { PIECE_VALUE, hangingPieces, materialSwing, phaseOf, uciLineToSan, uciToSan } from './chessUtils';

export const CLASSIFICATIONS: Classification[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
  'forced',
];

export interface AnalyzeOptions {
  depth: number;
  book: OpeningBook;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Evaluation for positions where the game is over (no engine needed). */
function terminalEval(fen: string): PositionEval | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) {
    const loser = chess.turn();
    return { fen, lines: [], score: { cp: loser === 'w' ? -MATE_CP : MATE_CP, mate: 0 } };
  }
  if (chess.isStalemate() || chess.isInsufficientMaterial()) return { fen, lines: [], score: { cp: 0 } };
  return null;
}

async function evaluatePositions(fens: string[], analyzer: Analyzer, opts: AnalyzeOptions): Promise<PositionEval[]> {
  let done = 0;
  opts.onProgress?.(0, fens.length);
  const tasks = fens.map(async (fen, i) => {
    const terminal = terminalEval(fen);
    let result: PositionEval;
    if (terminal) {
      result = terminal;
    } else {
      // The last position only needs the main line.
      const multipv = i === fens.length - 1 ? 1 : 2;
      const lines = await analyzer.analyze(fen, { depth: opts.depth, multipv });
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      result = { fen, lines, score: lines[0]?.score ?? { cp: 0 } };
    }
    opts.onProgress?.(++done, fens.length);
    return result;
  });
  return Promise.all(tasks);
}

const emptyCounts = (): ClassCounts =>
  Object.fromEntries(CLASSIFICATIONS.map((c) => [c, 0])) as ClassCounts;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function mateFor(score: Score, color: Color): number | undefined {
  if (score.mate === undefined || score.mate === 0) return undefined;
  const m = color === 'w' ? score.mate : -score.mate;
  return m > 0 ? m : undefined;
}

/** Runs the engine over every position of the game and builds the full review. */
export async function analyzeGame(game: ParsedGame, analyzer: Analyzer, opts: AnalyzeOptions): Promise<GameReview> {
  const fens = [game.startFen, ...game.moves.map((m) => m.fenAfter)];
  const evals = await evaluatePositions(fens, analyzer, opts);
  return buildReview(game, evals, opts.book, opts.depth);
}

/** Builds the review from precomputed evaluations (one per position, start position first). */
export function buildReview(game: ParsedGame, evals: PositionEval[], book: OpeningBook, depth: number): GameReview {
  const moves: AnalyzedMove[] = [];
  const isStandardStart = game.startFen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w');
  let stillInBook = isStandardStart;
  let opening: { eco: string; name: string } | undefined;

  game.moves.forEach((move, i) => {
    const before = evals[i];
    const after = evals[i + 1];
    const color = move.color;
    const chessBefore = new Chess(move.fenBefore);
    const legalMoves = chessBefore.moves().length;

    const bookInfo = stillInBook ? lookupOpening(book, move.fenAfter) : { inBook: false };
    stillInBook = bookInfo.inBook;
    if (bookInfo.name && bookInfo.eco) opening = { eco: bookInfo.eco, name: bookInfo.name };

    const prevMove = moves[i - 1];
    const isRecapture = !!(prevMove?.captured && move.captured && prevMove.to === move.to);

    // Sacrifice detection: after the move, can the opponent win a piece for less than we just took?
    const capturedValue = move.captured ? PIECE_VALUE[move.captured] : 0;
    const hanging = hangingPieces(move.fenAfter, color, 1);
    const worst = hanging[0];
    const isSacrifice =
      !move.promotion && !!worst && worst.piece !== 'p' && worst.value - capturedValue >= 2 && after.score.mate !== 0;

    // Material bookkeeping for explanations.
    const bestMaterial = before.lines[0] ? materialSwing(move.fenBefore, color, before.lines[0].pv, 4) : 0;
    const playedMaterial = materialSwing(move.fenBefore, color, [move.uci, ...(after.lines[0]?.pv ?? [])], 4);
    const replyTarget = after.lines[0]?.pv[0]?.slice(2, 4);
    const hadMateBefore = mateFor(before.score, color);
    const hangs = worst && worst.value - capturedValue >= 2 && replyTarget === worst.square ? worst : undefined;

    const cls = classifyMove({
      color,
      playedUci: move.uci,
      before,
      after,
      inBook: bookInfo.inBook,
      legalMoves,
      isRecapture,
      isSacrifice,
      missedOpportunity:
        (bestMaterial - playedMaterial >= 2 && playedMaterial > -2) || !!(hadMateBefore && hadMateBefore <= 5),
      prev: prevMove ? { loss: prevMove.loss, ourWinBefore: 1 - prevMove.winBefore } : undefined,
    });

    const bestUci = before.lines[0]?.pv[0];
    const bestLine = before.lines[0] ? uciLineToSan(move.fenBefore, before.lines[0].pv) : [];
    const replyLine = after.lines[0] ? uciLineToSan(move.fenAfter, after.lines[0].pv) : [];

    const phase: Phase = bookInfo.inBook ? 'opening' : phaseOf(move.fenBefore, move.ply, false);
    const allowsMate = mateFor(after.score, color === 'w' ? 'b' : 'w');
    const stillMate = mateFor(cls.playedScore, color) ?? (after.score.mate === 0 ? 0 : undefined);

    const feedback = buildFeedback({
      move,
      classification: cls.classification,
      phaseIsOpening: phase === 'opening',
      bestSan: bestUci ? uciToSan(move.fenBefore, bestUci) : undefined,
      bestLine,
      replyLine,
      evalBefore: before.score,
      evalAfter: after.score,
      hangs: hangs ?? (cls.classification === 'brilliant' ? worst : undefined),
      missedGain: Math.max(0, bestMaterial - playedMaterial),
      playedLoses: Math.max(0, -playedMaterial),
      allowsMate: allowsMate && !mateFor(before.score, color === 'w' ? 'b' : 'w') ? allowsMate : undefined,
      missedMate: hadMateBefore && stillMate === undefined ? hadMateBefore : undefined,
      keepsMate: stillMate || undefined,
      isRecapture,
      isSacrifice,
      opening: opening?.name,
      prevLoss: prevMove?.loss ?? 0,
      winAfter: cls.winAfter,
    });

    moves.push({
      ...move,
      phase,
      classification: cls.classification,
      evalBefore: before.score,
      evalAfter: after.score,
      winBefore: cls.winBefore,
      winAfter: cls.winAfter,
      loss: cls.loss,
      accuracy: cls.accuracy,
      bestMove: bestUci ? { uci: bestUci, san: uciToSan(move.fenBefore, bestUci) } : undefined,
      bestLine,
      replyLine,
      opening: bookInfo.name && bookInfo.eco ? { eco: bookInfo.eco, name: bookInfo.name } : undefined,
      hangs: hangs ? { square: hangs.square, piece: hangs.piece, value: hangs.value } : undefined,
      feedback,
    });
  });

  const whiteWins = evals.map((e) => whiteWinProb(e.score));
  const summarize = (color: Color): SideSummary => {
    const mine = moves.map((m, i) => ({ m, i })).filter(({ m }) => m.color === color);
    const counts = emptyCounts();
    mine.forEach(({ m }) => counts[m.classification]++);
    const accuracy = gameAccuracy(
      whiteWins,
      mine.map(({ m }) => m.accuracy),
      mine.map(({ i }) => i),
    );
    const phaseAcc = (p: Phase) => {
      const ms = mine.filter(({ m }) => m.phase === p).map(({ m }) => m.accuracy);
      if (!ms.length) return null;
      // Same blend as the game accuracy (mean + harmonic mean) so the numbers agree.
      const harmonic = ms.length / ms.reduce((a, acc) => a + 1 / Math.max(acc, 1), 0);
      return (mean(ms) + harmonic) / 2;
    };
    return {
      accuracy,
      estimatedRating: estimateRating(accuracy),
      counts,
      phases: { opening: phaseAcc('opening'), middlegame: phaseAcc('middlegame'), endgame: phaseAcc('endgame') },
    };
  };
  const summary = { w: summarize('w'), b: summarize('b') };

  return {
    game,
    depth,
    initialEval: evals[0].score,
    moves,
    opening,
    summary,
    insights: {
      w: buildInsights(moves, 'w', summary.w, game.headers),
      b: buildInsights(moves, 'b', summary.b, game.headers),
    },
  };
}
