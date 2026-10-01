import { epd } from './chessUtils';

export type OpeningBook = Record<string, 0 | [string, string]>;

let bookPromise: Promise<OpeningBook> | null = null;

/** Lazily loads the opening book (≈7.8k positions from lichess' CC0 opening list). */
export function loadOpeningBook(): Promise<OpeningBook> {
  bookPromise ??= import('../data/openings.json').then((m) => m.default as unknown as OpeningBook);
  return bookPromise;
}

export function lookupOpening(book: OpeningBook, fen: string): { inBook: boolean; eco?: string; name?: string } {
  const entry = book[epd(fen)];
  if (entry === undefined) return { inBook: false };
  if (entry === 0) return { inBook: true };
  return { inBook: true, eco: entry[0], name: entry[1] };
}
