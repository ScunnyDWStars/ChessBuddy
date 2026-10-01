import { Chess, type Square, type PieceSymbol, type Color as ChessColor } from 'chess.js';
import type { Color, Phase } from './types';

export const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const PIECE_NAME: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

export function sideToMove(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

/** First four FEN fields — identifies a position for opening-book lookups. */
export function epd(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function parseUci(uci: string): { from: string; to: string; promotion?: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined };
}

/** Converts a UCI line to SAN, stopping at the first illegal move. */
export function uciLineToSan(fen: string, uciMoves: string[], max = 12): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of uciMoves.slice(0, max)) {
    try {
      out.push(chess.move(parseUci(uci)).san);
    } catch {
      break;
    }
  }
  return out;
}

export function uciToSan(fen: string, uci: string): string {
  return uciLineToSan(fen, [uci], 1)[0] ?? uci;
}

/** Material from `color`'s perspective (own minus opponent), in pawn units. */
export function materialBalance(chess: Chess, color: Color): number {
  let sum = 0;
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p) continue;
      sum += (p.color === color ? 1 : -1) * PIECE_VALUE[p.type];
    }
  }
  return sum;
}

/**
 * Static exchange evaluation: material the side to move can win by starting a
 * capture sequence on `square`, assuming both sides may stop at any time.
 * Uses legal move generation so pins and king safety are respected.
 */
export function staticExchange(chess: Chess, square: Square, depth = 0): number {
  const target = chess.get(square);
  if (!target || depth > 12) return 0;
  const captures = chess
    .moves({ verbose: true })
    .filter((m) => m.to === square && m.captured)
    .sort((a, b) => PIECE_VALUE[a.piece] - PIECE_VALUE[b.piece] || (a.promotion ? 1 : 0) - (b.promotion ? 1 : 0));
  if (captures.length === 0) return 0;
  const m = captures[0];
  chess.move(m);
  const gain = PIECE_VALUE[target.type] + (m.promotion ? PIECE_VALUE[m.promotion] - 1 : 0) - staticExchange(chess, square, depth + 1);
  chess.undo();
  return Math.max(0, gain);
}

export interface Hanging {
  square: string;
  piece: string;
  value: number;
}

/**
 * Pieces of `color` that the opponent (who must be to move in `fen`) can win
 * material against via a capture sequence. Sorted by value lost, largest first.
 */
export function hangingPieces(fen: string, color: Color, minValue = 1): Hanging[] {
  const chess = new Chess(fen);
  if (chess.turn() === color) return [];
  const out: Hanging[] = [];
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== color || p.type === 'k') continue;
      const value = staticExchange(chess, p.square);
      if (value >= minValue) out.push({ square: p.square, piece: p.type, value });
    }
  }
  return out.sort((a, b) => b.value - a.value);
}

/** Count of queens, rooks, bishops and knights on the board (both sides). */
function majorsAndMinors(chess: Chess): number {
  let n = 0;
  for (const row of chess.board()) for (const p of row) if (p && p.type !== 'p' && p.type !== 'k') n++;
  return n;
}

function backRankSparse(chess: Chess): boolean {
  const board = chess.board();
  const count = (rank: (typeof board)[number], color: ChessColor) => rank.filter((p) => p && p.color === color).length;
  return count(board[7], 'w') < 4 || count(board[0], 'b') < 4;
}

/**
 * Game phase of a position, loosely following lichess' "divider":
 * endgame when few pieces remain, middlegame once development is done or
 * pieces have been traded.
 */
export function phaseOf(fen: string, ply: number, inBook: boolean): Phase {
  const chess = new Chess(fen);
  const pieces = majorsAndMinors(chess);
  if (pieces <= 6) return 'endgame';
  if (inBook) return 'opening';
  if (pieces <= 10 || backRankSparse(chess) || ply > 24) return 'middlegame';
  return 'opening';
}

/** Material gained by `color` playing the first `plies` moves of a UCI line from `fen`. */
export function materialSwing(fen: string, color: Color, line: string[], plies: number): number {
  const chess = new Chess(fen);
  const start = materialBalance(chess, color);
  let end = start;
  let i = 0;
  for (const uci of line.slice(0, plies)) {
    try {
      chess.move(parseUci(uci));
    } catch {
      break;
    }
    i++;
    // Only measure after the opponent has had the chance to recapture.
    if (chess.turn() === color || i === line.length) end = materialBalance(chess, color);
  }
  return end - start;
}

export function pieceAt(fen: string, square: string): { type: PieceSymbol; color: ChessColor } | undefined {
  const p = new Chess(fen).get(square as Square);
  return p ?? undefined;
}
