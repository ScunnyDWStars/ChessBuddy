import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSiteUsernames, localUsernames, setSiteUsername } from '../src/lib/library';

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => data.set(k, String(v)),
    removeItem: (k: string) => data.delete(k),
  });
});

describe('saved usernames', () => {
  it('migrates the old single field into the Chess.com username', () => {
    localStorage.setItem('chessbuddy:usernames', 'ChessManDan1888, You');
    expect(getSiteUsernames()).toEqual({ chesscom: 'ChessManDan1888', lichess: '' });
    expect(localStorage.getItem('chessbuddy:usernames')).toBeNull();
  });

  it('stores each site separately', () => {
    setSiteUsername('chesscom', ' Dan ');
    setSiteUsername('lichess', 'dan_li');
    expect(getSiteUsernames()).toEqual({ chesscom: 'Dan', lichess: 'dan_li' });
    expect(localUsernames()).toEqual(['Dan', 'dan_li']);
  });
});
