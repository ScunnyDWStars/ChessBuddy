import type { AnalyzedMove, Color, GameHeaders, Insight, SideSummary } from './types';
import { winProbFor } from './scoring';
import { baseTimeSeconds } from './pgn';

const ERRORS = new Set(['mistake', 'blunder', 'miss']);
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2, positive: 3 } as const;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function playerResult(headers: GameHeaders, color: Color): 'win' | 'loss' | 'draw' | 'unknown' {
  if (headers.result === '1/2-1/2') return 'draw';
  if (headers.result === '1-0') return color === 'w' ? 'win' : 'loss';
  if (headers.result === '0-1') return color === 'b' ? 'win' : 'loss';
  return 'unknown';
}

/**
 * Turns the move-by-move analysis into a short, prioritised improvement plan
 * for one player: recurring error patterns, weak phases and habits that cost
 * rating points, each with a concrete way to practise.
 */
export function buildInsights(
  moves: AnalyzedMove[],
  color: Color,
  summary: SideSummary,
  headers: GameHeaders,
): Insight[] {
  const mine = moves.filter((m) => m.color === color);
  const out: Insight[] = [];
  if (mine.length === 0) return out;

  const has = (m: AnalyzedMove, motif: string) => m.feedback.motifs.includes(motif as never);
  const errors = mine.filter((m) => ERRORS.has(m.classification));

  // 1. Hanging pieces — the single biggest rating leak below ~1800.
  const hung = mine.filter((m) => (m.classification === 'blunder' || m.classification === 'mistake') && has(m, 'hangs-piece'));
  if (hung.length) {
    out.push({
      id: 'hanging',
      severity: 'high',
      title: hung.length > 1 ? `You left pieces en prise ${hung.length} times` : 'You left a piece en prise',
      detail:
        'Pieces were left where your opponent could win them for free or in a favourable trade. Eliminating these is the fastest way to gain rating points.',
      practice:
        'Before every move, run a blunder check: after my move, which of my pieces are attacked, and are they defended enough? Look at every check, capture and threat your opponent will have.',
      plies: hung.map((m) => m.ply),
    });
  }

  // 2. Allowing mate.
  const allowedMate = mine.filter((m) => has(m, 'allows-mate'));
  if (allowedMate.length) {
    out.push({
      id: 'king-safety',
      severity: 'high',
      title: 'Your king was left vulnerable to mate',
      detail: `${plural(allowedMate.length, 'move')} allowed a forced checkmate. King safety needs to be part of every decision.`,
      practice:
        'Study basic mating patterns (back-rank, smothered, Arabian, Anastasia\'s mate) and keep luft or defenders near your king once the queens are on.',
      plies: allowedMate.map((m) => m.ply),
    });
  }

  // 3. Missed tactics.
  const missed = mine.filter((m) => m.classification === 'miss' || has(m, 'missed-material') || has(m, 'missed-mate'));
  if (missed.length) {
    const mates = missed.filter((m) => has(m, 'missed-mate')).length;
    out.push({
      id: 'missed-tactics',
      severity: missed.length >= 2 ? 'high' : 'medium',
      title: `You missed ${plural(missed.length, 'winning chance')}`,
      detail: `Your opponent gave you opportunities${mates ? ` — including ${plural(mates, 'forced mate')}` : ''} that went unpunished. Spotting these turns even games into wins.`,
      practice:
        'Solve 15–20 tactics puzzles a day. In games, whenever your opponent moves, ask "what did that move stop defending?" and always check forcing moves (checks, captures, threats) first.',
      plies: missed.map((m) => m.ply),
    });
  }

  // 4. Time trouble.
  const base = baseTimeSeconds(headers.timeControl);
  const withClock = mine.filter((m) => m.clock !== undefined);
  if (withClock.length >= 5) {
    const lowTime = Math.max(20, (base ?? 300) * 0.1);
    const rushed = errors.filter((m) => m.clock !== undefined && m.clock < lowTime);
    if (rushed.length >= 1 && rushed.length >= errors.length / 2) {
      out.push({
        id: 'time',
        severity: 'medium',
        title: 'Time pressure cost you',
        detail: `${plural(rushed.length, 'of your errors')} came with less than ${Math.round(lowTime)} seconds on the clock.`,
        practice:
          'Budget your time: play the opening quickly from your repertoire, save time for critical middlegame moments, and practise a time-control one step longer than usual.',
        plies: rushed.map((m) => m.ply),
      });
    }
  }

  // 5. Converting advantages.
  const result = playerResult(headers, color);
  const peak = Math.max(...mine.map((m) => winProbFor(m.evalAfter, color)));
  if (peak >= 0.85 && (result === 'loss' || result === 'draw')) {
    const peakMove = mine.find((m) => winProbFor(m.evalAfter, color) === peak)!;
    out.push({
      id: 'conversion',
      severity: 'high',
      title: 'A winning position slipped away',
      detail: `After move ${peakMove.moveNumber} you were clearly winning (${result === 'loss' ? 'yet lost' : 'yet drew'}). Converting advantages is a skill of its own.`,
      practice:
        'When ahead: trade pieces (not pawns), remove counterplay before attacking, and keep checking your opponent\'s threats. Practise converting won positions against an engine.',
      plies: [peakMove.ply, ...errors.filter((m) => m.ply > peakMove.ply).map((m) => m.ply)],
    });
  }

  // 6. Phase weaknesses.
  const phaseMoves = (p: AnalyzedMove['phase']) => mine.filter((m) => m.phase === p);
  const { opening, middlegame, endgame } = summary.phases;
  if (endgame !== null && endgame < 75 && phaseMoves('endgame').length >= 5) {
    out.push({
      id: 'endgame',
      severity: endgame < 60 ? 'high' : 'medium',
      title: 'Your endgame technique needs work',
      detail: `Endgame accuracy was ${Math.round(endgame)}%. Many games are decided in the ending, and precise technique converts small edges.`,
      practice:
        'Learn the key theoretical endings (Lucena, Philidor, king-and-pawn opposition) and remember: activate your king and create passed pawns.',
      plies: phaseMoves('endgame').filter((m) => ERRORS.has(m.classification) || m.classification === 'inaccuracy').map((m) => m.ply),
    });
  }
  if (middlegame !== null && middlegame < 70 && phaseMoves('middlegame').length >= 6 && !hung.length) {
    out.push({
      id: 'middlegame',
      severity: 'medium',
      title: 'The middlegame was where you lost ground',
      detail: `Middlegame accuracy was ${Math.round(middlegame)}%. Look for plans based on pawn structure rather than one-move threats.`,
      practice:
        'Before choosing a move, identify your worst-placed piece and the pawn breaks available. Review annotated master games in your openings.',
      plies: phaseMoves('middlegame').filter((m) => ERRORS.has(m.classification)).map((m) => m.ply),
    });
  }

  // 7. Opening habits.
  const openingMoves = mine.slice(0, 12);
  const queenEarly = openingMoves.slice(0, 6).filter((m) => m.piece === 'q').length;
  const castled = mine.find((m) => m.san.startsWith('O-O'));
  const openingErrors = mine.filter(
    (m) => m.phase === 'opening' && (ERRORS.has(m.classification) || m.classification === 'inaccuracy'),
  );
  const habits: string[] = [];
  if (queenEarly >= 2) habits.push('brought the queen out early');
  if (!castled && mine.length >= 15) habits.push('never castled');
  else if (castled && castled.moveNumber > 12) habits.push(`castled late (move ${castled.moveNumber})`);
  const weakOpening = opening !== null && opening < 80;
  if (weakOpening || habits.length || openingErrors.length >= 2) {
    const accText =
      opening === null ? '' : weakOpening ? `Opening accuracy was only ${Math.round(opening)}%. ` : `Your opening moves were accurate (${Math.round(opening)}%), but `;
    const habitText = habits.length ? `${weakOpening || opening === null ? 'You ' : 'you '}${habits.join(' and ')}. ` : '';
    out.push({
      id: 'opening',
      severity: openingErrors.some((m) => m.classification === 'blunder') ? 'high' : weakOpening ? 'medium' : 'low',
      title: habits.length && !weakOpening ? 'Watch your opening habits' : 'Tighten up your opening',
      detail: `${accText}${habitText || (accText.endsWith('but ') ? 'small inaccuracies crept in. ' : '')}A healthy opening gives you a comfortable middlegame.`,
      practice:
        'Follow the principles: control the center, develop knights and bishops before moving a piece twice, castle early and connect your rooks. Build a small repertoire and review where you left theory.',
      plies: [...openingErrors.map((m) => m.ply), ...(castled && castled.moveNumber > 12 ? [castled.ply] : [])],
    });
  }

  // 8. Positives — what to keep doing.
  const great = mine.filter((m) => m.classification === 'brilliant' || m.classification === 'great');
  if (great.length) {
    out.push({
      id: 'strengths',
      severity: 'positive',
      title: `${plural(great.length, 'standout move')} — nice!`,
      detail: 'You found difficult moves that the engine rates as the only good option or a sound sacrifice.',
      practice: 'Keep calculating forcing lines all the way through — that is exactly how these moves were found.',
      plies: great.map((m) => m.ply),
    });
  }
  if (errors.length === 0 && summary.accuracy >= 80) {
    out.push({
      id: 'clean',
      severity: 'positive',
      title: 'A clean game without serious errors',
      detail: `No mistakes or blunders with ${Math.round(summary.accuracy)}% accuracy — this is how rating is gained consistently.`,
      practice: 'To push further, review the inaccuracies and compare your plan with the engine\'s in quiet positions.',
      plies: mine.filter((m) => m.classification === 'inaccuracy').map((m) => m.ply),
    });
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
