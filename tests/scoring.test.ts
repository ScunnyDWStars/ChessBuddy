import { describe, expect, it } from 'vitest';
import { estimateRating, formatScore, gameAccuracy, moveAccuracy, whiteWinProb, winProbFor } from '../src/lib/scoring';

describe('win probability', () => {
  it('is 50% at equality and symmetric', () => {
    expect(whiteWinProb({ cp: 0 })).toBeCloseTo(0.5);
    expect(winProbFor({ cp: 300 }, 'w') + winProbFor({ cp: 300 }, 'b')).toBeCloseTo(1);
    expect(whiteWinProb({ cp: 300 })).toBeGreaterThan(0.7);
  });

  it('treats mates as decisive', () => {
    expect(whiteWinProb({ cp: 99_998, mate: 2 })).toBe(1);
    expect(whiteWinProb({ cp: -99_998, mate: -2 })).toBe(0);
  });
});

describe('accuracy', () => {
  it('gives ~100 for no loss and drops with larger losses', () => {
    expect(moveAccuracy(0.6, 0.6)).toBe(100);
    expect(moveAccuracy(0.6, 0.5)).toBeLessThan(70);
    expect(moveAccuracy(0.9, 0.1)).toBeLessThan(5);
  });

  it('game accuracy is pulled down by a single blunder', () => {
    const wins = [0.5, 0.5, 0.5, 0.5, 0.5, 0.1, 0.1];
    const clean = gameAccuracy(wins, [100, 100, 100], [0, 2, 4]);
    const blunder = gameAccuracy(wins, [100, 100, 5], [0, 2, 4]);
    expect(clean).toBeCloseTo(100);
    expect(blunder).toBeLessThan(60);
  });

  it('maps accuracy to an increasing rating estimate', () => {
    const ratings = [20, 50, 70, 85, 95].map(estimateRating);
    expect([...ratings].sort((a, b) => a - b)).toEqual(ratings);
  });
});

describe('formatScore', () => {
  it('formats centipawns and mates', () => {
    expect(formatScore({ cp: 123 })).toBe('+1.23');
    expect(formatScore({ cp: -40 })).toBe('-0.40');
    expect(formatScore({ cp: 99_997, mate: 3 })).toBe('+M3');
    expect(formatScore({ cp: -99_998, mate: -2 })).toBe('-M2');
    expect(formatScore({ cp: 100_000, mate: 0 })).toBe('1-0');
  });
});
