import { useEffect, useRef, useState } from 'react';
import { createLiveEvaluator, type LiveEval } from '../lib/liveEval';
import { getBrowserEngine } from '../lib/engine/engine';

/**
 * Live evaluation of `fen` (null = idle). Also remembers the best-known
 * evaluation of every position seen, for the evaluation-over-time chart.
 */
export function useLiveEval(fen: string | null) {
  const [evals, setEvals] = useState<Record<string, LiveEval>>({});
  const evaluator = useRef<ReturnType<typeof createLiveEvaluator> | null>(null);
  const known = useRef(evals);
  known.current = evals;

  useEffect(() => {
    const ev = createLiveEvaluator(getBrowserEngine(), (e) =>
      setEvals((prev) => (prev[e.fen] && prev[e.fen].depth > e.depth ? prev : { ...prev, [e.fen]: e })),
    );
    evaluator.current = ev;
    return () => ev.dispose();
  }, []);

  useEffect(() => {
    // Positions already searched to full depth (e.g. after Undo) don't need the engine again.
    if (fen && !known.current[fen]?.final) evaluator.current?.setPosition(fen);
  }, [fen]);

  return { current: fen ? (evals[fen] ?? null) : null, evals };
}
