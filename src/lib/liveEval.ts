import type { Score } from './types';
import type { Analyzer } from './engine/engine';
import { terminalEval } from './analyze';

/**
 * What the Live board is allowed to know about a position: its evaluation.
 * Deliberately no move or engine line — the Live tab shows how the position
 * stands, never what to play.
 */
export interface LiveEval {
  fen: string;
  score: Score;
  /** Search depth reached (0 for a finished game). */
  depth: number;
  /** True once the deeper search for this position has finished. */
  final: boolean;
}

export interface LiveEvaluatorOptions {
  quickDepth?: number;
  deepDepth?: number;
}

/**
 * Evaluates the latest position of a live game: a quick search for an
 * immediate number, then a deeper one to refine it. Positions that are no
 * longer current are dropped, so fast moves never build up a queue.
 */
export function createLiveEvaluator(
  analyzer: Pick<Analyzer, 'analyze'>,
  onUpdate: (e: LiveEval) => void,
  { quickDepth = 10, deepDepth = 18 }: LiveEvaluatorOptions = {},
) {
  let latest: string | null = null;
  let running = false;
  let disposed = false;

  const emit = (fen: string, score: Score, depth: number, final: boolean) => {
    // Copy only the evaluation: never pass engine lines/moves through.
    const clean: Score = score.mate !== undefined ? { cp: score.cp, mate: score.mate } : { cp: score.cp };
    onUpdate({ fen, score: clean, depth, final });
  };

  async function run() {
    if (running) return;
    running = true;
    try {
      while (latest && !disposed) {
        const fen = latest;
        const terminal = terminalEval(fen);
        if (terminal) {
          emit(fen, terminal.score, 0, true);
        } else {
          for (const depth of [quickDepth, deepDepth]) {
            if (latest !== fen || disposed) break;
            let score: Score | undefined;
            try {
              score = (await analyzer.analyze(fen, { depth, multipv: 1 }))[0]?.score;
            } catch {
              score = undefined;
            }
            if (latest !== fen || disposed) break;
            if (score) emit(fen, score, depth, depth === deepDepth);
          }
        }
        if (latest === fen) latest = null;
      }
    } finally {
      running = false;
    }
  }

  return {
    setPosition(fen: string) {
      latest = fen;
      void run();
    },
    dispose() {
      disposed = true;
      latest = null;
    },
  };
}
