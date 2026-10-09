import type { AnalyzedMove, Classification, Color, GameReview } from './types';

/** What kind of mistake a puzzle trains. */
export type PuzzleTheme = 'hanging' | 'missed-tactic' | 'missed-mate' | 'king-safety' | 'other';

export const THEME_LABEL: Record<PuzzleTheme, string> = {
  hanging: 'Hanging pieces',
  'missed-tactic': 'Missed tactics',
  'missed-mate': 'Missed mates',
  'king-safety': 'King safety',
  other: 'Other mistakes',
};

export type PuzzleResult = 'correct' | 'hinted' | 'wrong';

/** Spaced-repetition state (Leitner boxes). */
export interface PuzzleSrs {
  box: number;
  /** Epoch ms when the puzzle is next due. */
  due: number;
  attempts: number;
  correct: number;
  last?: PuzzleResult;
}

export interface Puzzle {
  id: string;
  gameKey: string;
  ply: number;
  moveNumber: number;
  color: Color;
  /** Position before your move — you are to move. */
  fen: string;
  solution: string;
  solutionSan: string;
  bestLine: string[];
  playedUci: string;
  playedSan: string;
  classification: Classification;
  theme: PuzzleTheme;
  /** Your win probability with best play, and what the game move lost. */
  winBefore: number;
  loss: number;
  white: string;
  black: string;
  date?: string;
  createdAt: number;
  srs: PuzzleSrs;
}

const DAY = 24 * 60 * 60 * 1000;
/** Days until the next showing for each box: new → 1 → 3 → 7 → 21. */
export const BOX_DAYS = [0, 1, 3, 7, 21];
const PUZZLE_CLASSES = new Set<Classification>(['mistake', 'miss', 'blunder']);

export function themeOf(move: AnalyzedMove): PuzzleTheme {
  const motifs = move.feedback.motifs;
  if (motifs.includes('missed-mate')) return 'missed-mate';
  if (motifs.includes('allows-mate')) return 'king-safety';
  if (motifs.includes('hangs-piece') || motifs.includes('loses-material')) return 'hanging';
  if (move.classification === 'miss' || motifs.includes('missed-material')) return 'missed-tactic';
  return 'other';
}

/** One puzzle per mistake, miss or blunder of `color`: find the move you missed. */
export function puzzlesFromReview(review: GameReview, color: Color, gameKey: string, now = Date.now()): Puzzle[] {
  return review.moves
    .filter((m) => m.color === color && PUZZLE_CLASSES.has(m.classification) && m.bestMove && m.loss >= 0.1)
    .map((m) => ({
      id: `${gameKey}:${m.ply}`,
      gameKey,
      ply: m.ply,
      moveNumber: m.moveNumber,
      color,
      fen: m.fenBefore,
      solution: m.bestMove!.uci,
      solutionSan: m.bestMove!.san,
      bestLine: m.bestLine,
      playedUci: m.uci,
      playedSan: m.san,
      classification: m.classification,
      theme: themeOf(m),
      winBefore: m.winBefore,
      loss: m.loss,
      white: review.game.headers.white,
      black: review.game.headers.black,
      date: review.game.headers.date,
      createdAt: now,
      srs: { box: 0, due: now, attempts: 0, correct: 0 },
    }));
}

/**
 * Next spaced-repetition state. Solving it moves the puzzle up a box (seen
 * less often); a wrong answer sends it back to the start (tomorrow); solving
 * after a hint keeps the box and shows it again tomorrow.
 */
export function schedule(srs: PuzzleSrs, result: PuzzleResult, now = Date.now()): PuzzleSrs {
  const attempts = srs.attempts + 1;
  const correct = srs.correct + (result === 'correct' ? 1 : 0);
  if (result === 'correct') {
    const box = Math.min(srs.box + 1, BOX_DAYS.length - 1);
    return { box, due: now + BOX_DAYS[box] * DAY, attempts, correct, last: result };
  }
  return { box: result === 'wrong' ? 0 : srs.box, due: now + DAY, attempts, correct, last: result };
}

/** Puzzles due now (optionally one theme), most overdue / least learned first. */
export function duePuzzles(puzzles: Puzzle[], now = Date.now(), theme?: PuzzleTheme): Puzzle[] {
  return puzzles
    .filter((p) => p.srs.due <= now && (!theme || p.theme === theme))
    .sort((a, b) => a.srs.box - b.srs.box || a.srs.due - b.srs.due || a.createdAt - b.createdAt);
}
