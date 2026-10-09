import type { Color, Phase } from './types';
import type { GameRecord } from './library';
import type { PuzzleTheme } from './puzzles';

/** Dashboard copy for each recurring problem (ids from insights.ts). */
export const PROBLEMS: Record<string, { title: string; tip: string; themes?: PuzzleTheme[] }> = {
  hanging: {
    title: 'Leaving pieces en prise',
    tip: 'Before every move, check what your move leaves undefended and what your opponent can capture.',
    themes: ['hanging'],
  },
  'missed-tactics': {
    title: "Missing your opponent's mistakes",
    tip: 'After each opponent move, ask what it stopped defending, and look at checks, captures and threats first.',
    themes: ['missed-tactic', 'missed-mate'],
  },
  'king-safety': {
    title: 'King safety',
    tip: 'Keep defenders and an escape square near your king while the queens are on.',
    themes: ['king-safety'],
  },
  conversion: {
    title: 'Converting winning positions',
    tip: 'When ahead, trade pieces, remove counterplay and keep checking your opponent’s threats.',
  },
  time: {
    title: 'Time trouble',
    tip: 'Play the opening faster and save time for the critical middlegame moments.',
  },
  endgame: {
    title: 'Endgame technique',
    tip: 'Activate your king and learn the key endings (opposition, Lucena, Philidor).',
  },
  middlegame: {
    title: 'Middlegame planning',
    tip: 'Improve your worst-placed piece and plan around pawn breaks.',
  },
  opening: {
    title: 'Opening play',
    tip: 'Develop, castle early and review where you left theory after each game.',
  },
};

export interface ProblemStat {
  id: string;
  title: string;
  tip: string;
  themes?: PuzzleTheme[];
  /** Games (in the recent window) where it came up. */
  games: number;
  window: number;
}

export interface OpeningStat {
  name: string;
  eco: string;
  color: Color;
  games: number;
  /** Points per game, 0..1. */
  score: number;
  accuracy: number;
}

export interface Progress {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  averageAccuracy: number;
  /** Mean of the last (up to) 10 games, and of the 10 before those. */
  recentAccuracy: number;
  previousAccuracy: number | null;
  recentRating: number;
  series: GameRecord[];
  problems: ProblemStat[];
  phases: Record<Phase, number | null>;
  openings: OpeningStat[];
}

export const RECENT_WINDOW = 10;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Aggregates your saved games (oldest first) into dashboard numbers. */
export function buildProgress(records: GameRecord[]): Progress {
  const series = [...records].sort((a, b) => a.playedAt - b.playedAt || a.savedAt - b.savedAt);
  const recent = series.slice(-RECENT_WINDOW);
  const previous = series.slice(-2 * RECENT_WINDOW, -RECENT_WINDOW);

  const problemCounts = new Map<string, number>();
  for (const r of recent) for (const id of new Set(r.problems)) if (PROBLEMS[id]) problemCounts.set(id, (problemCounts.get(id) ?? 0) + 1);
  const problems = [...problemCounts.entries()]
    .map(([id, games]) => ({ id, ...PROBLEMS[id], games, window: recent.length }))
    .sort((a, b) => b.games - a.games || Object.keys(PROBLEMS).indexOf(a.id) - Object.keys(PROBLEMS).indexOf(b.id));

  const phase = (p: Phase) => {
    const xs = series.map((r) => r.phases[p]).filter((v): v is number => v !== null);
    return xs.length ? mean(xs) : null;
  };

  const openingMap = new Map<string, { name: string; eco: string; color: Color; points: number; games: number; acc: number[] }>();
  for (const r of series) {
    if (!r.opening) continue;
    // Group by the main opening name ("Italian Game", not every sub-variation).
    const name = r.opening.name.split(':')[0];
    const id = `${r.myColor}|${name}`;
    const o = openingMap.get(id) ?? { name, eco: r.opening.eco, color: r.myColor, points: 0, games: 0, acc: [] };
    o.games++;
    o.points += r.outcome === 'win' ? 1 : r.outcome === 'draw' ? 0.5 : 0;
    o.acc.push(r.accuracy);
    openingMap.set(id, o);
  }
  const openings = [...openingMap.values()]
    .map((o) => ({ name: o.name, eco: o.eco, color: o.color, games: o.games, score: o.points / o.games, accuracy: mean(o.acc) }))
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
    .slice(0, 8);

  return {
    games: series.length,
    wins: series.filter((r) => r.outcome === 'win').length,
    losses: series.filter((r) => r.outcome === 'loss').length,
    draws: series.filter((r) => r.outcome === 'draw').length,
    averageAccuracy: mean(series.map((r) => r.accuracy)),
    recentAccuracy: mean(recent.map((r) => r.accuracy)),
    previousAccuracy: previous.length ? mean(previous.map((r) => r.accuracy)) : null,
    recentRating: Math.round(mean(recent.map((r) => r.estimatedRating)) / 50) * 50,
    series,
    problems,
    phases: { opening: phase('opening'), middlegame: phase('middlegame'), endgame: phase('endgame') },
    openings,
  };
}
