import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { GameHeaders, ParsedGame, PlyInfo } from './types';

/** Splits a PGN file that may contain several games. */
export function splitPgn(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '').trim();
  if (!normalized) return [];
  const parts: string[] = [];
  let current: string[] = [];
  let seenMoves = false;
  for (const line of normalized.split('\n')) {
    const isHeader = /^\s*\[\w+\s+".*"\]\s*$/.test(line);
    if (isHeader && seenMoves) {
      parts.push(current.join('\n').trim());
      current = [];
      seenMoves = false;
    }
    if (!isHeader && line.trim()) seenMoves = true;
    current.push(line);
  }
  if (current.join('').trim()) parts.push(current.join('\n').trim());
  return parts;
}

function parseClock(comment: string | undefined): number | undefined {
  const m = comment?.match(/\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/);
  if (!m) return undefined;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

const clean = (v: string | undefined): string | undefined => (v && v !== '?' && v !== '????.??.??' && v !== '-' ? v : undefined);

/** Parses a single PGN game. Throws a readable error for invalid input. */
export function parsePgn(pgn: string): ParsedGame {
  const chess = new Chess();
  let text = pgn.trim();
  // Accept bare move lists without headers.
  if (!text.startsWith('[')) text = `[Event "?"]\n\n${text}`;
  try {
    chess.loadPgn(text, { strict: false });
  } catch (e) {
    throw new Error(`Could not read this PGN: ${(e as Error).message}`);
  }
  const verbose = chess.history({ verbose: true });
  if (verbose.length === 0) throw new Error('This PGN has no moves to review.');

  const h = chess.getHeaders();
  const clocks = new Map<string, string>();
  for (const c of chess.getComments()) clocks.set(c.fen, c.comment);

  const moves: PlyInfo[] = verbose.map((m, i) => {
    const fenParts = m.before.split(' ');
    return {
      ply: i + 1,
      moveNumber: Number(fenParts[5]) || Math.floor(i / 2) + 1,
      color: m.color,
      san: m.san,
      uci: m.lan,
      from: m.from,
      to: m.to,
      piece: m.piece,
      captured: m.captured,
      promotion: m.promotion,
      fenBefore: m.before,
      fenAfter: m.after,
      clock: parseClock(clocks.get(m.after)),
    };
  });

  const headers: GameHeaders = {
    white: clean(h.White) ?? 'White',
    black: clean(h.Black) ?? 'Black',
    whiteElo: clean(h.WhiteElo),
    blackElo: clean(h.BlackElo),
    result: clean(h.Result) ?? '*',
    date: clean(h.Date) ?? clean(h.UTCDate),
    event: clean(h.Event),
    site: clean(h.Site),
    timeControl: clean(h.TimeControl),
    termination: clean(h.Termination),
    link: clean(h.Link) ?? (clean(h.Site)?.startsWith('http') ? clean(h.Site) : undefined),
  };

  return { headers, startFen: verbose[0].before ?? DEFAULT_POSITION, moves, pgn: pgn.trim() };
}

/** Initial clock in seconds from a TimeControl header like "180+2" or "600". */
export function baseTimeSeconds(timeControl: string | undefined): number | undefined {
  const m = timeControl?.match(/^(\d+)(?:\+\d+)?$/);
  return m ? Number(m[1]) : undefined;
}
