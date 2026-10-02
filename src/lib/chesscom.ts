import { Chess, type Square } from 'chess.js';
import { decodeTCN } from 'chess-tcn';

/** The parts of Chess.com's `/callback/{live|daily}/game/{id}` response we use. */
export interface ChessComCallback {
  game?: {
    id?: number;
    moveList?: string;
    pgnHeaders?: Record<string, string | number | undefined>;
    /** Clock after each ply, in tenths of a second (comma separated). */
    moveTimestamps?: string;
    isFinished?: boolean;
  };
}

function formatClock(tenths: number): string {
  const total = tenths / 10;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

/**
 * Parses clock data, or returns null if it doesn't look like remaining time
 * (so a format change can never produce misleading time-trouble advice).
 */
function parseClocks(raw: string | undefined, plies: number, timeControl: string | undefined): number[] | null {
  if (!raw) return null;
  const values = raw.split(',').map(Number);
  if (values.length !== plies || values.some((v) => !Number.isFinite(v) || v < 0)) return null;
  const tc = timeControl?.match(/^(\d+)(?:\+(\d+))?$/);
  if (tc) {
    const ceiling = (Number(tc[1]) + Number(tc[2] ?? 0) * plies) * 10;
    if (values.some((v) => v > ceiling + 10)) return null;
  }
  return values;
}

/** Builds a PGN (with %clk comments when available) from Chess.com's game JSON. */
export function pgnFromChessComCallback(json: ChessComCallback): string {
  const game = json.game;
  if (!game?.moveList) throw new Error('Chess.com did not return the moves for this game.');
  const headers = game.pgnHeaders ?? {};
  const fen = headers.SetUp === '1' && typeof headers.FEN === 'string' ? headers.FEN : undefined;
  const chess = fen ? new Chess(fen) : new Chess();
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined && value !== null && value !== '') chess.setHeader(key, String(value));
  }

  const moves = decodeTCN(game.moveList);
  const clocks = parseClocks(game.moveTimestamps, moves.length, headers.TimeControl?.toString());
  moves.forEach((m, i) => {
    if (!m.from) throw new Error('This game uses a chess variant ChessBuddy cannot review.');
    try {
      chess.move({ from: m.from as Square, to: m.to as Square, promotion: m.promotion });
    } catch {
      throw new Error(`Could not replay move ${i + 1} of this game.`);
    }
    if (clocks) chess.setComment(`[%clk ${formatClock(clocks[i])}]`);
  });
  return chess.pgn();
}

/** Builds a PGN from a list of SAN moves (e.g. scraped from a move list). */
export function pgnFromSanList(sans: string[], headers: Record<string, string | undefined> = {}): string {
  const chess = new Chess();
  for (const [key, value] of Object.entries(headers)) if (value) chess.setHeader(key, value);
  sans.forEach((san, i) => {
    try {
      chess.move(san.replace(/[!?]+$/, ''));
    } catch {
      throw new Error(`Could not read move ${i + 1} ("${san}") from the page.`);
    }
  });
  return chess.pgn();
}
