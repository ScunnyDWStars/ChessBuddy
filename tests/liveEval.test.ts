import { describe, expect, it } from 'vitest';
import { createLiveEvaluator, type LiveEval } from '../src/lib/liveEval';
import { describeEval } from '../src/lib/scoring';
import type { EngineLine } from '../src/lib/types';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const MATED = 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4';

/** Engine stub: answers after the test releases it, with a full engine line (pv included). */
function stubEngine() {
  const calls: { fen: string; depth: number; release: () => void }[] = [];
  return {
    calls,
    analyze: (fen: string, { depth }: { depth: number }) =>
      new Promise<EngineLine[]>((resolve) => {
        calls.push({ fen, depth, release: () => resolve([{ score: { cp: 30 + depth }, pv: ['e7e5', 'g1f3'], depth }]) });
      }),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('live evaluator', () => {
  it('reports a quick then a deeper evaluation — and never a move', async () => {
    const engine = stubEngine();
    const out: LiveEval[] = [];
    const ev = createLiveEvaluator(engine, (e) => out.push(e), { quickDepth: 8, deepDepth: 16 });
    ev.setPosition(START);
    await tick();
    engine.calls[0].release();
    await tick();
    engine.calls[1].release();
    await tick();
    expect(out.map((e) => [e.depth, e.score.cp, e.final])).toEqual([
      [8, 38, false],
      [16, 46, true],
    ]);
    for (const e of out) {
      expect(Object.keys(e).sort()).toEqual(['depth', 'fen', 'final', 'score']);
      expect(Object.keys(e.score)).toEqual(['cp']);
      expect(JSON.stringify(e)).not.toContain('e7e5');
    }
  });

  it('drops stale positions and only analyses the latest of quick moves', async () => {
    const engine = stubEngine();
    const out: LiveEval[] = [];
    const ev = createLiveEvaluator(engine, (e) => out.push(e));
    ev.setPosition(START);
    await tick();
    ev.setPosition(AFTER_E4);
    ev.setPosition(AFTER_E5); // e4 is never searched
    engine.calls[0].release(); // START's quick search finishes, but it is stale now
    for (let i = 0; i < 4; i++) {
      await tick();
      engine.calls.at(-1)!.release();
    }
    await tick();
    expect(engine.calls.map((c) => c.fen)).toEqual([START, AFTER_E5, AFTER_E5]);
    expect(out.every((e) => e.fen === AFTER_E5)).toBe(true);
  });

  it('scores finished games without the engine', async () => {
    const engine = stubEngine();
    const out: LiveEval[] = [];
    createLiveEvaluator(engine, (e) => out.push(e)).setPosition(MATED);
    await tick();
    expect(engine.calls).toHaveLength(0);
    expect(out[0]).toMatchObject({ depth: 0, final: true, score: { mate: 0 } });
    expect(out[0].score.cp).toBeGreaterThan(0);
  });
});

describe('describeEval', () => {
  it('puts the evaluation into words', () => {
    expect(describeEval({ cp: 10 })).toBe('Equal position');
    expect(describeEval({ cp: 80 })).toBe('White is slightly better');
    expect(describeEval({ cp: -180 })).toBe('Black is better');
    expect(describeEval({ cp: 400 })).toBe('White is much better');
    expect(describeEval({ cp: -900 })).toBe('Black is winning');
    expect(describeEval({ cp: -99_997, mate: -3 })).toBe('Black mates in 3');
    expect(describeEval({ cp: 100_000, mate: 0 })).toBe('Checkmate — White wins');
  });
});
