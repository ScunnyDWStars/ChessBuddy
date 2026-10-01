import { useRef, useState } from 'react';
import type { AnalyzedMove, Score } from '../lib/types';
import { formatScore, whiteWinProb } from '../lib/scoring';
import { CLASS_COLOR } from './ClassIcon';
import { CLASS_LABEL } from '../lib/feedback';

const MARKED = new Set(['brilliant', 'great', 'miss', 'mistake', 'blunder']);
const W = 400;

interface Props {
  initial: Score;
  moves: AnalyzedMove[];
  ply: number;
  onSelect: (ply: number) => void;
  height?: number;
}

/**
 * Advantage graph in the style of chess.com's review: the white area is
 * White's share of the expected result, the dark area Black's.
 */
export function EvalGraph({ initial, moves, ply, onSelect, height = 90 }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const H = height;
  const points = [initial, ...moves.map((m) => m.evalAfter)].map((s, i) => ({
    x: moves.length ? (i / moves.length) * W : 0,
    y: (1 - Math.min(0.985, Math.max(0.015, whiteWinProb(s)))) * H,
  }));
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;

  const plyAt = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(moves.length, Math.round(frac * moves.length)));
  };

  const hovered = hover !== null ? (hover === 0 ? null : moves[hover - 1]) : undefined;
  const hoverScore = hover !== null ? (hover === 0 ? initial : moves[hover - 1].evalAfter) : null;

  return (
    <div className="eval-graph">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Evaluation graph. Click to jump to a move."
        onMouseMove={(e) => setHover(plyAt(e.clientX))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => onSelect(plyAt(e.clientX))}
      >
        <rect width={W} height={H} className="graph-bg" />
        <path d={area} className="graph-area" />
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="graph-mid" />
        <path d={line} className="graph-line" vectorEffect="non-scaling-stroke" />
        {ply > 0 && <line x1={points[ply].x} x2={points[ply].x} y1={0} y2={H} className="graph-cursor" vectorEffect="non-scaling-stroke" />}
        {hover !== null && <line x1={points[hover].x} x2={points[hover].x} y1={0} y2={H} className="graph-hover" vectorEffect="non-scaling-stroke" />}
      </svg>
      {/* Markers are HTML so they stay round while the SVG stretches. */}
      {moves.map((m, i) =>
        MARKED.has(m.classification) ? (
          <span
            key={m.ply}
            className={`graph-dot${m.ply === ply ? ' active' : ''}`}
            style={{ left: `${(points[i + 1].x / W) * 100}%`, top: `${(points[i + 1].y / H) * 100}%`, background: CLASS_COLOR[m.classification] }}
          />
        ) : null,
      )}
      {hover !== null && hoverScore && (
        <div className="graph-tip" style={{ left: `${(points[hover].x / W) * 100}%` }}>
          {hovered ? (
            <>
              <strong>
                {hovered.moveNumber}
                {hovered.color === 'w' ? '.' : '...'} {hovered.san}
              </strong>{' '}
              <span style={{ color: CLASS_COLOR[hovered.classification] }}>●</span> {CLASS_LABEL[hovered.classification]}
            </>
          ) : (
            <strong>Start</strong>
          )}
          <span className="tip-eval">{formatScore(hoverScore)}</span>
        </div>
      )}
    </div>
  );
}
