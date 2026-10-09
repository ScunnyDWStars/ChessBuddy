import { useEffect, useMemo, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import type { Color } from '../lib/types';

/**
 * Click-to-move for one side: click a piece, then one of the highlighted
 * squares. `fen` is the position moves are made from.
 */
export function useMoveInput(fen: string | null, color: Color | null, onMove: (from: string, to: string) => void) {
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => setSelected(null), [fen]);

  const targets = useMemo(() => {
    if (!fen || !selected) return [];
    return new Chess(fen).moves({ square: selected as Square, verbose: true }).map((m) => m.to as string);
  }, [fen, selected]);

  const onSquareClick = (sq: string) => {
    if (!fen || !color) return;
    if (selected && targets.includes(sq)) {
      setSelected(null);
      onMove(selected, sq);
      return;
    }
    const piece = new Chess(fen).get(sq as Square);
    setSelected(piece && piece.color === color && sq !== selected ? sq : null);
  };

  return { selected, targets, onSquareClick, clear: () => setSelected(null) };
}
