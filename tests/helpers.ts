import { readFileSync } from 'node:fs';
import { buildReview } from '../src/lib/analyze';
import { parsePgn } from '../src/lib/pgn';
import type { EngineLine, GameReview, PositionEval } from '../src/lib/types';
import type { OpeningBook } from '../src/lib/openings';
import book from '../src/data/openings.json';

/** The calibration game (ChessManDan1888 vs FreeGreenland) reviewed from saved engine output. */
export function fixtureReview(): GameReview {
  const f = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);
  const game = parsePgn(readFileSync(f('chesscom-2026-09-26.pgn'), 'utf8'));
  const evals: PositionEval[] = (
    JSON.parse(readFileSync(f('chesscom-2026-09-26.evals.json'), 'utf8')) as { fen: string; lines: EngineLine[] }[]
  ).map((e) => ({ ...e, score: e.lines[0]?.score ?? { cp: 0 } }));
  return buildReview(game, evals, book as unknown as OpeningBook, 15);
}
