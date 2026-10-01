import { useMemo, type CSSProperties } from 'react';
import type { Classification, Color } from '../lib/types';
import { ClassIcon, CLASS_COLOR } from './ClassIcon';

export interface Arrow {
  from: string;
  to: string;
  color: string;
}

interface BoardProps {
  fen: string;
  orientation: Color;
  lastMove?: { from: string; to: string };
  /** Classification shown as a tint on the last move squares and a badge on the destination. */
  classification?: Classification;
  arrows?: Arrow[];
  /** Key that changes whenever the position advanced by `lastMove` (triggers the slide animation). */
  animateKey?: string;
  selected?: string | null;
  targets?: string[];
  onSquareClick?: (square: string) => void;
}

const FILES = 'abcdefgh';
const PIECE_URL = (color: string, type: string) => `${import.meta.env.BASE_URL}pieces/${color}${type.toUpperCase()}.svg`;

function parseBoard(fen: string): Map<string, { color: 'w' | 'b'; type: string }> {
  const out = new Map<string, { color: 'w' | 'b'; type: string }>();
  const rows = fen.split(' ')[0].split('/');
  rows.forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        out.set(`${FILES[f]}${8 - r}`, { color, type: ch.toLowerCase() });
        f++;
      }
    }
  });
  return out;
}

/** Board coordinates (0..7 from the top-left as displayed) for a square. */
function coords(square: string, orientation: Color): { x: number; y: number } {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]) - 1;
  return orientation === 'w' ? { x: file, y: 7 - rank } : { x: 7 - file, y: rank };
}

function ArrowShape({ arrow, orientation }: { arrow: Arrow; orientation: Color }) {
  const a = coords(arrow.from, orientation);
  const b = coords(arrow.to, orientation);
  const x1 = a.x + 0.5;
  const y1 = a.y + 0.5;
  const x2 = b.x + 0.5;
  const y2 = b.y + 0.5;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const head = 0.42;
  const sx = x1 + ux * 0.22;
  const sy = y1 + uy * 0.22;
  const ex = x2 - ux * head;
  const ey = y2 - uy * head;
  const px = -uy;
  const py = ux;
  const hw = 0.24;
  return (
    <g opacity={0.82}>
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={arrow.color} strokeWidth={0.19} />
      <polygon
        points={`${x2 - ux * 0.08},${y2 - uy * 0.08} ${ex + px * hw},${ey + py * hw} ${ex - px * hw},${ey - py * hw}`}
        fill={arrow.color}
      />
    </g>
  );
}

export function Board({
  fen,
  orientation,
  lastMove,
  classification,
  arrows = [],
  animateKey,
  selected,
  targets = [],
  onSquareClick,
}: BoardProps) {
  const pieces = useMemo(() => parseBoard(fen), [fen]);
  const tint = classification ? CLASS_COLOR[classification] : undefined;

  const squares = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const file = orientation === 'w' ? x : 7 - x;
      const rank = orientation === 'w' ? 7 - y : y;
      const sq = `${FILES[file]}${rank + 1}`;
      const light = (file + rank) % 2 === 1;
      const highlighted = lastMove && (lastMove.from === sq || lastMove.to === sq);
      const piece = pieces.get(sq);
      const isTarget = targets.includes(sq);
      squares.push(
        <div
          key={sq}
          className={`sq ${light ? 'light' : 'dark'}${onSquareClick ? ' clickable' : ''}`}
          onClick={onSquareClick ? () => onSquareClick(sq) : undefined}
          data-square={sq}
        >
          {highlighted && <div className="sq-tint" style={tint ? { background: tint, opacity: 0.5 } : undefined} />}
          {selected === sq && <div className="sq-tint selected" />}
          {x === 0 && <span className="coord rank">{rank + 1}</span>}
          {y === 7 && <span className="coord file">{FILES[file]}</span>}
          {isTarget && <div className={piece ? 'target-capture' : 'target-dot'} />}
        </div>,
      );
    }
  }

  const pieceEls = [...pieces.entries()].map(([sq, p]) => {
    const { x, y } = coords(sq, orientation);
    const moved = lastMove && lastMove.to === sq && animateKey;
    let style: CSSProperties = { transform: `translate(${x * 100}%, ${y * 100}%)` };
    if (moved) {
      const from = coords(lastMove.from, orientation);
      style = {
        ...style,
        ['--from' as string]: `translate(${from.x * 100}%, ${from.y * 100}%)`,
        ['--to' as string]: `translate(${x * 100}%, ${y * 100}%)`,
      };
    }
    return (
      <img
        key={moved ? `${sq}-${animateKey}` : `${sq}-${p.color}${p.type}`}
        className={`piece${moved ? ' slide' : ''}`}
        src={PIECE_URL(p.color, p.type)}
        alt=""
        draggable={false}
        style={style}
      />
    );
  });

  let badge = null;
  if (classification && lastMove) {
    const { x, y } = coords(lastMove.to, orientation);
    badge = (
      <div key={`badge-${animateKey}`} className="square-badge" style={{ left: `${(x + 1) * 12.5}%`, top: `${y * 12.5}%` }}>
        <ClassIcon cls={classification} size={32} />
      </div>
    );
  }

  return (
    <div className="board" role="img" aria-label="Chess board">
      <div className="squares">{squares}</div>
      <div className="pieces">{pieceEls}</div>
      {arrows.length > 0 && (
        <svg className="arrows" viewBox="0 0 8 8" preserveAspectRatio="none">
          {arrows.map((a, i) => (
            <ArrowShape key={i} arrow={a} orientation={orientation} />
          ))}
        </svg>
      )}
      {badge}
    </div>
  );
}
