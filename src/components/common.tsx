import type { Color } from '../lib/types';
import { richText } from '../lib/feedback';
import { PIECE_VALUE } from '../lib/chessUtils';

const BASE = import.meta.env.BASE_URL;

export function RichText({ text }: { text: string }) {
  return (
    <>
      {richText(text).map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>))}
    </>
  );
}

/** The coach character shown next to speech bubbles. */
export function CoachAvatar({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="coach-avatar" aria-hidden="true">
      <defs>
        <linearGradient id="coachBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#97c35f" />
          <stop offset="1" stopColor="#5d8f33" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="10" fill="url(#coachBg)" />
      {/* Pawn-shaped coach with glasses */}
      <circle cx="32" cy="22" r="11" fill="#f4f1ea" />
      <path d="M22 37c0-4 4.5-6.5 10-6.5S42 33 42 37l2.5 13h-25z" fill="#f4f1ea" />
      <rect x="16" y="49" width="32" height="7" rx="3" fill="#f4f1ea" />
      <circle cx="27.5" cy="22" r="3.6" fill="none" stroke="#312e2b" strokeWidth="1.8" />
      <circle cx="36.5" cy="22" r="3.6" fill="none" stroke="#312e2b" strokeWidth="1.8" />
      <path d="M31.1 22h1.8" stroke="#312e2b" strokeWidth="1.8" />
      <path d="M28.5 27.8c2 1.5 5 1.5 7 0" stroke="#312e2b" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Avatar({ color, size = 40 }: { color: Color; size?: number }) {
  return (
    <div className={`avatar ${color === 'w' ? 'avatar-white' : 'avatar-black'}`} style={{ width: size, height: size }}>
      <img src={`${BASE}pieces/${color}P.svg`} alt="" />
    </div>
  );
}

const START_COUNT: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };

/** Pieces of the opponent that `color` has captured, plus the material lead. */
export function capturedBy(fen: string, color: Color): { pieces: string[]; lead: number } {
  const board = fen.split(' ')[0];
  const count = (ch: string) => board.split('').filter((c) => c === ch).length;
  const pieces: string[] = [];
  let mine = 0;
  let theirs = 0;
  for (const t of ['q', 'r', 'b', 'n', 'p']) {
    const theirChar = color === 'w' ? t : t.toUpperCase();
    const myChar = color === 'w' ? t.toUpperCase() : t;
    const missing = Math.max(0, START_COUNT[t] - count(theirChar));
    for (let i = 0; i < missing; i++) pieces.push(t);
    mine += count(myChar) * PIECE_VALUE[t];
    theirs += count(theirChar) * PIECE_VALUE[t];
  }
  return { pieces: pieces.reverse(), lead: mine - theirs };
}

function formatClock(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const ss = r < 10 && s < 60 ? r.toFixed(1).padStart(4, '0') : String(Math.floor(r)).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function PlayerStrip({
  name,
  rating,
  color,
  fen,
  clock,
  active,
}: {
  name: string;
  rating?: string;
  color: Color;
  fen: string;
  clock?: number;
  active: boolean;
}) {
  const { pieces, lead } = capturedBy(fen, color);
  const capturedColor = color === 'w' ? 'b' : 'w';
  return (
    <div className="player-strip">
      <Avatar color={color} />
      <div className="player-info">
        <div className="player-name">
          {name} {rating && <span className="player-rating">({rating})</span>}
        </div>
        <div className="captured">
          {pieces.map((p, i) => (
            <img key={i} className={`cap cap-${p}`} src={`${BASE}pieces/${capturedColor}${p.toUpperCase()}.svg`} alt="" />
          ))}
          {lead > 0 && <span className="material-lead">+{lead}</span>}
        </div>
      </div>
      {clock !== undefined && <div className={`clock ${color === 'w' ? 'clock-white' : 'clock-black'}${active ? ' active' : ''}`}>{formatClock(clock)}</div>}
    </div>
  );
}
