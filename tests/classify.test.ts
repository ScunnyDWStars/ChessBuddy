import { describe, expect, it } from 'vitest';
import { classifyMove, type ClassifyInput } from '../src/lib/classify';
import type { PositionEval, Score } from '../src/lib/types';

const pos = (score: Score, lines: [string, Score][] = []): PositionEval => ({
  fen: 'x',
  score,
  lines: lines.map(([m, s]) => ({ pv: [m], score: s, depth: 15 })),
});

const base = (over: Partial<ClassifyInput>): ClassifyInput => ({
  color: 'w',
  playedUci: 'e2e4',
  before: pos({ cp: 30 }, [
    ['e2e4', { cp: 30 }],
    ['d2d4', { cp: 25 }],
  ]),
  after: pos({ cp: 30 }),
  inBook: false,
  legalMoves: 20,
  isRecapture: false,
  isSacrifice: false,
  ...over,
});

describe('classifyMove', () => {
  it('labels the engine move as best', () => {
    expect(classifyMove(base({})).classification).toBe('best');
  });

  it('labels book and forced moves', () => {
    expect(classifyMove(base({ inBook: true })).classification).toBe('book');
    expect(classifyMove(base({ legalMoves: 1 })).classification).toBe('forced');
  });

  it('grades losses on the expected-points scale', () => {
    const at = (cp: number) => classifyMove(base({ playedUci: 'a2a3', after: pos({ cp }) })).classification;
    expect(at(25)).toBe('excellent');
    expect(at(-20)).toBe('good');
    expect(at(-50)).toBe('inaccuracy');
    expect(at(-180)).toBe('mistake');
    expect(at(-500)).toBe('blunder');
  });

  it('works from Black’s point of view', () => {
    const r = classifyMove(
      base({
        color: 'b',
        playedUci: 'a7a6',
        before: pos({ cp: -30 }, [['e7e5', { cp: -30 }]]),
        after: pos({ cp: 450 }),
      }),
    );
    expect(r.classification).toBe('blunder');
    expect(r.winBefore).toBeGreaterThan(0.5);
  });

  it('marks an only move as great', () => {
    const r = classifyMove(
      base({
        before: pos({ cp: 20 }, [
          ['e2e4', { cp: 20 }],
          ['d2d4', { cp: -350 }],
        ]),
      }),
    );
    expect(r.classification).toBe('great');
  });

  it('marks a sound sacrifice as brilliant', () => {
    expect(classifyMove(base({ isSacrifice: true })).classification).toBe('brilliant');
    // ...but not an unsound one.
    expect(classifyMove(base({ isSacrifice: true, playedUci: 'a2a3', after: pos({ cp: -400 }) })).classification).toBe('blunder');
  });

  it('marks failing to punish an opponent error as a miss', () => {
    const r = classifyMove(
      base({
        playedUci: 'a2a3',
        before: pos({ cp: 600 }, [['d1h5', { cp: 600 }]]),
        after: pos({ cp: 80 }),
        prev: { loss: 0.35, ourWinBefore: 0.52 },
      }),
    );
    expect(r.classification).toBe('miss');
  });

  it('treats delivering checkmate as best, not great', () => {
    const r = classifyMove(
      base({
        playedUci: 'h5f7',
        before: pos({ cp: 99_999, mate: 1 }, [
          ['h5f7', { cp: 99_999, mate: 1 }],
          ['c4f7', { cp: -20 }],
        ]),
        after: pos({ cp: 100_000, mate: 0 }),
      }),
    );
    expect(r.classification).toBe('best');
    expect(r.loss).toBe(0);
  });
});
