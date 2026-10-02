import type { GameReview } from './types';

export interface RecentReview {
  key: string;
  white: string;
  black: string;
  result: string;
  accuracy: [number, number];
  savedAt: number;
}

const INDEX_KEY = 'chessbuddy:recent';
const REVIEW_PREFIX = 'chessbuddy:review:';
const MAX_RECENT = 6;
// Bump when the analysis output changes shape so stale caches are ignored.
const VERSION = 2;

function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export const reviewKey = (pgn: string, depth: number) => `${hash(pgn.trim())}-${depth}-v${VERSION}`;

export function listRecent(): RecentReview[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as RecentReview[]) : [];
  } catch {
    return [];
  }
}

export function loadReview(key: string): GameReview | null {
  try {
    const raw = localStorage.getItem(REVIEW_PREFIX + key);
    return raw ? (JSON.parse(raw) as GameReview) : null;
  } catch {
    return null;
  }
}

/** Caches a finished review so reopening the game is instant. Best effort only. */
export function saveReview(review: GameReview): RecentReview[] {
  const key = reviewKey(review.game.pgn, review.depth);
  const entry: RecentReview = {
    key,
    white: review.game.headers.white,
    black: review.game.headers.black,
    result: review.game.headers.result,
    accuracy: [review.summary.w.accuracy, review.summary.b.accuracy],
    savedAt: Date.now(),
  };
  const list = [entry, ...listRecent().filter((r) => r.key !== key)];
  const kept = list.slice(0, MAX_RECENT);
  try {
    for (const old of list.slice(MAX_RECENT)) localStorage.removeItem(REVIEW_PREFIX + old.key);
    localStorage.setItem(REVIEW_PREFIX + key, JSON.stringify(review));
    localStorage.setItem(INDEX_KEY, JSON.stringify(kept));
  } catch {
    // Storage full or unavailable: the review still works, it just isn't cached.
    return listRecent();
  }
  return kept;
}
