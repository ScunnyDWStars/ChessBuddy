import type { Color, Score } from '../lib/types';
import { formatScore, whiteWinProb } from '../lib/scoring';

/** Vertical evaluation bar: White's share fills from White's side of the board. */
export function EvalBar({ score, orientation }: { score: Score | null; orientation: Color }) {
  const white = score ? whiteWinProb(score) : 0.5;
  // Keep a sliver of both colours visible unless the game is decided.
  const decided = score?.mate === 0;
  const pct = decided ? white * 100 : Math.min(97, Math.max(3, white * 100));
  const whiteAhead = score ? score.cp >= 0 : true;
  const label = score ? barLabel(score) : '';
  return (
    <div className={`eval-bar ${orientation === 'b' ? 'flipped' : ''}`} aria-label={`Evaluation ${score ? formatScore(score) : 'pending'}`}>
      <div className="eval-fill" style={{ height: `${pct}%` }} />
      {score && (
        <span className={`eval-label ${whiteAhead ? 'white-side' : 'black-side'}`}>{label}</span>
      )}
    </div>
  );
}

function barLabel(score: Score): string {
  if (score.mate !== undefined) return score.mate === 0 ? (score.cp > 0 ? '1-0' : '0-1') : `M${Math.abs(score.mate)}`;
  const v = Math.abs(score.cp) / 100;
  return v >= 10 ? v.toFixed(0) : v.toFixed(1);
}
