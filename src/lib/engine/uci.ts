import type { EngineLine, Score } from '../types';

export const MATE_CP = 100_000;

export interface InfoLine {
  depth: number;
  multipv: number;
  /** Score from the side-to-move's point of view. */
  scoreType: 'cp' | 'mate';
  scoreValue: number;
  bound?: 'lower' | 'upper';
  pv: string[];
}

/** Parses a UCI `info ... score ... pv ...` line. Returns null for other lines. */
export function parseInfoLine(line: string): InfoLine | null {
  if (!line.startsWith('info ') || !line.includes(' score ') || !line.includes(' pv ')) return null;
  const tokens = line.split(/\s+/);
  let depth = 0;
  let multipv = 1;
  let scoreType: 'cp' | 'mate' | undefined;
  let scoreValue = 0;
  let bound: 'lower' | 'upper' | undefined;
  let pv: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'depth') depth = Number(tokens[++i]);
    else if (t === 'multipv') multipv = Number(tokens[++i]);
    else if (t === 'score') {
      scoreType = tokens[++i] as 'cp' | 'mate';
      scoreValue = Number(tokens[++i]);
      if (tokens[i + 1] === 'lowerbound' || tokens[i + 1] === 'upperbound') {
        bound = tokens[++i] === 'lowerbound' ? 'lower' : 'upper';
      }
    } else if (t === 'pv') {
      pv = tokens.slice(i + 1).filter(Boolean);
      break;
    }
  }
  if (!scoreType || pv.length === 0) return null;
  return { depth, multipv, scoreType, scoreValue, bound, pv };
}

/** Converts a side-to-move score into a White-POV {@link Score}. */
export function toWhiteScore(type: 'cp' | 'mate', value: number, sideToMove: 'w' | 'b'): Score {
  const sign = sideToMove === 'w' ? 1 : -1;
  if (type === 'mate') {
    // "mate 0" from the engine means the side to move is mated.
    const m = value === 0 ? 0 : value;
    const cp = value === 0 ? -MATE_CP : Math.sign(value) * (MATE_CP - Math.abs(value));
    return { cp: cp * sign, mate: m === 0 ? 0 : m * sign };
  }
  return { cp: value * sign };
}

/**
 * Collects the final multipv lines from a stream of info lines.
 * Later (deeper) lines replace earlier ones; bound-only scores are ignored
 * unless nothing else exists for that multipv index.
 */
export class LineCollector {
  private lines = new Map<number, InfoLine>();

  push(raw: string): void {
    const info = parseInfoLine(raw);
    if (!info) return;
    const prev = this.lines.get(info.multipv);
    if (info.bound && prev && !prev.bound && prev.depth >= info.depth - 1) return;
    if (!prev || info.depth >= prev.depth || prev.bound) this.lines.set(info.multipv, info);
  }

  result(sideToMove: 'w' | 'b'): EngineLine[] {
    const maxDepth = Math.max(0, ...[...this.lines.values()].map((l) => l.depth));
    return [...this.lines.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, l]) => l)
      // Drop secondary lines that never reached a comparable depth.
      .filter((l, i) => i === 0 || l.depth >= maxDepth - 2)
      .map((l) => ({ score: toWhiteScore(l.scoreType, l.scoreValue, sideToMove), pv: l.pv, depth: l.depth }));
  }
}
