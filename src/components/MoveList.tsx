import { useEffect, useRef } from 'react';
import type { AnalyzedMove, PlyInfo } from '../lib/types';
import { ClassIcon } from './ClassIcon';

const SHOW_ICON = new Set(['brilliant', 'great', 'best', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder']);

/** SAN with a piece figurine instead of the piece letter, like chess.com's move list. */
export function Figurine({ san }: { san: string }) {
  const p = san[0];
  if ('KQRBN'.includes(p)) {
    return (
      <span className="san">
        <img className="figurine" src={`${import.meta.env.BASE_URL}pieces/w${p}.svg`} alt={p} />
        {san.slice(1)}
      </span>
    );
  }
  return <span className="san">{san}</span>;
}

export function MoveList({
  moves,
  analyzed,
  ply,
  onSelect,
}: {
  moves: PlyInfo[];
  analyzed?: AnalyzedMove[];
  ply: number;
  onSelect: (ply: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector('.move.current') as HTMLElement | null;
    if (el && ref.current) {
      const box = ref.current;
      const top = el.offsetTop - box.offsetTop;
      if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 30) box.scrollTop = top - box.clientHeight / 2;
    }
  }, [ply]);

  const rows = [];
  for (let i = 0; i < moves.length; i += 2) {
    const cell = (idx: number) => {
      const m = moves[idx];
      if (!m) return <span className="move empty" />;
      const a = analyzed?.[idx];
      return (
        <button className={`move${m.ply === ply ? ' current' : ''}`} onClick={() => onSelect(m.ply)}>
          {a && SHOW_ICON.has(a.classification) && <ClassIcon cls={a.classification} size={16} />}
          <Figurine san={m.san} />
        </button>
      );
    };
    rows.push(
      <div className="move-row" key={i}>
        <span className="move-no">{moves[i].moveNumber}.</span>
        {moves[i].color === 'b' ? (
          <>
            <span className="move empty">…</span>
            {cell(i)}
          </>
        ) : (
          <>
            {cell(i)}
            {cell(i + 1)}
          </>
        )}
      </div>,
    );
    if (moves[i].color === 'b') i--; // game started with Black to move
  }
  return (
    <div className="move-list" ref={ref}>
      {rows}
    </div>
  );
}
