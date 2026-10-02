import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { encodeTCN } from 'chess-tcn';
import { parsePgn } from '../src/lib/pgn';
import { pgnFromChessComCallback, pgnFromSanList, type ChessComCallback } from '../src/lib/chesscom';
import { payloadToPgn } from '../src/lib/extensionBridge';

const game = parsePgn(readFileSync(new URL('./fixtures/chesscom-2026-09-26.pgn', import.meta.url), 'utf8'));

/** A Chess.com callback response for the fixture game, as the site would send it. */
function callbackFor(moveTimestamps?: string): ChessComCallback {
  return {
    game: {
      id: 184417466488,
      isFinished: true,
      moveList: encodeTCN(game.moves.map((m) => ({ from: m.from, to: m.to }))),
      moveTimestamps,
      pgnHeaders: {
        Event: 'Live Chess',
        Site: 'Chess.com',
        White: 'ChessManDan1888',
        Black: 'FreeGreenland',
        Result: '1-0',
        WhiteElo: 1242,
        BlackElo: 1217,
        TimeControl: '180',
      },
    },
  };
}

describe('Chess.com game data → PGN', () => {
  it('rebuilds the moves and headers', () => {
    const parsed = parsePgn(pgnFromChessComCallback(callbackFor()));
    expect(parsed.moves.map((m) => m.san)).toEqual(game.moves.map((m) => m.san));
    expect(parsed.headers).toMatchObject({ white: 'ChessManDan1888', black: 'FreeGreenland', whiteElo: '1242', result: '1-0' });
  });

  it('adds clock times when they look valid', () => {
    const clocks = game.moves.map((_, i) => 1800 - i * 15).join(',');
    const parsed = parsePgn(pgnFromChessComCallback(callbackFor(clocks)));
    expect(parsed.moves[0].clock).toBe(180);
    expect(parsed.moves[2].clock).toBe(177);
  });

  it('ignores clock data that is not remaining time', () => {
    const bogus = game.moves.map(() => 999999).join(',');
    expect(parsePgn(pgnFromChessComCallback(callbackFor(bogus))).moves[0].clock).toBeUndefined();
    expect(parsePgn(pgnFromChessComCallback(callbackFor('1,2,3'))).moves[0].clock).toBeUndefined();
  });

  it('handles promotions', () => {
    const json: ChessComCallback = {
      game: { moveList: encodeTCN([{ from: 'a7', to: 'a8', promotion: 'q' }]), pgnHeaders: { SetUp: '1', FEN: '7k/P7/8/8/8/8/8/K7 w - - 0 1' } },
    };
    const parsed = parsePgn(pgnFromChessComCallback(json));
    expect(parsed.moves[0].san).toBe('a8=Q+');
  });

  it('rejects responses without moves', () => {
    expect(() => pgnFromChessComCallback({})).toThrow(/did not return the moves/);
  });
});

describe('extension payloads', () => {
  it('converts every payload kind to PGN', () => {
    expect(payloadToPgn({ kind: 'pgn', data: '1. e4 e5' })).toBe('1. e4 e5');
    const fromSans = parsePgn(payloadToPgn({ kind: 'san-list', data: { sans: ['e4', 'e5', 'Nf3!'], headers: { White: 'me' } } }));
    expect(fromSans.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3']);
    expect(fromSans.headers.white).toBe('me');
    expect(() => pgnFromSanList(['e4', 'Ke7'])).toThrow(/move 2/);
  });
});
