import type { Classification, Color, MoveFeedback, Motif, PlyInfo, Score } from './types';
import { PIECE_NAME, PIECE_VALUE, type Hanging } from './chessUtils';
import { formatScore } from './scoring';

export const CLASS_LABEL: Record<Classification, string> = {
  brilliant: 'Brilliant',
  great: 'Great',
  best: 'Best',
  excellent: 'Excellent',
  good: 'Good',
  book: 'Book',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  miss: 'Miss',
  blunder: 'Blunder',
  forced: 'Forced',
};

const HEADLINE: Record<Classification, string> = {
  brilliant: 'is brilliant',
  great: 'is a great move',
  best: 'is best',
  excellent: 'is excellent',
  good: 'is good',
  book: 'is a book move',
  inaccuracy: 'is an inaccuracy',
  mistake: 'is a mistake',
  miss: 'is a miss',
  blunder: 'is a blunder',
  forced: 'is forced',
};

export interface FeedbackContext {
  move: PlyInfo;
  classification: Classification;
  phaseIsOpening: boolean;
  bestSan?: string;
  bestLine: string[];
  replyLine: string[];
  evalBefore: Score;
  evalAfter: Score;
  /** Piece left en prise that the opponent's best reply captures. */
  hangs?: Hanging;
  /** Extra material (pawn units) the best line would have won compared to the move played. */
  missedGain: number;
  /** Material (pawn units) the played line loses. */
  playedLoses: number;
  /** Opponent has mate in N after the move (N > 0). */
  allowsMate?: number;
  /** We had mate in N before the move and no longer do. */
  missedMate?: number;
  /** We had mate before and still do. */
  keepsMate?: number;
  isRecapture: boolean;
  isSacrifice: boolean;
  opening?: string;
  /** Opponent's previous move lost this many expected points. */
  prevLoss: number;
  /** Win probability for the mover after the move. */
  winAfter: number;
}

function materialWords(value: number, piece?: string): string {
  if (piece && PIECE_VALUE[piece] === value) return `a ${PIECE_NAME[piece]}`;
  if (value <= 1) return 'a pawn';
  if (value === 2) return 'two pawns';
  if (value === 3) return 'a piece';
  if (value >= 9) return 'decisive material';
  return `${value} points of material`;
}

const line = (sans: string[], n = 5) => sans.slice(0, n).join(' ');

/** Describes what the move does in plain language, plus the motifs detected. */
export function describeMove(move: PlyInfo, ctx: { phaseIsOpening: boolean; isRecapture: boolean }): {
  text: string;
  motifs: Motif[];
} {
  const motifs: Motif[] = [];
  const piece = PIECE_NAME[move.piece];
  const parts: string[] = [];
  if (move.san.endsWith('#')) {
    motifs.push('checkmate');
    return { text: 'Checkmate! The game is over.', motifs };
  }
  if (move.san.startsWith('O-O')) {
    motifs.push('castle');
    parts.push(move.san === 'O-O-O' ? 'Castles queenside, connecting the rooks' : 'Castles, tucking the king away to safety');
  } else if (move.promotion) {
    motifs.push('promotion');
    parts.push(`Promotes the pawn to a ${PIECE_NAME[move.promotion]}`);
  } else if (move.captured) {
    motifs.push(ctx.isRecapture ? 'recapture' : 'capture');
    parts.push(`${ctx.isRecapture ? 'Recaptures' : 'Captures'} the ${PIECE_NAME[move.captured]} on ${move.to}`);
  } else if (ctx.phaseIsOpening && (move.piece === 'n' || move.piece === 'b') && /[18]$/.test(move.from)) {
    motifs.push('develops');
    parts.push(`Develops the ${piece} toward the center`);
  } else if (move.piece === 'p' && ['d4', 'e4', 'd5', 'e5', 'c4', 'c5'].includes(move.to) && ctx.phaseIsOpening) {
    motifs.push('center');
    parts.push('Stakes a claim in the center');
  } else if (move.piece === 'p') {
    parts.push(`Advances the pawn to ${move.to}`);
  } else if (move.piece === 'k') {
    parts.push(`Moves the king to ${move.to}`);
  } else {
    parts.push(`Repositions the ${piece} to ${move.to}`);
  }
  if (move.san.includes('+')) {
    motifs.push('check');
    parts[parts.length - 1] += ' with check';
  }
  return { text: parts.join(', ') + '.', motifs };
}

/** Builds the coach's explanation for a move. */
export function buildFeedback(ctx: FeedbackContext): MoveFeedback {
  const { move, classification: cls, bestSan } = ctx;
  const { text: what, motifs } = describeMove(move, ctx);
  const headline = `${move.san} ${HEADLINE[cls]}`;
  const best = bestSan ? `**${bestSan}**` : 'the engine move';
  const sentences: string[] = [];
  const evalShift = `The evaluation went from ${formatScore(ctx.evalBefore)} to ${formatScore(ctx.evalAfter)}.`;

  switch (cls) {
    case 'forced':
      sentences.push('This was the only legal move.');
      break;
    case 'book':
      sentences.push(what);
      sentences.push(ctx.opening ? `This is established opening theory in the ${ctx.opening}.` : 'This is a well-known opening move.');
      break;
    case 'brilliant':
      motifs.push('sacrifice');
      sentences.push(
        `A sacrifice! You offer your ${ctx.hangs ? PIECE_NAME[ctx.hangs.piece] : 'material'}, and the engine confirms it is the strongest continuation.`,
      );
      if (ctx.keepsMate) sentences.push(`It leads to a forced checkmate in ${ctx.keepsMate}.`);
      else if (ctx.bestLine.length > 1) sentences.push(`The point: ${line(ctx.bestLine, 6)}.`);
      break;
    case 'great':
      if (ctx.prevLoss >= 0.2) {
        motifs.push('punishes');
        sentences.push(`${what} You found the move that punishes your opponent's error.`);
      } else {
        motifs.push('only-move');
        sentences.push(
          `${what} This was the only move that ${ctx.winAfter >= 0.6 ? 'keeps your advantage' : ctx.winAfter >= 0.4 ? 'keeps the balance' : 'keeps you fighting'} — every alternative was clearly worse.`,
        );
      }
      break;
    case 'best':
      sentences.push(what);
      if (ctx.keepsMate) sentences.push(`You have a forced mate in ${ctx.keepsMate}.`);
      else sentences.push("This is the engine's top choice.");
      break;
    case 'excellent':
      sentences.push(what);
      sentences.push(`Almost as strong as the top move ${best}.`);
      break;
    case 'good':
      sentences.push(what);
      sentences.push(`A solid move, though ${best} was more precise.`);
      break;
    case 'inaccuracy':
    case 'mistake':
    case 'blunder':
    case 'miss': {
      const reason = explainError(ctx, motifs);
      sentences.push(reason);
      if (cls !== 'miss' || !reason.includes(bestSan ?? '\u0000')) sentences.push(`Best was ${best}${ctx.bestLine.length > 1 ? ` (${line(ctx.bestLine)})` : ''}.`);
      if (cls !== 'inaccuracy') sentences.push(evalShift);
      break;
    }
  }
  return { headline, text: sentences.join(' '), motifs };
}

function explainError(ctx: FeedbackContext, motifs: Motif[]): string {
  const best = ctx.bestSan ? `**${ctx.bestSan}**` : 'the best move';
  const reply = ctx.replyLine[0] ? `**${ctx.replyLine[0]}**` : 'the reply';
  if (ctx.classification === 'miss') {
    if (ctx.missedMate) {
      motifs.push('missed-mate');
      return `You missed a forced checkmate in ${ctx.missedMate} starting with ${best}.`;
    }
    if (ctx.missedGain >= 2) {
      motifs.push('missed-material');
      return `Your opponent's last move gave you a chance: ${best} wins ${materialWords(ctx.missedGain)}.`;
    }
    return `Your opponent's last move gave you a chance to take over, but this lets them off the hook.`;
  }
  if (ctx.allowsMate) {
    motifs.push('allows-mate');
    return `This allows a forced checkmate in ${ctx.allowsMate}: ${line(ctx.replyLine, ctx.allowsMate * 2 - 1)}.`;
  }
  if (ctx.hangs && ctx.hangs.value >= 2) {
    motifs.push('hangs-piece');
    const piece = PIECE_NAME[ctx.hangs.piece];
    return `This leaves your ${piece} on ${ctx.hangs.square} insufficiently protected — ${reply} wins it.`;
  }
  if (ctx.missedMate) {
    motifs.push('missed-mate');
    return `You had a forced checkmate in ${ctx.missedMate}.`;
  }
  if (ctx.playedLoses >= 2) {
    motifs.push('loses-material');
    return `After ${reply}, your opponent wins ${materialWords(ctx.playedLoses)}.`;
  }
  if (ctx.missedGain >= 2) {
    motifs.push('missed-material');
    return `You could have won ${materialWords(ctx.missedGain)} instead.`;
  }
  if (ctx.classification === 'inaccuracy') {
    const winBefore = ctx.winAfter + 0.05;
    if (winBefore >= 0.6) return 'This lets some of your advantage slip.';
    if (winBefore >= 0.4) return 'This gives your opponent a slightly easier game.';
    return 'This makes a difficult position harder to hold.';
  }
  return `This hands your opponent ${ctx.replyLine.length ? `a strong continuation: ${line(ctx.replyLine, 4)}.` : 'the initiative.'}`;
}

/** Splits "**bold**" markup for rendering. */
export function richText(text: string): { text: string; bold: boolean }[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((t) =>
    t.startsWith('**') ? { text: t.slice(2, -2), bold: true } : { text: t, bold: false },
  );
}

export const moverName = (color: Color) => (color === 'w' ? 'White' : 'Black');
