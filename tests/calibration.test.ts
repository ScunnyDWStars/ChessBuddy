import { describe, expect, it } from 'vitest';
import { fixtureReview } from './helpers';

/**
 * A real 3+0 game (both players ≈1230) with Chess.com's own Game Review numbers.
 * Engine output is saved (Stockfish lite, depth 15, as the app runs it) so the
 * check is fast and deterministic.
 */
const CHESS_COM = {
  w: { accuracy: 80.6, rating: 1650, errors: 5 }, // 3 inaccuracies, 1 mistake, 1 miss
  b: { accuracy: 76.0, rating: 1400, errors: 8 }, // 5 inaccuracies, 2 mistakes, 1 blunder
};

describe('calibration against a Chess.com review', () => {
  const review = fixtureReview();

  for (const color of ['w', 'b'] as const) {
    it(`${color === 'w' ? 'White' : 'Black'}: accuracy, game rating and error count are close`, () => {
      const s = review.summary[color];
      const target = CHESS_COM[color];
      expect(Math.abs(s.accuracy - target.accuracy)).toBeLessThan(2.5);
      expect(Math.abs(s.estimatedRating - target.rating)).toBeLessThanOrEqual(150);
      const errors = s.counts.inaccuracy + s.counts.mistake + s.counts.miss + s.counts.blunder;
      expect(Math.abs(errors - target.errors)).toBeLessThanOrEqual(2);
    });
  }

  it('finds the same blunder (19...Kf8)', () => {
    expect(review.moves.find((m) => m.ply === 40)?.classification).toBe('blunder');
    expect(review.summary.b.counts.blunder).toBe(1);
    expect(review.summary.w.counts.blunder).toBe(0);
  });
});
