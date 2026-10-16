import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyMove,
  currentFen,
  liveGameFrom,
  loadLiveGame,
  needsPromotion,
  newLiveGame,
  saveLiveGame,
  status,
  toPgn,
  undo,
  type LiveGame,
} from '../src/lib/liveGame';

const play = (game: LiveGame, ...uci: string[]) =>
  uci.reduce<LiveGame>((g, m) => {
    const next = applyMove(g, m.slice(0, 2), m.slice(2, 4), m[4]);
    if (!next) throw new Error(`illegal ${m}`);
    return next;
  }, game);

describe('live game', () => {
  it('plays legal moves for both sides and rejects illegal ones', () => {
    const g = play(newLiveGame(), 'e2e4', 'e7e5');
    expect(g.moves.map((m) => m.san)).toEqual(['e4', 'e5']);
    expect(status(g)).toEqual({ state: 'playing', turn: 'w', check: false });
    expect(applyMove(g, 'e4', 'e6')).toBeNull();
    expect(applyMove(g, 'e5', 'e4')).toBeNull(); // not White's piece to move
  });

  it('detects checkmate and stops accepting moves', () => {
    const g = play(newLiveGame(), 'e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7');
    expect(g.moves.at(-1)?.san).toBe('Qxf7#');
    expect(status(g)).toEqual({ state: 'checkmate', winner: 'w', result: '1-0' });
    expect(applyMove(g, 'a7', 'a6')).toBeNull();
    expect(toPgn(g)).toContain('[Result "1-0"]');
  });

  it('detects stalemate and threefold repetition', () => {
    expect(status(liveGameFrom('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toMatchObject({ state: 'draw', reason: 'stalemate' });
    const g = play(newLiveGame(), 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8');
    expect(status(g)).toMatchObject({ state: 'draw', reason: 'threefold repetition' });
  });

  it('handles promotion choice', () => {
    const g = liveGameFrom('7k/P7/8/8/8/8/8/K7 w - - 0 1');
    expect(needsPromotion(currentFen(g), 'a7', 'a8')).toBe(true);
    expect(needsPromotion(currentFen(g), 'a1', 'a2')).toBe(false);
    expect(play(g, 'a7a8n').moves[0].san).toBe('a8=N');
  });

  it('undoes moves', () => {
    const g = play(newLiveGame(), 'e2e4', 'e7e5');
    expect(undo(g).moves.map((m) => m.san)).toEqual(['e4']);
    expect(currentFen(undo(undo(g)))).toBe(newLiveGame().startFen);
  });

  it('starts from a pasted PGN or FEN', () => {
    expect(liveGameFrom('1. d4 d5 2. c4').moves.map((m) => m.san)).toEqual(['d4', 'd5', 'c4']);
    expect(() => liveGameFrom('nonsense')).toThrow();
  });
});

describe('persistence', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => data.set(k, v),
      removeItem: (k: string) => data.delete(k),
    });
  });

  it('saves and restores the game', () => {
    const g = play(newLiveGame(), 'e2e4', 'c7c5');
    saveLiveGame(g);
    expect(loadLiveGame()?.moves.map((m) => m.san)).toEqual(['e4', 'c5']);
    localStorage.setItem('chessbuddy:live', '{broken');
    expect(loadLiveGame()).toBeNull();
  });
});
