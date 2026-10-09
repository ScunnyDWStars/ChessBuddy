import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSharedGame, parseShared, sharedFromLocation } from '../src/lib/shareImport';
import { fetchLatestGame, findChessComGame } from '../src/lib/importers';

describe('parseShared', () => {
  it('recognises PGN text', () => {
    expect(parseShared({ text: '[Event "Live Chess"]\n\n1. e4 e5 2. Nf3 *' })).toMatchObject({ kind: 'pgn' });
    expect(parseShared({ text: '1. d4 d5 2. c4 e6' })).toMatchObject({ kind: 'pgn', pgn: '1. d4 d5 2. c4 e6' });
  });

  it('recognises Chess.com links in every form', () => {
    expect(parseShared({ url: 'https://www.chess.com/game/live/184417466488?username=chessmandan1888&move=0' })).toEqual({
      kind: 'chesscom',
      type: 'live',
      id: '184417466488',
      username: 'chessmandan1888',
    });
    expect(parseShared({ url: 'https://www.chess.com/game/daily/123456' })).toMatchObject({ type: 'daily', id: '123456' });
    expect(parseShared({ url: 'https://www.chess.com/game/987654321' })).toMatchObject({ type: 'live', id: '987654321' });
    expect(parseShared({ url: 'https://www.chess.com/analysis/game/live/555?tab=review' })).toMatchObject({ id: '555' });
    // The Chess.com app often puts the link inside the share text.
    expect(parseShared({ text: 'Check out this #chess game: https://www.chess.com/game/live/42 via @chesscom' })).toMatchObject({
      kind: 'chesscom',
      id: '42',
    });
  });

  it('recognises Lichess links', () => {
    expect(parseShared({ url: 'https://lichess.org/AbCd1234' })).toEqual({ kind: 'lichess', id: 'AbCd1234' });
    expect(parseShared({ url: 'https://lichess.org/AbCd1234wxyz' })).toEqual({ kind: 'lichess', id: 'AbCd1234' });
    expect(parseShared({ url: 'https://lichess.org/AbCd1234/black' })).toEqual({ kind: 'lichess', id: 'AbCd1234' });
    expect(parseShared({ url: 'https://lichess.org/training' })).toBeNull();
  });

  it('ignores shares without a game', () => {
    expect(parseShared({ text: 'hello there', url: 'https://example.com/game/live/1' })).toBeNull();
    expect(parseShared({})).toBeNull();
  });

  it('reads share parameters from the page URL', () => {
    expect(sharedFromLocation('?text=hi&url=https%3A%2F%2Flichess.org%2FAbCd1234')).toEqual({
      title: null,
      text: 'hi',
      url: 'https://lichess.org/AbCd1234',
    });
    expect(sharedFromLocation('')).toBeNull();
  });
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('fetching a shared Chess.com game', () => {
  it('looks through this and last month of each player archive', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      if (url.endsWith('/games/2026/10')) return json({ games: [{ url: 'https://www.chess.com/game/live/1', pgn: 'A' }] });
      if (url.endsWith('/games/2026/09')) return json({ games: [{ url: 'https://www.chess.com/game/live/42', pgn: 'FOUND' }] });
      return json({}, 404);
    });
    expect(await findChessComGame('42', ['Me'], new Date(2026, 9, 2))).toBe('FOUND');
    expect(calls[0]).toBe('https://api.chess.com/pub/player/me/games/2026/10');
  });

  it('explains when the game is not in the archive yet, or no username is known', async () => {
    vi.stubGlobal('fetch', async () => json({ games: [] }));
    await expect(fetchSharedGame({ kind: 'chesscom', type: 'live', id: '7', username: 'me' }, [])).rejects.toThrow(/hasn't published/);
    await expect(fetchSharedGame({ kind: 'chesscom', type: 'live', id: '7' }, [])).rejects.toThrow(/username/);
  });

  it('fetches Lichess games from the export endpoint', async () => {
    vi.stubGlobal('fetch', async (url: string) => new Response(url.includes('/game/export/AbCd1234') ? '[Result "1-0"]\n\n1. e4 1-0' : '', { status: 200 }));
    expect(await fetchSharedGame({ kind: 'lichess', id: 'AbCd1234' }, [])).toContain('1. e4');
  });
});

describe('fetchLatestGame', () => {
  it('picks the most recent game across both sites', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.endsWith('/games/archives')) return json({ archives: ['https://api.chess.com/pub/player/me/games/2026/10'] });
      if (url.includes('api.chess.com')) {
        return json({
          games: [{ url: 'u1', pgn: 'CHESSCOM', end_time: 1000, white: { username: 'me', result: 'win' }, black: { username: 'x', result: 'lose' } }],
        });
      }
      const line = JSON.stringify({ id: 'l1', pgn: 'LICHESS', lastMoveAt: 5_000_000, players: { white: { user: { name: 'me' } }, black: { user: { name: 'y' } } } });
      return new Response(line + '\n', { status: 200 });
    });
    const latest = await fetchLatestGame({ chesscom: 'me', lichess: 'me' });
    expect(latest?.pgn).toBe('LICHESS');
    expect((await fetchLatestGame({ chesscom: 'me' }))?.pgn).toBe('CHESSCOM');
    expect(await fetchLatestGame({})).toBeNull();
  });
});
