import type { Puzzle, PuzzleTheme } from '../lib/puzzles';
import { THEME_LABEL } from '../lib/puzzles';
import { CLASS_LABEL } from '../lib/feedback';
import type { PracticeSession } from '../hooks/usePracticeSession';
import { ClassIcon, CLASS_COLOR } from './ClassIcon';
import { CoachAvatar, RichText } from './common';

const THEMES: PuzzleTheme[] = ['hanging', 'missed-tactic', 'missed-mate', 'king-safety', 'other'];

const STATUS_TITLE = {
  waiting: null,
  checking: 'Checking your move…',
  correct: 'Correct!',
  close: 'Close',
  wrong: 'Not quite',
  played: 'Same as the game',
  solved: 'Solution',
} as const;

const STATUS_ICON = { correct: 'best', close: 'good', wrong: 'mistake', played: 'mistake', solved: 'best' } as const;

export function PracticeView({
  session: s,
  puzzles,
  onOpenGame,
  onLoad,
}: {
  session: PracticeSession;
  puzzles: Puzzle[];
  onOpenGame: (gameKey: string, ply: number) => void;
  onLoad: () => void;
}) {
  const attempts = puzzles.reduce((a, p) => a + p.srs.attempts, 0);
  const correct = puzzles.reduce((a, p) => a + p.srs.correct, 0);
  const counts = new Map<PuzzleTheme, number>();
  puzzles.forEach((p) => counts.set(p.theme, (counts.get(p.theme) ?? 0) + 1));

  if (puzzles.length === 0) {
    return (
      <div className="panel-scroll">
        <div className="coach-row">
          <CoachAvatar size={56} />
          <div className="bubble">
            No puzzles yet. Every <strong>mistake, miss or blunder</strong> you make in a reviewed game becomes a puzzle here, so you can practise
            finding the move you missed. Sample games don't count.
          </div>
        </div>
        <button className="btn-primary" onClick={onLoad}>
          Review a game
        </button>
      </div>
    );
  }

  const p = s.current;
  const title = STATUS_TITLE[s.status];
  const icon = s.status in STATUS_ICON ? STATUS_ICON[s.status as keyof typeof STATUS_ICON] : null;
  const finished = s.status === 'correct' || s.status === 'solved';

  return (
    <div className="practice">
      <div className="panel-scroll">
        <div className="insight-stats">
          <div className="insight-stat">
            <span className="insight-stat-value">{s.dueCount}</span>
            <span className="insight-stat-label">Due now</span>
          </div>
          <div className="insight-stat">
            <span className="insight-stat-value">{attempts ? `${Math.round((correct / attempts) * 100)}%` : '—'}</span>
            <span className="insight-stat-label">Solved ({puzzles.length} puzzles)</span>
          </div>
          <div className="insight-stat">
            <span className="insight-stat-value">{s.stats.streak}</span>
            <span className="insight-stat-label">Streak</span>
          </div>
        </div>

        <div className="chips" role="group" aria-label="Filter puzzles by theme">
          <button className={`chip${!s.themes ? ' active' : ''}`} onClick={() => s.chooseThemes(null)}>
            All
          </button>
          {THEMES.filter((t) => counts.get(t)).map((t) => (
            <button key={t} className={`chip${s.themes?.length === 1 && s.themes[0] === t ? ' active' : ''}`} onClick={() => s.chooseThemes([t])}>
              {THEME_LABEL[t]} <span className="chip-count">{counts.get(t)}</span>
            </button>
          ))}
        </div>

        {p ? (
          <div className="coach-row">
            <CoachAvatar size={56} />
            <div className="bubble move-bubble">
              <div className="bubble-head">
                {icon && <ClassIcon cls={icon} size={22} />}
                <span className="bubble-title" style={icon ? { color: CLASS_COLOR[icon] } : undefined}>
                  {title ?? `${p.color === 'w' ? 'White' : 'Black'} to move`}
                </span>
                <span className="puzzle-theme">{THEME_LABEL[p.theme]}</span>
              </div>
              <p>
                <RichText
                  text={
                    s.message ??
                    `In your game vs ${p.color === 'w' ? p.black : p.white} you played **${p.playedSan}** here — a ${CLASS_LABEL[p.classification].toLowerCase()}. Find the best move: click a piece, then its destination.`
                  }
                />
              </p>
            </div>
          </div>
        ) : (
          <div className="coach-row">
            <CoachAvatar size={56} />
            <div className="bubble">
              {s.filteredCount ? (
                <>
                  <strong>All caught up!</strong> No puzzles are due{s.themes ? ' in this theme' : ''}. Puzzles you solve come back after 1, 3, 7
                  and 21 days; ones you miss come back tomorrow.
                </>
              ) : (
                <>No puzzles in this theme yet.</>
              )}
            </div>
          </div>
        )}

        <div className="bubble-actions practice-actions">
          {p && !finished && (
            <>
              <button className="btn-secondary" onClick={s.showHint} disabled={!!s.hintSquare || s.status === 'checking'}>
                Hint
              </button>
              <button className="btn-secondary" onClick={s.showSolution} disabled={s.status === 'checking'}>
                Show solution
              </button>
            </>
          )}
          {p && (
            <button className="btn-ghost" onClick={() => onOpenGame(p.gameKey, p.ply)}>
              Open in game review ›
            </button>
          )}
          {!p && s.filteredCount > 0 && (
            <button className="btn-secondary" onClick={s.practiseAnyway}>
              Practise anyway
            </button>
          )}
        </div>
        {(s.stats.tried > 0 || s.extra) && (
          <p className="muted small">
            This session: {s.stats.solved} of {s.stats.tried} solved{s.extra ? ' · extra practice' : ''}.
          </p>
        )}
      </div>
      <div className="panel-footer">
        <button className="btn-primary btn-xl" onClick={s.next} disabled={!p && s.queueLength === 0}>
          {p ? (finished ? 'Next puzzle' : 'Skip') : 'Next puzzle'}
        </button>
      </div>
    </div>
  );
}
