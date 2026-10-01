import type { Color, Score } from './types';

/** Win probability (0..1) for White, using lichess' logistic model. */
export function whiteWinProb(score: Score): number {
  if (score.mate !== undefined) return score.cp > 0 ? 1 : 0;
  const cp = Math.max(-1000, Math.min(1000, score.cp));
  return 1 / (1 + Math.exp(-0.00368208 * cp));
}

export function winProbFor(score: Score, color: Color): number {
  const w = whiteWinProb(score);
  return color === 'w' ? w : 1 - w;
}

/** Lichess per-move accuracy from win percentages (0..100) before/after. */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const drop = Math.max(0, (winBefore - winAfter) * 100);
  const raw = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669 + 1;
  return Math.max(0, Math.min(100, raw));
}

function stdDev(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
}

/**
 * Game accuracy for one side, following lichess: the mean of a
 * volatility-weighted average and a harmonic mean of per-move accuracies.
 * `whiteWins` are White win probabilities for every position of the game
 * (initial position included), `accuracies` are per-move accuracies for the
 * side, `plyIdx` the index of each of those moves in the game.
 */
export function gameAccuracy(whiteWins: number[], accuracies: number[], plyIdx: number[]): number {
  if (accuracies.length === 0) return 0;
  const n = whiteWins.length;
  const window = Math.max(2, Math.min(8, Math.floor(n / 10)));
  const weights = plyIdx.map((i) => {
    const start = Math.max(0, Math.min(i, n - window));
    const slice = whiteWins.slice(start, start + window).map((w) => w * 100);
    return Math.max(0.5, Math.min(12, stdDev(slice)));
  });
  const wSum = weights.reduce((a, b) => a + b, 0);
  const weighted = accuracies.reduce((a, acc, i) => a + acc * weights[i], 0) / wSum;
  const harmonic = accuracies.length / accuracies.reduce((a, acc) => a + 1 / Math.max(acc, 1), 0);
  return (weighted + harmonic) / 2;
}

const RATING_CURVE: [number, number][] = [
  [0, 100],
  [30, 250],
  [45, 450],
  [55, 700],
  [65, 1000],
  [72, 1250],
  [78, 1500],
  [83, 1750],
  [87, 2000],
  [91, 2250],
  [94, 2500],
  [97, 2800],
  [100, 3100],
];

/**
 * A rough "game rating": the playing strength this accuracy is typical of.
 * Short or one-sided games are noisy, so callers should label it an estimate.
 */
export function estimateRating(accuracy: number): number {
  const a = Math.max(0, Math.min(100, accuracy));
  for (let i = 1; i < RATING_CURVE.length; i++) {
    const [x1, y1] = RATING_CURVE[i];
    if (a <= x1) {
      const [x0, y0] = RATING_CURVE[i - 1];
      return Math.round((y0 + ((a - x0) / (x1 - x0)) * (y1 - y0)) / 50) * 50;
    }
  }
  return RATING_CURVE[RATING_CURVE.length - 1][1];
}

/** Formats a score the way an eval bar shows it: "+1.25", "-0.40", "M3", "-M2", "1-0". */
export function formatScore(score: Score, opts: { signed?: boolean } = {}): string {
  const signed = opts.signed ?? true;
  if (score.mate !== undefined) {
    if (score.mate === 0) return score.cp > 0 ? '1-0' : '0-1';
    const m = Math.abs(score.mate);
    return score.mate > 0 ? `${signed ? '+' : ''}M${m}` : `-M${m}`;
  }
  const v = score.cp / 100;
  const s = Math.abs(v).toFixed(Math.abs(v) >= 10 ? 1 : 2);
  if (v === 0) return '0.00';
  return v > 0 ? `${signed ? '+' : ''}${s}` : `-${s}`;
}
