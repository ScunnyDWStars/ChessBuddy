import type { Color } from './types';
import { pgnFromChessComCallback, pgnFromSanList, type ChessComCallback } from './chesscom';

/**
 * What the browser extension's content script hands over when you click
 * "Review with ChessBuddy" on Chess.com or Lichess.
 */
export type ImportPayload = {
  /** Board orientation on the site (your side is at the bottom). */
  perspective?: Color;
  url?: string;
} & (
  | { kind: 'pgn'; data: string }
  | { kind: 'chesscom-callback'; data: ChessComCallback }
  | { kind: 'san-list'; data: { sans: string[]; headers?: Record<string, string | undefined> } }
);

export interface ExtensionImport {
  pgn: string;
  perspective?: Color;
  usernames: string[];
}

interface StorageArea {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

type StorageChange = Record<string, { newValue?: unknown; oldValue?: unknown }>;

interface ChromeLike {
  runtime?: { id?: string };
  storage?: {
    session?: StorageArea;
    sync?: StorageArea;
    local?: StorageArea;
    onChanged?: {
      addListener(cb: (changes: StorageChange, area: string) => void): void;
      removeListener(cb: (changes: StorageChange, area: string) => void): void;
    };
  };
  action?: { setBadgeText(d: { text: string }): Promise<void> };
}

/** A finished game the extension saved for background analysis. */
export interface QueuedGame {
  id: string;
  queuedAt: number;
  payload: ImportPayload;
}

const QUEUE_KEY = 'pendingGames';

const chromeApi = (): ChromeLike | undefined => (globalThis as { chrome?: ChromeLike }).chrome;

/** True when the app runs as the extension's review page. */
export const isExtensionPage = () => !!chromeApi()?.runtime?.id && location.protocol === 'chrome-extension:';

export function payloadToPgn(payload: ImportPayload): string {
  switch (payload.kind) {
    case 'pgn':
      return payload.data;
    case 'chesscom-callback':
      return pgnFromChessComCallback(payload.data);
    case 'san-list':
      return pgnFromSanList(payload.data.sans, payload.data.headers);
  }
}

/** Usernames saved in the extension popup, used to pick which side to review. */
export async function savedUsernames(): Promise<string[]> {
  try {
    const sync = chromeApi()?.storage?.sync;
    if (!sync) return [];
    const { chesscomUser, lichessUser } = (await sync.get(['chesscomUser', 'lichessUser'])) as Record<string, string | undefined>;
    return [chesscomUser, lichessUser].filter((u): u is string => !!u?.trim()).map((u) => u.trim());
  } catch {
    return [];
  }
}

/**
 * Reads (and clears) a game handed over by the extension. The background
 * worker stores it in session storage and opens `review.html#import=<key>`.
 */
export async function takeExtensionImport(): Promise<ExtensionImport | null> {
  const key = location.hash.match(/^#import=([\w-]+)$/)?.[1];
  const session = chromeApi()?.storage?.session;
  if (!key || !session) return null;
  const stored = (await session.get(key))[key] as ImportPayload | undefined;
  if (!stored) return null;
  await session.remove(key).catch(() => {});
  history.replaceState(null, '', location.pathname);
  return { pgn: payloadToPgn(stored), perspective: stored.perspective, usernames: await savedUsernames() };
}

/** Games waiting to be analysed (saved by the extension's auto-save option). */
export async function readQueue(): Promise<QueuedGame[]> {
  const local = chromeApi()?.storage?.local;
  if (!local) return [];
  return ((await local.get(QUEUE_KEY))[QUEUE_KEY] as QueuedGame[] | undefined) ?? [];
}

export async function removeFromQueue(id: string): Promise<number> {
  const local = chromeApi()?.storage?.local;
  if (!local) return 0;
  const rest = (await readQueue()).filter((g) => g.id !== id);
  await local.set({ [QUEUE_KEY]: rest });
  await chromeApi()
    ?.action?.setBadgeText({ text: rest.length ? String(rest.length) : '' })
    .catch(() => {});
  return rest.length;
}

/** Calls `cb` whenever the extension adds games to the queue. Returns an unsubscribe function. */
export function onQueueChanged(cb: () => void): () => void {
  const events = chromeApi()?.storage?.onChanged;
  if (!events) return () => {};
  const listener = (changes: StorageChange, area: string) => {
    if (area === 'local' && QUEUE_KEY in changes) cb();
  };
  events.addListener(listener);
  return () => events.removeListener(listener);
}
