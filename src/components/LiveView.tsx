import { useMemo, useRef, useState } from 'react';
import type { LiveGame, LiveStatus } from '../lib/liveGame';
import type { LiveEval } from '../lib/liveEval';
import type { Score } from '../lib/types';
import { describeEval, formatScore, whiteWinProb } from '../lib/scoring';
import { MoveList, Figurine } from './MoveList';
import { NavIcon } from './MoveReviewView';

const RESULT_TEXT = {
  checkmate: (s: Extract<LiveStatus, { state: 'checkmate' }>) => `Checkmate — ${s.winner === 'w' ? 'White' : 'Black'} wins (${s.result})`,
  draw: (s: Extract<LiveStatus, { state: 'draw' }>) => `Draw by ${s.reason} (½-½)`,
};

/** Evaluation over the game so far: scores only, no move markers. */
function EvalTrend({ game, evals }: { game: LiveGame; evals: Record<string, LiveEval> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const fens = [game.startFen, ...game.moves.map((m) => m.fenAfter)];
  const scores: (Score | null)[] = fens.map((f) => evals[f]?.score ?? null);
  const W = 400;
  const H = 70;
  const n = Math.max(1, fens.length - 1);
  const x = (i: number) => (i / n) * W;
  const y = (s: Score) => (1 - Math.min(0.985, Math.max(0.015, whiteWinProb(s)))) * H;
  // Draw only positions that have been evaluated; gaps are bridged.
  const pts = scores.map((s, i) => (s ? { x: x(i), y: y(s), i } : null)).filter((p): p is { x: number; y: number; i: number } => !!p);
  if (pts.length < 2) return null;
  const line = pts.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z`;
  const hp = hover !== null ? pts.find((p) => p.i === hover) : undefined;
  const label = (i: number) => (i === 0 ? 'Start' : `${game.moves[i - 1].moveNumber}${game.moves[i - 1].color === 'w' ? '.' : '...'} ${game.moves[i - 1].san}`);

  return (
    <div
      className="live-trend"
      ref={ref}
      onMouseMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * W;
        setHover(pts.reduce((best, p) => (Math.abs(p.x - px) < Math.abs(x(best) - px) ? p.i : best), pts[0].i));
      }}
      onMouseLeave={() => setHover(null)}
      aria-label="Evaluation over the game"
      role="img"
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <rect width={W} height={H} className="graph-bg" />
        <path d={area} className="graph-area" />
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="graph-mid" />
        <path d={line} className="graph-line" vectorEffect="non-scaling-stroke" />
        {hp && <line x1={hp.x} x2={hp.x} y1={0} y2={H} className="graph-hover" vectorEffect="non-scaling-stroke" />}
      </svg>
      {hp && (
        <div className="graph-tip" style={{ left: `${(hp.x / W) * 100}%` }}>
          <strong>{label(hp.i)}</strong>
          <span className="tip-eval">{formatScore(scores[hp.i]!)}</span>
        </div>
      )}
    </div>
  );
}

export function LiveView({
  game,
  status,
  current,
  shown,
  evals,
  hidden,
  onToggleHidden,
  onUndo,
  onNewGame,
  onFlip,
  onStartFrom,
  onReview,
}: {
  game: LiveGame;
  status: LiveStatus;
  /** Evaluation of the position on the board, if the engine has one yet. */
  current: LiveEval | null;
  /** What the bar shows meanwhile (the newest evaluation available). */
  shown: Score | null;
  evals: Record<string, LiveEval>;
  hidden: boolean;
  onToggleHidden: () => void;
  onUndo: () => void;
  onNewGame: () => void;
  onFlip: () => void;
  onStartFrom: (text: string) => string | null;
  onReview: () => void;
}) {
  const [setupText, setSetupText] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const last = game.moves[game.moves.length - 1];
  const over = status.state !== 'playing';
  const turnText = useMemo(() => {
    if (status.state === 'checkmate') return RESULT_TEXT.checkmate(status);
    if (status.state === 'draw') return RESULT_TEXT.draw(status);
    return `${status.turn === 'w' ? 'White' : 'Black'} to move${status.check ? ' — check!' : ''}`;
  }, [status]);

  return (
    <div className="live">
      <div className="panel-scroll">
        <section className={`live-readout${hidden ? ' is-hidden' : ''}`} aria-live="polite">
          {hidden ? (
            <div className="live-hidden-note">Evaluation hidden</div>
          ) : shown ? (
            <>
              <span className={`live-score ${shown.cp >= 0 ? 'pill-white' : 'pill-black'}`}>{formatScore(shown)}</span>
              <div className="live-verdict">
                <strong>{describeEval(shown)}</strong>
                <span className="muted small">
                  {current ? (current.depth ? `Depth ${current.depth}${current.final ? '' : ' · refining…'}` : 'Game over') : 'Thinking…'}
                </span>
              </div>
            </>
          ) : (
            <div className="live-hidden-note">Thinking…</div>
          )}
          <label className="live-toggle">
            <input type="checkbox" checked={!hidden} onChange={onToggleHidden} />
            <span>Show evaluation</span>
          </label>
        </section>

        <div className={`live-status${over ? ' over' : ''}${status.state === 'playing' && status.check ? ' check' : ''}`}>
          {turnText}
          {last && !over && (
            <span className="muted">
              {' '}
              · last move {last.moveNumber}
              {last.color === 'w' ? '.' : '...'} <Figurine san={last.san} />
            </span>
          )}
        </div>

        {over && (
          <div className="live-over">
            <p>The game is over. You can now see the full review, including the engine's best moves.</p>
            <button className="btn-primary" onClick={onReview}>
              Review this game
            </button>
          </div>
        )}

        {!hidden && <EvalTrend game={game} evals={evals} />}

        {game.moves.length > 0 ? (
          <MoveList moves={game.moves} ply={game.moves.length} onSelect={() => {}} />
        ) : (
          <p className="muted live-hint">
            Make the moves of the game on the board — tap a piece, then its square. Both sides move here. The bar shows how the position is
            evaluated; it never shows the best move.
          </p>
        )}

        <details className="card live-setup">
          <summary>Start from a position…</summary>
          <p className="muted small">Paste a FEN position or the moves so far (PGN).</p>
          <textarea
            className="pgn-input"
            value={setupText}
            onChange={(e) => setSetupText(e.target.value)}
            placeholder="e.g. r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3"
            spellCheck={false}
          />
          {setupError && <div className="error-box small">{setupError}</div>}
          <button
            className="btn-secondary"
            disabled={!setupText.trim()}
            onClick={() => {
              const err = onStartFrom(setupText);
              setSetupError(err);
              if (!err) setSetupText('');
            }}
          >
            Start from here
          </button>
        </details>
      </div>

      <div className="panel-footer live-footer">
        {confirmNew ? (
          <div className="live-confirm">
            <span>Start a new game?</span>
            <button
              className="btn-primary"
              onClick={() => {
                setConfirmNew(false);
                onNewGame();
              }}
            >
              New game
            </button>
            <button className="btn-secondary" onClick={() => setConfirmNew(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="live-controls">
            <button className="btn-secondary" onClick={onUndo} disabled={!game.moves.length} title="Take back the last move (Ctrl+Z)">
              <NavIcon d="M16 5l-9 7 9 7z" /> Undo
            </button>
            <button className="btn-secondary" onClick={() => (game.moves.length ? setConfirmNew(true) : onNewGame())}>
              New game
            </button>
            <button className="btn-secondary" onClick={onFlip} title="Flip board (F)">
              Flip
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
