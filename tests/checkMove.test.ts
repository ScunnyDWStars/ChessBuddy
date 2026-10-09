import { describe, expect, it } from 'vitest';
import { evaluateAttempt, type AttemptTarget } from '../src/lib/checkMove';
import type { EngineLine } from '../src/lib/types';

// Black to move; Qxd1 wins White's queen.
const target: AttemptTarget = {
  fen: 'rnb1kbnr/pppp1ppp/8/4p3/3qP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 1',
  color: 'b',
  bestUci: 'd4d1',
  playedUci: 'd4b4',
  winBefore: 0.95,
  playedLoss: 0.5,
};
const stub = (cp: number) => ({ analyze: async (): Promise<EngineLine[]> => [{ score: { cp }, pv: [], depth: 1 }] });

describe('evaluateAttempt', () => {
  it('accepts the engine move without asking the engine', async () => {
    const r = await evaluateAttempt(target, 'd4', 'd1', { analyze: () => Promise.reject(new Error('not called')) }, 10);
    expect(r).toMatchObject({ verdict: 'correct', san: 'Qxd1+', loss: 0 });
  });

  it('rejects the move played in the game', async () => {
    expect((await evaluateAttempt(target, 'd4', 'b4', stub(0), 10))?.verdict).toBe('played');
  });

  it('grades other moves by the engine evaluation', async () => {
    // White-POV scores: strongly negative = good for Black.
    expect((await evaluateAttempt(target, 'd4', 'd2', stub(-900), 10))?.verdict).toBe('correct');
    expect((await evaluateAttempt(target, 'd4', 'd2', stub(-600), 10))?.verdict).toBe('close');
    expect((await evaluateAttempt(target, 'd4', 'd2', stub(200), 10))?.verdict).toBe('wrong');
  });

  it('ignores illegal moves', async () => {
    expect(await evaluateAttempt(target, 'd4', 'h1', stub(0), 10)).toBeNull();
  });
});
