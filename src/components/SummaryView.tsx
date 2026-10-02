import type { Classification, Color, GameReview, Phase } from '../lib/types';
import { CLASS_LABEL } from '../lib/feedback';
import { ClassIcon, CLASS_COLOR } from './ClassIcon';
import { Avatar, CoachAvatar, RichText } from './common';
import { EvalGraph } from './EvalGraph';

const TABLE_ROWS: Classification[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
];

function phaseIcon(acc: number | null, allBook: boolean): Classification | null {
  if (acc === null) return null;
  if (allBook) return 'book';
  if (acc >= 95) return 'best';
  if (acc >= 85) return 'excellent';
  if (acc >= 72) return 'good';
  if (acc >= 60) return 'inaccuracy';
  if (acc >= 45) return 'mistake';
  return 'blunder';
}

/** The coach's opening line for the summary screen. */
export function summaryMessage(review: GameReview, color: Color): string {
  const s = review.summary[color];
  const them = review.summary[color === 'w' ? 'b' : 'w'];
  const acc = Math.round(s.accuracy);
  const errors = s.counts.blunder + s.counts.mistake + s.counts.miss;
  const opening = review.opening ? `The ${review.opening.name}. ` : '';
  let verdict: string;
  if (acc >= 88) verdict = `Excellent play — **${acc}%** accuracy!`;
  else if (acc >= 78) verdict = `A solid game with **${acc}%** accuracy.`;
  else if (acc >= 65) verdict = `You played with **${acc}%** accuracy — there's room to grow.`;
  else verdict = `A tough one: **${acc}%** accuracy.`;
  const errText =
    errors === 0
      ? 'No serious errors — well done.'
      : `${s.counts.blunder ? `${s.counts.blunder} blunder${s.counts.blunder > 1 ? 's' : ''}` : ''}${
          s.counts.blunder && s.counts.mistake + s.counts.miss ? ' and ' : ''
        }${s.counts.mistake + s.counts.miss ? `${s.counts.mistake + s.counts.miss} other key error${s.counts.mistake + s.counts.miss > 1 ? 's' : ''}` : ''} decided a lot here.`;
  const compare = s.accuracy > them.accuracy + 5 ? ' You outplayed your opponent overall.' : '';
  return `${opening}${verdict} ${errText}${compare} Let's look at the key moments.`;
}

export function SummaryView({
  review,
  perspective,
  ply,
  onSelectPly,
  onStart,
}: {
  review: GameReview;
  perspective: Color;
  ply: number;
  onSelectPly: (ply: number) => void;
  onStart: () => void;
}) {
  const { headers } = review.game;
  const { w, b } = review.summary;
  const allBook = (c: Color, p: Phase) => review.moves.filter((m) => m.color === c && m.phase === p).every((m) => m.classification === 'book');

  return (
    <div className="summary">
      <div className="panel-scroll">
        <div className="coach-row">
          <CoachAvatar size={56} />
          <div className="bubble">
            <RichText text={summaryMessage(review, perspective)} />
          </div>
        </div>

        <EvalGraph initial={review.initialEval} moves={review.moves} ply={ply} onSelect={onSelectPly} height={80} />

        <div className="stats-table">
          <div className="stats-row players-row">
            <span className="stats-label">Players</span>
            <span className="stats-player">
              <Avatar color="w" size={38} />
              <span className="stats-player-name" title={headers.white}>
                {headers.white}
              </span>
            </span>
            <span />
            <span className="stats-player">
              <Avatar color="b" size={38} />
              <span className="stats-player-name" title={headers.black}>
                {headers.black}
              </span>
            </span>
          </div>
          <div className="stats-row accuracy-row">
            <span className="stats-label">Accuracy</span>
            <span className="acc-box acc-white">{w.accuracy.toFixed(1)}</span>
            <span />
            <span className="acc-box acc-black">{b.accuracy.toFixed(1)}</span>
          </div>

          <div className="stats-divider" />
          {TABLE_ROWS.map((cls) => (
            <div className="stats-row count-row" key={cls}>
              <span className="stats-label" style={{ color: CLASS_COLOR[cls] }}>
                {CLASS_LABEL[cls]}
              </span>
              <span className="count" style={{ color: CLASS_COLOR[cls] }}>
                {w.counts[cls]}
              </span>
              <span className="count-icon">
                <ClassIcon cls={cls} size={24} title={CLASS_LABEL[cls]} />
              </span>
              <span className="count" style={{ color: CLASS_COLOR[cls] }}>
                {b.counts[cls]}
              </span>
            </div>
          ))}
          <div className="stats-divider" />

          <div className="stats-row rating-row">
            <span className="stats-label">Game Rating</span>
            <span className="rating-box rating-white" title="Estimated from accuracy in this game">
              {w.estimatedRating}
            </span>
            <span />
            <span className="rating-box rating-black" title="Estimated from accuracy in this game">
              {b.estimatedRating}
            </span>
          </div>
          {(['opening', 'middlegame', 'endgame'] as Phase[]).map((p) => {
            const wi = phaseIcon(w.phases[p], allBook('w', p));
            const bi = phaseIcon(b.phases[p], allBook('b', p));
            if (!wi && !bi) return null;
            return (
              <div className="stats-row phase-row" key={p}>
                <span className="stats-label">{p[0].toUpperCase() + p.slice(1)}</span>
                <span className="phase-cell" title={w.phases[p] !== null ? `${Math.round(w.phases[p]!)}%` : ''}>
                  {wi && <ClassIcon cls={wi} size={26} />}
                </span>
                <span />
                <span className="phase-cell" title={b.phases[p] !== null ? `${Math.round(b.phases[p]!)}%` : ''}>
                  {bi && <ClassIcon cls={bi} size={26} />}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="panel-footer">
        <button className="btn-primary btn-xl" onClick={onStart}>
          Start Review
        </button>
      </div>
    </div>
  );
}
