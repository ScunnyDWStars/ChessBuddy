import { findChessComGame, fetchLichessGame } from './importers';

/** What another app shared with ChessBuddy (Android share sheet → manifest share_target). */
export interface SharedParams {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}

export type SharedGame =
  | { kind: 'pgn'; pgn: string }
  | { kind: 'chesscom'; type: 'live' | 'daily'; id: string; username?: string }
  | { kind: 'lichess'; id: string };

const LICHESS_RESERVED = new Set([
  'training', 'analysis', 'streamer', 'tournament', 'practice', 'insights', 'broadcast', 'player', 'paste', 'editor',
]);

function looksLikePgn(text: string): boolean {
  return /\[Event\s+"/.test(text) || /(^|\s)1\.\s*(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8]|O-O)/.test(text);
}

function gameFromUrl(raw: string): SharedGame | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
  if (host === 'chess.com') {
    const m = u.pathname.match(/\/game\/(live|daily)\/(\d+)/) ?? u.pathname.match(/\/game\/(\d+)(?:\/|$)/);
    if (!m) return null;
    const username = u.searchParams.get('username') ?? undefined;
    return m.length === 3
      ? { kind: 'chesscom', type: m[1] as 'live' | 'daily', id: m[2], username }
      : { kind: 'chesscom', type: 'live', id: m[1], username };
  }
  if (host === 'lichess.org') {
    const m = u.pathname.match(/^\/([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{4})?(?:\/(?:white|black))?\/?$/);
    if (!m || LICHESS_RESERVED.has(m[1].toLowerCase())) return null;
    return { kind: 'lichess', id: m[1] };
  }
  return null;
}

/** Works out which game was shared: PGN text, or a Chess.com / Lichess game link. */
export function parseShared(params: SharedParams): SharedGame | null {
  const text = [params.text, params.title].filter(Boolean).join('\n');
  if (text && looksLikePgn(text)) return { kind: 'pgn', pgn: (params.text && looksLikePgn(params.text) ? params.text : text).trim() };
  const candidates = [params.url, ...(text.match(/https?:\/\/\S+/g) ?? [])].filter((x): x is string => !!x);
  for (const c of candidates) {
    const game = gameFromUrl(c.replace(/[)\].,]+$/, ''));
    if (game) return game;
  }
  return null;
}

/** Reads share parameters from the page URL (`?title=&text=&url=`), if any. */
export function sharedFromLocation(search: string): SharedParams | null {
  const q = new URLSearchParams(search);
  if (!q.has('text') && !q.has('url') && !q.has('title')) return null;
  return { title: q.get('title'), text: q.get('text'), url: q.get('url') };
}

/** Fetches the PGN of a shared game. Throws with a message meant for the player. */
export async function fetchSharedGame(game: SharedGame, chesscomUsernames: string[]): Promise<string> {
  if (game.kind === 'pgn') return game.pgn;
  if (game.kind === 'lichess') return fetchLichessGame(game.id);
  const users = [game.username, ...chesscomUsernames].filter((u): u is string => !!u);
  if (!users.length) {
    throw new Error('Add your Chess.com username on the Load page so ChessBuddy can find this game.');
  }
  const pgn = await findChessComGame(game.id, users);
  if (!pgn) throw new Error("Chess.com hasn't published this game yet. Try again in a minute.");
  return pgn;
}
