import { describe, expect, it } from 'vitest';
import { buildProgress } from '../src/lib/progress';
import { buildRecord, pickSide, type GameRecord } from '../src/lib/library';
import { fixtureReview } from './helpers';

const review = fixtureReview();

function rec(i: number, over: Partial<GameRecord> = {}): GameRecord {
  return { ...buildRecord(review, 'w', 'username', i), key: `k${i}`, playedAt: i, ...over };
}

describe('buildRecord', () => {
  it("summarises the game from the player's side", () => {
    const r = buildRecord(review, 'w', 'username', 5);
    expect(r).toMatchObject({ white: 'ChessManDan1888', myColor: 'w', outcome: 'win', result: '1-0' });
    expect(r.accuracy).toBeCloseTo(review.summary.w.accuracy);
    expect(r.opponentAccuracy).toBeCloseTo(review.summary.b.accuracy);
    expect(r.playedAt).toBe(Date.UTC(2026, 8, 26, 12));
    expect(buildRecord(review, 'b', 'chosen').outcome).toBe('loss');
  });
});

describe('pickSide', () => {
  const h = review.game.headers;
  it('matches usernames case-insensitively, else uses the hint', () => {
    expect(pickSide(h, ['freegreenland'])).toEqual({ color: 'b', source: 'username' });
    expect(pickSide(h, ['ChessManDan1888'])).toEqual({ color: 'w', source: 'username' });
    expect(pickSide(h, [], 'b')).toEqual({ color: 'b', source: 'chosen' });
  });
});

describe('buildProgress', () => {
  it('aggregates results, accuracy trend and recurring problems', () => {
    const records = [
      ...Array.from({ length: 10 }, (_, i) => rec(i, { accuracy: 60, outcome: 'loss', problems: ['hanging'] })),
      ...Array.from({ length: 10 }, (_, i) =>
        rec(10 + i, { accuracy: 80, outcome: i % 2 ? 'win' : 'draw', problems: i < 4 ? ['hanging', 'time'] : ['time'] }),
      ),
    ];
    const p = buildProgress(records.reverse());
    expect(p.games).toBe(20);
    expect(p.series[0].key).toBe('k0');
    expect([p.wins, p.losses, p.draws]).toEqual([5, 10, 5]);
    expect(p.recentAccuracy).toBeCloseTo(80);
    expect(p.previousAccuracy).toBeCloseTo(60);
    expect(p.averageAccuracy).toBeCloseTo(70);
    expect(p.problems.map((x) => [x.id, x.games, x.window])).toEqual([
      ['time', 10, 10],
      ['hanging', 4, 10],
    ]);
  });

  it('groups openings by name and colour with a score', () => {
    const p = buildProgress([
      rec(1, { opening: { eco: 'B01', name: 'Scandinavian Defense: Main Line' }, outcome: 'win' }),
      rec(2, { opening: { eco: 'B01', name: 'Scandinavian Defense' }, outcome: 'loss' }),
      rec(3, { opening: { eco: 'C50', name: 'Italian Game' }, myColor: 'b', outcome: 'draw' }),
    ]);
    expect(p.openings[0]).toMatchObject({ name: 'Scandinavian Defense', color: 'w', games: 2, score: 0.5 });
    expect(p.openings[1]).toMatchObject({ name: 'Italian Game', color: 'b', games: 1, score: 0.5 });
  });

  it('handles an empty library', () => {
    const p = buildProgress([]);
    expect(p.games).toBe(0);
    expect(p.previousAccuracy).toBeNull();
    expect(p.problems).toEqual([]);
  });
});
