import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { deleteGame, getReview, listGames, listPuzzles, recordGame, savePuzzle, setMyColor } from '../src/lib/library';
import { reviewKey } from '../src/lib/storage';
import { schedule } from '../src/lib/puzzles';
import { fixtureReview } from './helpers';

const review = fixtureReview();
const key = reviewKey(review.game.pgn, review.depth);

describe('game library (IndexedDB)', () => {
  it('records a game with its review and puzzles', async () => {
    const rec = await recordGame(review, 'b', 'username');
    expect(rec?.key).toBe(key);
    expect((await listGames()).map((g) => g.key)).toEqual([key]);
    expect((await getReview(key))?.moves.length).toBe(review.moves.length);
    const puzzles = await listPuzzles();
    expect(puzzles.length).toBeGreaterThan(0);
    expect(puzzles.every((p) => p.color === 'b' && p.gameKey === key)).toBe(true);
  });

  it('keeps practice history when a game is recorded again', async () => {
    const [p] = await listPuzzles();
    await savePuzzle({ ...p, srs: schedule(p.srs, 'correct', 0) });
    await recordGame(review, 'b', 'username');
    expect((await listPuzzles()).find((x) => x.id === p.id)?.srs.correct).toBe(1);
  });

  it('switching side rebuilds the record and puzzles', async () => {
    const rec = await setMyColor(key, 'w');
    expect(rec).toMatchObject({ myColor: 'w', colorSource: 'chosen', outcome: 'win' });
    expect((await listPuzzles()).every((p) => p.color === 'w')).toBe(true);
  });

  it('deletes a game with its puzzles', async () => {
    await deleteGame(key);
    expect(await listGames()).toEqual([]);
    expect(await listPuzzles()).toEqual([]);
  });
});
