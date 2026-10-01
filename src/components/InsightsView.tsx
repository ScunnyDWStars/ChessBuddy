import type { Color, GameReview, Insight, Phase } from '../lib/types';
import { CLASS_LABEL } from '../lib/feedback';
import { ClassIcon, CLASS_COLOR } from './ClassIcon';
import { CoachAvatar } from './common';
import { Figurine } from './MoveList';

const SEVERITY_LABEL: Record<Insight['severity'], string> = {
  high: 'Top priority',
  medium: 'Worth working on',
  low: 'Fine-tuning',
  positive: 'Keep it up',
};

function PhaseBar({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  const v = Math.round(value);
  const color = v >= 90 ? CLASS_COLOR.best : v >= 75 ? CLASS_COLOR.good : v >= 60 ? CLASS_COLOR.inaccuracy : CLASS_COLOR.blunder;
  return (
    <div className="phase-bar">
      <span className="phase-bar-label">{label}</span>
      <span className="phase-bar-track">
        <span className="phase-bar-fill" style={{ width: `${v}%`, background: color }} />
      </span>
      <span className="phase-bar-value">{v}%</span>
    </div>
  );
}

export function InsightsView({
  review,
  perspective,
  onJump,
}: {
  review: GameReview;
  perspective: Color;
  onJump: (ply: number) => void;
}) {
  const s = review.summary[perspective];
  const insights = review.insights[perspective];
  const name = perspective === 'w' ? review.game.headers.white : review.game.headers.black;
  const keyMoments = review.moves
    .filter((m) => m.color === perspective && m.loss >= 0.1)
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 5)
    .sort((a, b) => a.ply - b.ply);
  const focus = insights.filter((i) => i.severity !== 'positive');

  return (
    <div className="panel-scroll insights">
      <div className="coach-row">
        <CoachAvatar size={56} />
        <div className="bubble">
          {focus.length ? (
            <>
              Here's your improvement plan, <strong>{name}</strong>. Fixing your <strong>top priority</strong> is the quickest way to win more
              games and gain rating.
            </>
          ) : (
            <>
              Great game, <strong>{name}</strong>! No major weaknesses showed up — here's what went well.
            </>
          )}
        </div>
      </div>

      <div className="insight-stats">
        <div className="insight-stat">
          <span className="insight-stat-value">{s.accuracy.toFixed(1)}</span>
          <span className="insight-stat-label">Accuracy</span>
        </div>
        <div className="insight-stat">
          <span className="insight-stat-value">{s.estimatedRating}</span>
          <span className="insight-stat-label">Game rating</span>
        </div>
        <div className="insight-stat">
          <span className="insight-stat-value" style={{ color: CLASS_COLOR.blunder }}>
            {s.counts.blunder + s.counts.mistake + s.counts.miss}
          </span>
          <span className="insight-stat-label">Key errors</span>
        </div>
      </div>

      <h3 className="section-title">Accuracy by phase</h3>
      <div className="phase-bars">
        {(['opening', 'middlegame', 'endgame'] as Phase[]).map((p) => (
          <PhaseBar key={p} label={p[0].toUpperCase() + p.slice(1)} value={s.phases[p]} />
        ))}
      </div>

      <h3 className="section-title">Improvement plan</h3>
      {insights.length === 0 && <p className="muted">Not enough moves to draw conclusions from this game.</p>}
      {insights.map((ins) => (
        <article key={ins.id} className={`insight-card sev-${ins.severity}`}>
          <div className="insight-sev">{SEVERITY_LABEL[ins.severity]}</div>
          <h4>{ins.title}</h4>
          <p>{ins.detail}</p>
          <div className="insight-practice">
            <span className="practice-label">How to practise</span>
            {ins.practice}
          </div>
          {ins.plies.length > 0 && (
            <div className="insight-moves">
              {ins.plies.slice(0, 6).map((p) => {
                const m = review.moves[p - 1];
                return (
                  <button key={p} className="move-chip" onClick={() => onJump(p)}>
                    <ClassIcon cls={m.classification} size={14} />
                    {m.moveNumber}
                    {m.color === 'w' ? '.' : '...'} <Figurine san={m.san} />
                  </button>
                );
              })}
            </div>
          )}
        </article>
      ))}

      {keyMoments.length > 0 && (
        <>
          <h3 className="section-title">Biggest turning points</h3>
          <div className="key-moments">
            {keyMoments.map((m) => (
              <button key={m.ply} className="key-moment" onClick={() => onJump(m.ply)}>
                <ClassIcon cls={m.classification} size={20} />
                <span className="km-move">
                  {m.moveNumber}
                  {m.color === 'w' ? '.' : '...'} <Figurine san={m.san} />
                </span>
                <span className="km-label" style={{ color: CLASS_COLOR[m.classification] }}>
                  {CLASS_LABEL[m.classification]}
                </span>
                <span className="km-best">
                  Best: <Figurine san={m.bestMove?.san ?? '—'} />
                </span>
                <span className="km-loss">−{Math.round(m.loss * 100)}%</span>
              </button>
            ))}
          </div>
          <p className="muted small">Percentages show how much of your winning chances each move gave away.</p>
        </>
      )}
    </div>
  );
}
