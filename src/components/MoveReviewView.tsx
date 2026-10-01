import type { AnalyzedMove, Color, GameReview } from '../lib/types';
import { CLASS_LABEL } from '../lib/feedback';
import { formatScore } from '../lib/scoring';
import { ClassIcon, CLASS_COLOR } from './ClassIcon';
import { CoachAvatar, RichText } from './common';
import { EvalGraph } from './EvalGraph';
import { MoveList } from './MoveList';

export const RETRYABLE = new Set(['inaccuracy', 'mistake', 'miss', 'blunder']);
export const KEY_MOMENTS = new Set(['brilliant', 'great', 'mistake', 'miss', 'blunder']);

export interface RetryState {
  ply: number;
  status: 'waiting' | 'checking' | 'correct' | 'close' | 'wrong' | 'solved';
  message?: string;
}

function EvalPill({ move }: { move: AnalyzedMove }) {
  const s = move.evalAfter;
  const whiteAhead = s.cp >= 0;
  return <span className={`eval-pill ${whiteAhead ? 'pill-white' : 'pill-black'}`}>{formatScore(s)}</span>;
}

function CoachBubble({
  review,
  ply,
  perspective,
  showBest,
  retry,
}: {
  review: GameReview;
  ply: number;
  perspective: Color;
  showBest: boolean;
  retry: RetryState | null;
}) {
  if (retry) {
    const move = review.moves[retry.ply - 1];
    const tone =
      retry.status === 'correct' || retry.status === 'solved' ? 'best' : retry.status === 'close' ? 'good' : retry.status === 'wrong' ? 'mistake' : null;
    return (
      <div className="bubble move-bubble">
        <div className="bubble-head">
          {tone && <ClassIcon cls={tone} size={22} />}
          <span className="bubble-title" style={tone ? { color: CLASS_COLOR[tone] } : undefined}>
            {retry.status === 'waiting' && `Find a better move for ${move.color === 'w' ? 'White' : 'Black'}`}
            {retry.status === 'checking' && 'Checking your move…'}
            {retry.status === 'correct' && 'Correct!'}
            {retry.status === 'close' && 'Good move!'}
            {retry.status === 'wrong' && 'Not quite'}
            {retry.status === 'solved' && 'Solution'}
          </span>
        </div>
        <p>
          <RichText
            text={
              retry.message ??
              `You played **${move.san}** here. Make a move on the board — click a piece, then its destination.`
            }
          />
        </p>
      </div>
    );
  }

  if (ply === 0) {
    return (
      <div className="bubble move-bubble">
        <div className="bubble-head">
          <span className="bubble-title">Starting position</span>
        </div>
        <p>
          You're reviewing as <strong>{perspective === 'w' ? 'White' : 'Black'}</strong>
          {review.opening ? (
            <>
              . This game is a <strong>{review.opening.name}</strong> ({review.opening.eco})
            </>
          ) : null}
          . Press <strong>Next</strong> or use the arrow keys to step through the moves.
        </p>
      </div>
    );
  }

  const move = review.moves[ply - 1];
  const cls = move.classification;
  return (
    <div className="bubble move-bubble">
      <div className="bubble-head">
        <ClassIcon cls={cls} size={22} title={CLASS_LABEL[cls]} />
        <span className="bubble-title" style={{ color: CLASS_COLOR[cls] }}>
          {move.feedback.headline}
        </span>
        <EvalPill move={move} />
      </div>
      <p>
        <RichText text={move.feedback.text} />
      </p>
      {showBest && move.bestLine.length > 0 && (
        <div className="line-box">
          <span className="line-label">Best line</span>
          <span className="line-moves">
            {move.moveNumber}
            {move.color === 'w' ? '.' : '...'} {move.bestLine.slice(0, 8).join(' ')}
          </span>
        </div>
      )}
      {showBest && move.replyLine.length > 0 && RETRYABLE.has(cls) && (
        <div className="line-box">
          <span className="line-label">After {move.san}</span>
          <span className="line-moves">{move.replyLine.slice(0, 8).join(' ')}</span>
        </div>
      )}
    </div>
  );
}

export function MoveReviewView({
  review,
  ply,
  perspective,
  showBest,
  retry,
  onSelectPly,
  onToggleBest,
  onRetry,
  onExitRetry,
  onShowSolution,
}: {
  review: GameReview;
  ply: number;
  perspective: Color;
  showBest: boolean;
  retry: RetryState | null;
  onSelectPly: (ply: number) => void;
  onToggleBest: () => void;
  onRetry: () => void;
  onExitRetry: () => void;
  onShowSolution: () => void;
}) {
  const move = ply > 0 ? review.moves[ply - 1] : null;
  const canRetry = !!move && RETRYABLE.has(move.classification) && !retry;
  const total = review.moves.length;
  const nextKey = review.moves.find((m) => m.ply > ply && m.color === perspective && KEY_MOMENTS.has(m.classification));
  const prevKey = [...review.moves].reverse().find((m) => m.ply < ply && m.color === perspective && KEY_MOMENTS.has(m.classification));

  return (
    <div className="move-review">
      <div className="coach-row">
        <CoachAvatar size={56} />
        <CoachBubble review={review} ply={ply} perspective={perspective} showBest={showBest} retry={retry} />
      </div>
      <div className="bubble-actions">
        {retry ? (
          <>
            {retry.status !== 'solved' && retry.status !== 'correct' && (
              <button className="btn-secondary" onClick={onShowSolution}>
                Show solution
              </button>
            )}
            <button className="btn-secondary" onClick={onExitRetry}>
              Back to review
            </button>
          </>
        ) : (
          <>
            {move && move.bestMove && move.classification !== 'book' && move.classification !== 'forced' && (
              <button className={`btn-secondary${showBest ? ' active' : ''}`} onClick={onToggleBest}>
                <ClassIcon cls="best" size={16} /> {showBest ? 'Hide best' : 'Best'}
              </button>
            )}
            {canRetry && (
              <button className="btn-secondary" onClick={onRetry}>
                ↻ Retry
              </button>
            )}
          </>
        )}
      </div>

      <EvalGraph initial={review.initialEval} moves={review.moves} ply={ply} onSelect={onSelectPly} height={56} />

      <MoveList moves={review.game.moves} analyzed={review.moves} ply={ply} onSelect={onSelectPly} />

      <div className="panel-footer review-footer">
        <div className="key-nav">
          <button className="btn-ghost" disabled={!prevKey} onClick={() => prevKey && onSelectPly(prevKey.ply)}>
            ‹ Prev key moment
          </button>
          <button className="btn-ghost" disabled={!nextKey} onClick={() => nextKey && onSelectPly(nextKey.ply)}>
            Next key moment ›
          </button>
        </div>
        <div className="nav-row">
          <button className="nav-btn" aria-label="First move" onClick={() => onSelectPly(0)} disabled={ply === 0}>
            <NavIcon d="M7 5v14M18 5l-8 7 8 7z" />
          </button>
          <button className="nav-btn" aria-label="Previous move" onClick={() => onSelectPly(Math.max(0, ply - 1))} disabled={ply === 0}>
            <NavIcon d="M16 5l-9 7 9 7z" />
          </button>
          <button className="btn-primary nav-next" onClick={() => onSelectPly(Math.min(total, ply + 1))} disabled={ply === total}>
            Next
          </button>
          <button className="nav-btn" aria-label="Next move" onClick={() => onSelectPly(Math.min(total, ply + 1))} disabled={ply === total}>
            <NavIcon d="M8 5l9 7-9 7z" />
          </button>
          <button className="nav-btn" aria-label="Last move" onClick={() => onSelectPly(total)} disabled={ply === total}>
            <NavIcon d="M17 5v14M6 5l8 7-8 7z" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function NavIcon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
