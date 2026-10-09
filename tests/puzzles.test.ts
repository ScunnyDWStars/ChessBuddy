import { describe, expect, it } from 'vitest';
import { BOX_DAYS, duePuzzles, puzzlesFromReview, schedule, type Puzzle } from '../src/lib/puzzles';
import { fixtureReview } from './helpers';

const DAY = 86_400_000;
const review = fixtureReview();

describe('puzzlesFromReview', () => {
  it("turns the player's mistakes into puzzles", () => {
    const black = puzzlesFromReview(review, 'b', 'g1', 1000);
    // 9...Bd6 (mistake) and 20...Kf8 (blunder) are Black's big errors.
    expect(black.map((p) => p.playedSan)).toEqual(expect.arrayContaining(['Bd6', 'Kf8']));
    const kf8 = black.find((p) => p.playedSan === 'Kf8')!;
    expect(kf8).toMatchObject({ id: 'g1:40', color: 'b', classification: 'blunder', gameKey: 'g1' });
    expect(kf8.fen).toBe(review.moves[39].fenBefore);
    expect(kf8.solution).toBe(review.moves[39].bestMove!.uci);
    expect(kf8.srs).toEqual({ box: 0, due: 1000, attempts: 0, correct: 0 });
    expect(black.every((p) => p.loss >= 0.1)).toBe(true);
  });

  it('only includes your own moves', () => {
    expect(puzzlesFromReview(review, 'w', 'g1').every((p) => p.color === 'w')).toBe(true);
  });
});

describe('spaced repetition', () => {
  const srs = { box: 0, due: 0, attempts: 0, correct: 0 };

  it('moves solved puzzles up a box', () => {
    const s1 = schedule(srs, 'correct', 0);
    expect(s1).toMatchObject({ box: 1, due: BOX_DAYS[1] * DAY, attempts: 1, correct: 1, last: 'correct' });
    const s2 = schedule(s1, 'correct', 0);
    expect(s2.due).toBe(3 * DAY);
    const top = schedule({ ...srs, box: 4 }, 'correct', 0);
    expect(top.box).toBe(4);
  });

  it('sends wrong answers back to the start, due tomorrow', () => {
    expect(schedule({ ...srs, box: 3 }, 'wrong', 0)).toMatchObject({ box: 0, due: DAY, attempts: 1, correct: 0 });
    expect(schedule({ ...srs, box: 3 }, 'hinted', 0)).toMatchObject({ box: 3, due: DAY });
  });

  it('lists due puzzles, least-learned first', () => {
    const mk = (id: string, box: number, due: number, theme: Puzzle['theme'] = 'hanging') =>
      ({ id, theme, createdAt: 0, srs: { box, due, attempts: 0, correct: 0 } }) as Puzzle;
    const list = [mk('a', 2, 5), mk('b', 0, 9), mk('c', 0, 50), mk('d', 1, 1, 'missed-mate')];
    expect(duePuzzles(list, 10).map((p) => p.id)).toEqual(['b', 'd', 'a']);
    expect(duePuzzles(list, 10, 'missed-mate').map((p) => p.id)).toEqual(['d']);
  });
});
