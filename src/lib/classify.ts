import type { Classification, Color, PositionEval, Score } from './types';
import { moveAccuracy, winProbFor } from './scoring';

/** Expected-points thresholds, modelled on chess.com's published classification scale. */
export const THRESHOLDS = {
  excellent: 0.02,
  good: 0.05,
  inaccuracy: 0.1,
  mistake: 0.2,
} as const;

export interface ClassifyInput {
  color: Color;
  playedUci: string;
  /** Engine evaluation of the position before the move (MultiPV ≥ 2 preferred). */
  before: PositionEval;
  /** Engine evaluation of the position after the move. */
  after: PositionEval;
  inBook: boolean;
  legalMoves: number;
  /** The move recaptures on the square the opponent just captured on. */
  isRecapture: boolean;
  /** The move leaves a piece en prise for less than it is worth. */
  isSacrifice: boolean;
  /** The best move won material (or mated) and the played move did not lose any. */
  missedOpportunity?: boolean;
  /** The opponent's previous move, if any. */
  prev?: {
    /** Expected points the opponent lost with it. */
    loss: number;
    /** This player's win probability before the opponent's move. */
    ourWinBefore: number;
  };
}

export interface ClassifyResult {
  classification: Classification;
  winBefore: number;
  winAfter: number;
  loss: number;
  accuracy: number;
  playedScore: Score;
}

const isMateFor = (score: Score, color: Color) =>
  score.mate !== undefined && score.mate !== 0 && (color === 'w' ? score.mate > 0 : score.mate < 0);

export function classifyMove(input: ClassifyInput): ClassifyResult {
  const { color, before, after, playedUci } = input;
  const winBefore = winProbFor(before.score, color);

  // Prefer the score from the same search when the played move was one of the
  // engine's candidate lines: it is directly comparable to the best line.
  const idx = before.lines.findIndex((l) => l.pv[0] === playedUci);
  const afterIsMate = after.score.mate === 0;
  const playedScore = idx >= 0 && !afterIsMate ? before.lines[idx].score : after.score;
  const winAfter = winProbFor(playedScore, color);
  const isTop = idx === 0 || afterIsMate;
  const loss = isTop ? 0 : Math.max(0, winBefore - winAfter);
  const accuracy = input.inBook ? 100 : moveAccuracy(winBefore, winBefore - loss);

  const result = (classification: Classification): ClassifyResult => ({
    classification,
    winBefore,
    winAfter,
    loss,
    accuracy,
    playedScore,
  });

  if (input.legalMoves === 1) return result('forced');
  if (input.inBook) return result('book');

  const bestIsMate = isMateFor(before.score, color);
  const brilliantCandidate =
    input.isSacrifice && loss <= THRESHOLDS.excellent && winAfter >= 0.5 && (winBefore < 0.98 || bestIsMate);
  if (brilliantCandidate) return result('brilliant');

  if (isTop) {
    const second = before.lines[1];
    // Delivering mate or recapturing is rarely hard to find: keep those as "best".
    if (second && !input.isRecapture && !afterIsMate) {
      const gap = winBefore - winProbFor(second.score, color);
      const onlyMove = gap >= 0.15 && winAfter >= 0.3;
      const punishes = (input.prev?.loss ?? 0) >= 0.2 && gap >= 0.08;
      if (onlyMove || punishes) return result('great');
    }
    return result('best');
  }

  if (loss <= THRESHOLDS.excellent) return result('excellent');
  if (loss <= THRESHOLDS.good) return result('good');

  // A miss: the opponent handed over a chance and this move let it slip,
  // without making our own position worse than it was before their error.
  const missedMate = bestIsMate && Math.abs(before.score.mate ?? 99) <= 5 && !isMateFor(playedScore, color);
  if (loss > THRESHOLDS.inaccuracy) {
    const prev = input.prev;
    const squandered = prev && prev.loss >= THRESHOLDS.inaccuracy && winAfter >= prev.ourWinBefore - 0.03;
    if ((squandered || missedMate || input.missedOpportunity) && winAfter >= 0.4) return result('miss');
  }
  if (loss <= THRESHOLDS.inaccuracy) return result('inaccuracy');
  if (loss <= THRESHOLDS.mistake) return result('mistake');
  return result('blunder');
}
