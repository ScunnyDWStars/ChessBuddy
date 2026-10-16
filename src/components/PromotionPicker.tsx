import type { Color } from '../lib/types';

const PIECES = ['q', 'r', 'b', 'n'] as const;
const NAMES = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' } as const;

/** Asks which piece a pawn promotes to. */
export function PromotionPicker({ color, onPick, onCancel }: { color: Color; onPick: (p: string) => void; onCancel: () => void }) {
  return (
    <div className="promo-backdrop" onClick={onCancel} role="dialog" aria-label="Choose a piece to promote to">
      <div className="promo-box" onClick={(e) => e.stopPropagation()}>
        <span className="promo-title">Promote to</span>
        <div className="promo-pieces">
          {PIECES.map((p) => (
            <button key={p} className="promo-piece" onClick={() => onPick(p)} aria-label={NAMES[p]} title={NAMES[p]} autoFocus={p === 'q'}>
              <img src={`${import.meta.env.BASE_URL}pieces/${color}${p.toUpperCase()}.svg`} alt="" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
