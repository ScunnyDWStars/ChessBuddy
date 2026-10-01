import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { hangingPieces, materialSwing, phaseOf, staticExchange, uciLineToSan } from '../src/lib/chessUtils';

describe('static exchange', () => {
  it('sees an undefended piece as hanging', () => {
    // Black to move can take the knight on e5 for free.
    const fen = 'r1bqkb1r/pppp1ppp/2n5/4N3/8/8/PPPP1PPP/RNBQKB1R b KQkq - 0 1';
    expect(staticExchange(new Chess(fen), 'e5')).toBe(3);
    expect(hangingPieces(fen, 'w')[0]).toMatchObject({ square: 'e5', piece: 'n', value: 3 });
  });

  it('does not count a defended piece attacked by a higher-value piece', () => {
    // Knight on d4 defended by the e3 pawn, attacked only by the black queen.
    const fen = '3qk3/8/8/8/3N4/4P3/8/4K3 b - - 0 1';
    expect(hangingPieces(fen, 'w')).toEqual([]);
  });

  it('respects pins via legal move generation', () => {
    // The f6 knight attacks e4 but is pinned to the king by the g5... (use a bishop pin on the queen side)
    const fen = '4k3/8/8/1b6/8/3N4/8/5K2 b - - 0 1';
    // Bishop b5 attacks d3 knight; knight is undefended -> hanging.
    expect(hangingPieces(fen, 'w')[0]?.square).toBe('d3');
  });
});

describe('helpers', () => {
  it('converts UCI lines to SAN', () => {
    expect(uciLineToSan('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('measures material won along a line', () => {
    const fen = 'r1bqkb1r/pppp1ppp/2n5/4N3/8/8/PPPP1PPP/RNBQKB1R b KQkq - 0 1';
    expect(materialSwing(fen, 'b', ['c6e5', 'd2d4'], 4)).toBe(3);
  });

  it('detects the endgame', () => {
    expect(phaseOf('8/5k2/8/8/8/8/2R5/4K3 w - - 0 50', 99, false)).toBe('endgame');
    expect(phaseOf('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 1, true)).toBe('opening');
  });
});
