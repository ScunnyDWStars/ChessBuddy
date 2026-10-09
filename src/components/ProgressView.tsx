import type { ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';
import type { Phase } from '../lib/types';
import type { GameRecord } from '../lib/library';
import type { Puzzle, PuzzleTheme } from '../lib/puzzles';
import { duePuzzles } from '../lib/puzzles';
import { buildProgress, type ProblemStat } from '../lib/progress';
import { CoachAvatar } from './common';
import { PhaseBar } from './InsightsView';

const OUTCOME_LABEL = { win: 'Win', loss: 'Loss', draw: 'Draw', unknown: '—' } as const;

function opponentOf(g: GameRecord) {
  return g.myColor === 'w' ? g.black : g.white;
}

/** Accuracy per game, oldest → newest. Markers show the result; hover for details, click to open. */
function AccuracyTrend({ games, onOpen }: { games: GameRecord[]; onOpen: (key: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 400;
  const H = 150;
  const pad = { l: 30, r: 10, t: 10, b: 18 };
  const yMin = Math.max(0, Math.floor((Math.min(...games.map((g) => g.accuracy)) - 5) / 10) * 10);
  const x = (i: number) => pad.l + (games.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (games.length - 1)) * (W - pad.l - pad.r));
  const y = (acc: number) => pad.t + (1 - (acc - yMin) / (100 - yMin)) * (H - pad.t - pad.b);
  const ticks = [yMin, yMin + (100 - yMin) / 2, 100].map((v) => Math.round(v));
  const path = games.map((g, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(g.accuracy).toFixed(1)}`).join(' ');

  const indexAt = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    games.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    return best;
  };
  const h = hover !== null ? games[hover] : null;

  return (
    <div
      className="trend"
      ref={ref}
      onMouseMove={(e) => setHover(indexAt(e.clientX))}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => onOpen(games[indexAt(e.clientX)].key)}
      role="img"
      aria-label={`Accuracy over your last ${games.length} games`}
    >
      <svg viewBox={`0 0 ${W} ${H}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="trend-grid" />
            <text x={pad.l - 6} y={y(t)} className="trend-tick" textAnchor="end" dominantBaseline="middle">
              {t}
            </text>
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="trend-cross" />}
        <path d={path} className="trend-line" />
        {games.map((g, i) => (
          <circle key={g.key} cx={x(i)} cy={y(g.accuracy)} r={hover === i ? 6 : 4.5} className={`trend-dot ${g.outcome}`} />
        ))}
      </svg>
      {h && hover !== null && (
        <div className="trend-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <strong>{h.accuracy.toFixed(1)}%</strong> · {OUTCOME_LABEL[h.outcome]} vs {opponentOf(h)}
          {h.date && <span className="muted"> · {h.date.replaceAll('.', '-')}</span>}
        </div>
      )}
      <div className="trend-legend" aria-hidden="true">
        <span>
          <i className="trend-dot-key win" /> Win
        </span>
        <span>
          <i className="trend-dot-key draw" /> Draw
        </span>
        <span>
          <i className="trend-dot-key loss" /> Loss
        </span>
      </div>
    </div>
  );
}

function ProblemCard({
  p,
  puzzleCount,
  onPractise,
}: {
  p: ProblemStat;
  puzzleCount: number;
  onPractise: (themes: PuzzleTheme[]) => void;
}) {
  const share = p.games / p.window;
  return (
    <article className={`problem-card ${share >= 0.5 ? 'sev-high' : share >= 0.3 ? 'sev-medium' : 'sev-low'}`}>
      <div className="problem-head">
        <h4>{p.title}</h4>
        <span className="problem-freq">
          {p.games} of {p.window} games
        </span>
      </div>
      <p>{p.tip}</p>
      {p.themes && puzzleCount > 0 && (
        <button className="btn-secondary small-btn" onClick={() => onPractise(p.themes!)}>
          Practise these ({puzzleCount} puzzle{puzzleCount === 1 ? '' : 's'})
        </button>
      )}
    </article>
  );
}

export function ProgressView({
  games,
  puzzles,
  pending,
  onOpenGame,
  onPractise,
  onLoad,
  latest,
}: {
  games: GameRecord[];
  puzzles: Puzzle[];
  /** Games saved by the extension that are still being analysed. */
  pending: { done: number; total: number } | null;
  onOpenGame: (key: string) => void;
  onPractise: (themes?: PuzzleTheme[]) => void;
  onLoad: () => void;
  /** "Review my latest game" button, shown when there is nothing here yet. */
  latest?: ReactNode;
}) {
  const progress = useMemo(() => buildProgress(games), [games]);
  const due = duePuzzles(puzzles).length;

  const pendingNote = pending && (
    <div className="pending-note">
      Analysing games saved by the extension… {pending.done} of {pending.total}
    </div>
  );

  if (games.length === 0) {
    return (
      <div className="panel-scroll progress-view">
        <div className="coach-row">
          <CoachAvatar size={56} />
          <div className="bubble">
            Your progress shows up here once you've reviewed some of <strong>your own</strong> games. Every game you review is saved on this
            device, and each mistake becomes a practice puzzle. Sample games aren't counted.
          </div>
        </div>
        {pendingNote}
        {latest}
        <button className="btn-secondary" onClick={onLoad}>
          Load or paste a game
        </button>
      </div>
    );
  }

  const trend = progress.previousAccuracy === null ? null : progress.recentAccuracy - progress.previousAccuracy;
  const recentGames = progress.series.slice(-30);
  const top = progress.problems[0];
  const puzzlesFor = (themes?: PuzzleTheme[]) => (themes ? puzzles.filter((p) => themes.includes(p.theme)).length : 0);

  return (
    <div className="panel-scroll progress-view">
      <div className="coach-row">
        <CoachAvatar size={56} />
        <div className="bubble">
          {top ? (
            <>
              Across your last {top.window} games, your biggest leak is <strong>{top.title.toLowerCase()}</strong> ({top.games} of {top.window}{' '}
              games). {due > 0 ? `You have ${due} puzzle${due === 1 ? '' : 's'} waiting from your own mistakes.` : 'Keep reviewing games to track it.'}
            </>
          ) : (
            <>No recurring problems in your recent games. Nice work. Keep reviewing to spot new patterns.</>
          )}
        </div>
      </div>
      {pendingNote}

      <div className="insight-stats">
        <div className="insight-stat">
          <span className="insight-stat-value">{progress.games}</span>
          <span className="insight-stat-label">
            Games · {progress.wins}W {progress.draws}D {progress.losses}L
          </span>
        </div>
        <div className="insight-stat">
          <span className="insight-stat-value">
            {progress.recentAccuracy.toFixed(1)}
            {trend !== null && Math.abs(trend) >= 0.5 && (
              <span className={`trend-delta ${trend > 0 ? 'up' : 'down'}`} title="Compared with the 10 games before">
                {trend > 0 ? '▲' : '▼'}
                {Math.abs(trend).toFixed(1)}
              </span>
            )}
          </span>
          <span className="insight-stat-label">Recent accuracy</span>
        </div>
        <div className="insight-stat">
          <span className="insight-stat-value">{progress.recentRating}</span>
          <span className="insight-stat-label">Typical game rating</span>
        </div>
      </div>

      <h3 className="section-title">Accuracy by game</h3>
      <AccuracyTrend games={recentGames} onOpen={onOpenGame} />

      {progress.problems.length > 0 && (
        <>
          <h3 className="section-title">Your recurring problems</h3>
          {progress.problems.map((p) => (
            <ProblemCard key={p.id} p={p} puzzleCount={puzzlesFor(p.themes)} onPractise={onPractise} />
          ))}
        </>
      )}

      <h3 className="section-title">Accuracy by phase</h3>
      <div className="phase-bars">
        {(['opening', 'middlegame', 'endgame'] as Phase[]).map((p) => (
          <PhaseBar key={p} label={p[0].toUpperCase() + p.slice(1)} value={progress.phases[p]} />
        ))}
      </div>

      {progress.openings.length > 0 && (
        <>
          <h3 className="section-title">Your openings</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Opening</th>
                  <th>As</th>
                  <th className="num">Games</th>
                  <th className="num">Score</th>
                  <th className="num">Acc.</th>
                </tr>
              </thead>
              <tbody>
                {progress.openings.map((o) => (
                  <tr key={`${o.color}${o.name}`}>
                    <td className="opening-name" title={`${o.eco} ${o.name}`}>
                      {o.name}
                    </td>
                    <td>
                      <span className={`side-dot ${o.color}`} title={o.color === 'w' ? 'White' : 'Black'} />
                    </td>
                    <td className="num">{o.games}</td>
                    <td className="num">{Math.round(o.score * 100)}%</td>
                    <td className="num">{o.accuracy.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 className="section-title">Your games</h3>
      <div className="game-list">
        {[...progress.series].reverse().map((g) => (
          <button key={g.key} className="game-item" onClick={() => onOpenGame(g.key)}>
            <span className={`result-dot ${g.outcome === 'unknown' ? 'draw' : g.outcome}`} title={OUTCOME_LABEL[g.outcome]} />
            <span className="gi-players">
              <span>vs {opponentOf(g)}</span>
              <em>
                {g.date ? g.date.replaceAll('.', '-') : 'No date'} · {g.opening?.name.split(':')[0] ?? 'Custom start'}
              </em>
            </span>
            <span className="gi-acc">{g.accuracy.toFixed(1)}</span>
          </button>
        ))}
      </div>
      <p className="muted small">Games are stored in this browser only.</p>
    </div>
  );
}
