import { describe, expect, it } from 'vitest';
import { baseTimeSeconds, parsePgn, splitPgn } from '../src/lib/pgn';

const GAME = `[Event "Live Chess"]
[White "alice"]
[Black "bob"]
[Result "1-0"]
[WhiteElo "1500"]
[TimeControl "180+2"]

1. e4 {[%clk 0:02:59.9]} e5 {[%clk 0:02:58]} 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

describe('parsePgn', () => {
  it('reads headers, moves and clocks', () => {
    const g = parsePgn(GAME);
    expect(g.headers).toMatchObject({ white: 'alice', black: 'bob', whiteElo: '1500', result: '1-0' });
    expect(g.moves).toHaveLength(7);
    expect(g.moves[0]).toMatchObject({ ply: 1, moveNumber: 1, color: 'w', san: 'e4', uci: 'e2e4', clock: 179.9 });
    expect(g.moves[1].clock).toBe(178);
    expect(g.moves[6]).toMatchObject({ san: 'Qxf7#', captured: 'p', moveNumber: 4 });
  });

  it('accepts bare move text', () => {
    const g = parsePgn('1. d4 d5 2. c4');
    expect(g.moves.map((m) => m.san)).toEqual(['d4', 'd5', 'c4']);
    expect(g.headers.white).toBe('White');
  });

  it('rejects illegal games with a readable error', () => {
    expect(() => parsePgn('1. e4 e5 2. Ke3 Ke6 3. Qxh8')).toThrow(/Could not read/);
    expect(() => parsePgn('[Event "x"]\n\n*')).toThrow(/no moves/);
  });
});

describe('splitPgn', () => {
  it('splits multi-game files', () => {
    expect(splitPgn(`${GAME}\n\n${GAME}\n`)).toHaveLength(2);
    expect(splitPgn('')).toHaveLength(0);
  });
});

it('reads base time from TimeControl', () => {
  expect(baseTimeSeconds('180+2')).toBe(180);
  expect(baseTimeSeconds('600')).toBe(600);
  expect(baseTimeSeconds('-')).toBeUndefined();
});
