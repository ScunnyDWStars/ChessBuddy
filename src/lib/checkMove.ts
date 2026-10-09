import { Chess, type Square } from 'chess.js';
import type { Color, Score } from './types';
import type { Analyzer } from './engine/engine';
import { MATE_CP } from './engine/uci';
import { winProbFor } from './scoring';

export type AttemptVerdict = 'correct' | 'close' | 'wrong' | 'played';

export interface AttemptResult {
  verdict: AttemptVerdict;
  san: string;
  uci: string;
  fenAfter: string;
  from: string;
  to: string;
  /** Expected points the attempt gives up versus the best move (when engine-checked). */
  loss?: number;
}

export interface AttemptTarget {
  /** Position before the move. */
  fen: string;
  color: Color;
  bestUci?: string;
  /** The move played in the game (always "played", never accepted). */
  playedUci?: string;
  /** Mover's win probability with best play, and what the game move lost. */
  winBefore: number;
  playedLoss: number;
}

/** Plays from→to (auto-queen), or returns null if it is illegal. */
export function tryMove(fen: string, from: string, to: string) {
  const chess = new Chess(fen);
  try {
    return { chess, move: chess.move({ from: from as Square, to: to as Square, promotion: 'q' }) };
  } catch {
    return null;
  }
}

/**
 * Judges a "find the better move" attempt: the engine's move is correct,
 * repeating the game move is not; anything else is checked with the engine —
 * within 3% of the best move counts as correct, a clear improvement as close.
 */
export async function evaluateAttempt(
  target: AttemptTarget,
  from: string,
  to: string,
  analyzer: Pick<Analyzer, 'analyze'>,
  depth: number,
): Promise<AttemptResult | null> {
  const played = tryMove(target.fen, from, to);
  if (!played) return null;
  const { chess, move } = played;
  const base = { san: move.san, uci: move.lan, fenAfter: chess.fen(), from: move.from, to: move.to };
  if (move.lan === target.playedUci) return { ...base, verdict: 'played' };
  if (move.lan === target.bestUci) return { ...base, verdict: 'correct', loss: 0 };

  let score: Score;
  if (chess.isCheckmate()) score = { cp: move.color === 'w' ? MATE_CP : -MATE_CP, mate: 0 };
  else if (chess.isDraw()) score = { cp: 0 };
  else score = (await analyzer.analyze(chess.fen(), { depth, multipv: 1 }))[0]?.score ?? { cp: 0 };

  const loss = Math.max(0, target.winBefore - winProbFor(score, target.color));
  if (loss <= 0.03) return { ...base, verdict: 'correct', loss };
  if (loss < target.playedLoss * 0.5 && loss <= 0.08) return { ...base, verdict: 'close', loss };
  return { ...base, verdict: 'wrong', loss };
}
