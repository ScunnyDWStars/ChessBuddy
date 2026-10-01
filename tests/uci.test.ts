import { describe, expect, it } from 'vitest';
import { LineCollector, MATE_CP, parseInfoLine, toWhiteScore } from '../src/lib/engine/uci';

describe('parseInfoLine', () => {
  it('parses multipv cp lines', () => {
    const info = parseInfoLine('info depth 16 seldepth 23 multipv 2 score cp -27 nodes 1 nps 1 hashfull 94 time 561 pv e7e6 d2d4 d7d5');
    expect(info).toMatchObject({ depth: 16, multipv: 2, scoreType: 'cp', scoreValue: -27, pv: ['e7e6', 'd2d4', 'd7d5'] });
  });

  it('parses mate scores and bounds', () => {
    expect(parseInfoLine('info depth 3 multipv 1 score mate 1 lowerbound nodes 9 pv h5f7')).toMatchObject({
      scoreType: 'mate',
      scoreValue: 1,
      bound: 'lower',
    });
  });

  it('ignores non-search lines', () => {
    expect(parseInfoLine('info string NNUE evaluation using nn.nnue')).toBeNull();
    expect(parseInfoLine('bestmove e2e4')).toBeNull();
  });
});

describe('toWhiteScore', () => {
  it('flips the sign when Black is to move', () => {
    expect(toWhiteScore('cp', 50, 'w')).toEqual({ cp: 50 });
    expect(toWhiteScore('cp', 50, 'b')).toEqual({ cp: -50 });
  });

  it('maps mates to large centipawn values', () => {
    expect(toWhiteScore('mate', 2, 'w')).toEqual({ cp: MATE_CP - 2, mate: 2 });
    expect(toWhiteScore('mate', 2, 'b')).toEqual({ cp: -(MATE_CP - 2), mate: -2 });
    expect(toWhiteScore('mate', -1, 'b')).toEqual({ cp: MATE_CP - 1, mate: 1 });
  });
});

describe('LineCollector', () => {
  it('keeps the deepest line per multipv slot', () => {
    const c = new LineCollector();
    c.push('info depth 10 multipv 1 score cp 20 nodes 1 pv e2e4');
    c.push('info depth 10 multipv 2 score cp 10 nodes 1 pv d2d4');
    c.push('info depth 11 multipv 1 score cp 25 nodes 1 pv e2e4 e7e5');
    c.push('info depth 11 multipv 2 score cp 12 nodes 1 pv d2d4 d7d5');
    const lines = c.result('w');
    expect(lines.map((l) => l.score.cp)).toEqual([25, 12]);
    expect(lines[0].pv).toEqual(['e2e4', 'e7e5']);
  });
});
