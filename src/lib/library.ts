import type { ClassCounts, Color, GameHeaders, GameReview, Phase } from './types';
import { dbGet, dbGetAll, dbGetAllByIndex, dbWrite } from './db';
import { puzzlesFromReview, type Puzzle } from './puzzles';
import { listRecent, loadReview, reviewKey, saveReview } from './storage';
import { savedUsernames } from './extensionBridge';

/** Compact per-game summary for the Progress dashboard. */
export interface GameRecord {
  key: string;
  savedAt: number;
  /** Epoch ms of the game (from the PGN date), else when it was saved. */
  playedAt: number;
  date?: string;
  site?: string;
  link?: string;
  white: string;
  black: string;
  whiteElo?: string;
  blackElo?: string;
  result: string;
  myColor: Color;
  /** How `myColor` was decided: a saved username matched, or the side you chose. */
  colorSource: 'username' | 'chosen';
  outcome: 'win' | 'loss' | 'draw' | 'unknown';
  accuracy: number;
  opponentAccuracy: number;
  estimatedRating: number;
  counts: ClassCounts;
  phases: Record<Phase, number | null>;
  opening?: { eco: string; name: string };
  /** Improvement-plan items flagged for you in this game (insights.ts ids). */
  problems: string[];
  plies: number;
}

const USERNAMES_KEY = 'chessbuddy:usernames';

/** Usernames typed on the Load page (web) — stored locally. */
export function localUsernames(): string[] {
  try {
    return (localStorage.getItem(USERNAMES_KEY) ?? '')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function setLocalUsernames(names: string): void {
  try {
    localStorage.setItem(USERNAMES_KEY, names);
  } catch {
    /* best effort */
  }
}

/** Every username known to be yours (web setting + extension popup). */
export async function knownUsernames(): Promise<string[]> {
  return [...new Set([...localUsernames(), ...(await savedUsernames())])];
}

/** Which side you played: a matching username wins, else the hint (or White). */
export function pickSide(headers: GameHeaders, usernames: string[], hint?: Color): { color: Color; source: GameRecord['colorSource'] } {
  const users = usernames.map((u) => u.trim().toLowerCase()).filter(Boolean);
  if (users.includes(headers.black.toLowerCase())) return { color: 'b', source: 'username' };
  if (users.includes(headers.white.toLowerCase())) return { color: 'w', source: 'username' };
  return { color: hint ?? 'w', source: 'chosen' };
}

function playedAt(date: string | undefined, fallback: number): number {
  const m = date?.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : fallback;
}

function outcomeFor(result: string, color: Color): GameRecord['outcome'] {
  if (result === '1/2-1/2' || result === '½-½') return 'draw';
  if (result === '1-0') return color === 'w' ? 'win' : 'loss';
  if (result === '0-1') return color === 'b' ? 'win' : 'loss';
  return 'unknown';
}

export function buildRecord(review: GameReview, myColor: Color, colorSource: GameRecord['colorSource'], now = Date.now()): GameRecord {
  const h = review.game.headers;
  const me = review.summary[myColor];
  const them = review.summary[myColor === 'w' ? 'b' : 'w'];
  return {
    key: reviewKey(review.game.pgn, review.depth),
    savedAt: now,
    playedAt: playedAt(h.date, now),
    date: h.date,
    site: h.site,
    link: h.link,
    white: h.white,
    black: h.black,
    whiteElo: h.whiteElo,
    blackElo: h.blackElo,
    result: h.result,
    myColor,
    colorSource,
    outcome: outcomeFor(h.result, myColor),
    accuracy: me.accuracy,
    opponentAccuracy: them.accuracy,
    estimatedRating: me.estimatedRating,
    counts: me.counts,
    phases: me.phases,
    opening: review.opening,
    problems: review.insights[myColor].filter((i) => i.severity !== 'positive').map((i) => i.id),
    plies: review.moves.length,
  };
}

/**
 * Saves a finished review to your library: the review itself, its dashboard
 * record and a puzzle for each of your mistakes. Existing puzzles keep their
 * practice history. Falls back to the small localStorage cache if IndexedDB
 * is unavailable (e.g. some private windows).
 */
export async function recordGame(review: GameReview, myColor: Color, colorSource: GameRecord['colorSource']): Promise<GameRecord | null> {
  const record = buildRecord(review, myColor, colorSource);
  try {
    const existing = await dbGetAllByIndex<Puzzle>('puzzles', 'gameKey', record.key);
    const keep = new Map(existing.map((p) => [p.id, p]));
    const fresh = puzzlesFromReview(review, myColor, record.key).map((p) => (keep.has(p.id) ? { ...p, srs: keep.get(p.id)!.srs, createdAt: keep.get(p.id)!.createdAt } : p));
    const freshIds = new Set(fresh.map((p) => p.id));
    await dbWrite([
      { store: 'reviews', put: review, key: record.key },
      { store: 'games', put: record },
      ...existing.filter((p) => !freshIds.has(p.id)).map((p) => ({ store: 'puzzles' as const, delete: p.id })),
      ...fresh.map((p) => ({ store: 'puzzles' as const, put: p })),
    ]);
    return record;
  } catch {
    saveReview(review);
    return null;
  }
}

/** All your games, oldest first. */
export async function listGames(): Promise<GameRecord[]> {
  try {
    const games = await dbGetAll<GameRecord>('games');
    return games.sort((a, b) => a.playedAt - b.playedAt || a.savedAt - b.savedAt);
  } catch {
    return [];
  }
}

export async function getReview(key: string): Promise<GameReview | undefined> {
  try {
    return (await dbGet<GameReview>('reviews', key)) ?? loadReview(key) ?? undefined;
  } catch {
    return loadReview(key) ?? undefined;
  }
}

export async function getGame(key: string): Promise<GameRecord | undefined> {
  try {
    return await dbGet<GameRecord>('games', key);
  } catch {
    return undefined;
  }
}

/** Changes which side is yours for a saved game (rebuilds its record and puzzles). */
export async function setMyColor(key: string, color: Color): Promise<GameRecord | null> {
  const review = await getReview(key);
  if (!review) return null;
  return recordGame(review, color, 'chosen');
}

export async function deleteGame(key: string): Promise<void> {
  const puzzles = await dbGetAllByIndex<Puzzle>('puzzles', 'gameKey', key);
  await dbWrite([
    { store: 'reviews', delete: key },
    { store: 'games', delete: key },
    ...puzzles.map((p) => ({ store: 'puzzles' as const, delete: p.id })),
  ]);
}

export async function listPuzzles(): Promise<Puzzle[]> {
  try {
    return await dbGetAll<Puzzle>('puzzles');
  } catch {
    return [];
  }
}

export async function savePuzzle(puzzle: Puzzle): Promise<void> {
  await dbWrite([{ store: 'puzzles', put: puzzle }]);
}

/** Moves reviews cached by earlier versions (localStorage) into the library, once. */
export async function migrateLegacyReviews(): Promise<void> {
  const MIGRATED = 'chessbuddy:migrated-v1';
  try {
    if (localStorage.getItem(MIGRATED)) return;
    const usernames = await knownUsernames();
    for (const r of listRecent()) {
      const review = loadReview(r.key);
      // Skip reviews made with an older scoring model (stale accuracy).
      if (!review || reviewKey(review.game.pgn, review.depth) !== r.key) continue;
      const side = pickSide(review.game.headers, usernames);
      await recordGame(review, side.color, side.source);
    }
    localStorage.setItem(MIGRATED, '1');
  } catch {
    /* try again next time */
  }
}
