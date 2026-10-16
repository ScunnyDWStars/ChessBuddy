import { Chess, DEFAULT_POSITION, type Square } from 'chess.js';
import type { Color, PlyInfo } from './types';

/** A game being played move by move on the Live board. */
export interface LiveGame {
  startFen: string;
  moves: PlyInfo[];
}

export type LiveStatus =
  | { state: 'playing'; turn: Color; check: boolean }
  | { state: 'checkmate'; winner: Color; result: '1-0' | '0-1' }
  | { state: 'draw'; reason: 'stalemate' | 'insufficient material' | 'threefold repetition' | '50-move rule'; result: '1/2-1/2' };

export const newLiveGame = (startFen: string = DEFAULT_POSITION): LiveGame => ({ startFen, moves: [] });

/** Replays the game into a chess.js instance (keeps repetition history for draw detection). */
function replay(game: LiveGame): Chess {
  const chess = new Chess(game.startFen);
  for (const m of game.moves) chess.move(m.uci.length > 4 ? { from: m.from, to: m.to, promotion: m.uci[4] } : { from: m.from, to: m.to });
  return chess;
}

export const currentFen = (game: LiveGame): string => (game.moves.length ? game.moves[game.moves.length - 1].fenAfter : game.startFen);

/** True when moving from→to is a pawn reaching the last rank (ask which piece). */
export function needsPromotion(fen: string, from: string, to: string): boolean {
  const piece = new Chess(fen).get(from as Square);
  return !!piece && piece.type === 'p' && (to[1] === '8' || to[1] === '1');
}

/** Plays a move; returns the new game, or null if it is illegal or the game is over. */
export function applyMove(game: LiveGame, from: string, to: string, promotion?: string): LiveGame | null {
  const chess = replay(game);
  if (chess.isGameOver()) return null;
  let m;
  try {
    m = chess.move({ from: from as Square, to: to as Square, promotion: promotion ?? 'q' });
  } catch {
    return null;
  }
  const ply = game.moves.length + 1;
  const info: PlyInfo = {
    ply,
    moveNumber: Number(m.before.split(' ')[5]) || Math.ceil(ply / 2),
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
  };
  return { ...game, moves: [...game.moves, info] };
}

export const undo = (game: LiveGame): LiveGame => ({ ...game, moves: game.moves.slice(0, -1) });

export function status(game: LiveGame): LiveStatus {
  const chess = replay(game);
  if (chess.isCheckmate()) {
    const winner: Color = chess.turn() === 'w' ? 'b' : 'w';
    return { state: 'checkmate', winner, result: winner === 'w' ? '1-0' : '0-1' };
  }
  if (chess.isStalemate()) return { state: 'draw', reason: 'stalemate', result: '1/2-1/2' };
  if (chess.isInsufficientMaterial()) return { state: 'draw', reason: 'insufficient material', result: '1/2-1/2' };
  if (chess.isThreefoldRepetition()) return { state: 'draw', reason: 'threefold repetition', result: '1/2-1/2' };
  if (chess.isDrawByFiftyMoves()) return { state: 'draw', reason: '50-move rule', result: '1/2-1/2' };
  return { state: 'playing', turn: chess.turn(), check: chess.inCheck() };
}

/** The game as PGN (result filled in when it has ended). */
export function toPgn(game: LiveGame, headers: Record<string, string> = {}): string {
  const chess = replay(game);
  const s = status(game);
  chess.setHeader('Event', headers.Event ?? 'ChessBuddy Live');
  chess.setHeader('Date', headers.Date ?? new Date().toISOString().slice(0, 10).replaceAll('-', '.'));
  chess.setHeader('White', headers.White ?? 'White');
  chess.setHeader('Black', headers.Black ?? 'Black');
  chess.setHeader('Result', s.state === 'playing' ? '*' : s.result);
  return chess.pgn();
}

/** Starts a game from pasted text: a FEN position, or a PGN whose moves are kept. */
export function liveGameFrom(text: string): LiveGame {
  const t = text.trim();
  if (/^([pnbrqkPNBRQK1-8]+\/){7}[pnbrqkPNBRQK1-8]+\s+[wb]/.test(t)) {
    try {
      return newLiveGame(new Chess(t).fen());
    } catch {
      throw new Error('That position (FEN) is not valid.');
    }
  }
  const chess = new Chess();
  try {
    chess.loadPgn(t.startsWith('[') ? t : `[Event "?"]\n\n${t}`, { strict: false });
  } catch {
    throw new Error('Paste a FEN position or the moves of a game (PGN).');
  }
  const history = chess.history({ verbose: true });
  let game = newLiveGame(history[0]?.before ?? chess.fen());
  for (const m of history) game = applyMove(game, m.from, m.to, m.promotion) ?? game;
  return game;
}

const STORAGE_KEY = 'chessbuddy:live';

export function loadLiveGame(): LiveGame | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as LiveGame;
    // Re-validate by replaying the moves.
    replay(g);
    return g;
  } catch {
    return null;
  }
}

export function saveLiveGame(game: LiveGame): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  } catch {
    /* best effort */
  }
}
