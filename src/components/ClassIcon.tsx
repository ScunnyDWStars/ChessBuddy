import type { Classification } from '../lib/types';

export const CLASS_COLOR: Record<Classification, string> = {
  brilliant: '#26c2a3',
  great: '#749bbf',
  best: '#81b64c',
  excellent: '#81b64c',
  good: '#95b776',
  book: '#a88865',
  inaccuracy: '#f7c631',
  mistake: '#ffa459',
  miss: '#ff7769',
  blunder: '#fa412d',
  forced: '#97af8b',
};

function Glyph({ cls }: { cls: Classification }) {
  const text = (t: string, size = 11) => (
    <text x="10" y="10.5" textAnchor="middle" dominantBaseline="central" fontSize={size} fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif" letterSpacing="-0.5">
      {t}
    </text>
  );
  switch (cls) {
    case 'brilliant':
      return text('!!', 10);
    case 'great':
      return text('!');
    case 'inaccuracy':
      return text('?!', 10);
    case 'mistake':
      return text('?');
    case 'blunder':
      return text('??', 10);
    case 'best':
      return <path d="M10 4.2l1.75 3.6 3.95.55-2.86 2.77.68 3.93L10 13.2l-3.52 1.85.68-3.93-2.86-2.77 3.95-.55z" fill="#fff" />;
    case 'excellent':
      return (
        <path
          d="M6 9.2h1.8v5.6H6zM8.6 14.8V9.4l2.2-3.6c.3-.5 1-.5 1.3 0 .2.3.2.6.1.9l-.7 2.1h2.8c.7 0 1.2.6 1 1.3l-.9 3.6c-.1.6-.6 1-1.2 1H8.6z"
          fill="#fff"
        />
      );
    case 'good':
      return <path d="M5.6 10.4l2.9 2.9 5.9-6" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />;
    case 'book':
      return (
        <path
          d="M5 6.4c1.6-.5 3.3-.4 4.5.5v7.5c-1.2-.8-2.9-.9-4.5-.4zM15 6.4c-1.6-.5-3.3-.4-4.5.5v7.5c1.2-.8 2.9-.9 4.5-.4z"
          fill="#fff"
        />
      );
    case 'miss':
      return <path d="M6.6 6.6l6.8 6.8M13.4 6.6l-6.8 6.8" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" />;
    case 'forced':
      return <path d="M5.5 10h8M10.5 6.5L14 10l-3.5 3.5" stroke="#fff" strokeWidth="2.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />;
  }
}

/** Round classification badge (brilliant "!!", blunder "??", best star, …). */
export function ClassIcon({ cls, size = 20, title }: { cls: Classification; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className="class-icon" role="img" aria-label={title ?? cls}>
      <circle cx="10" cy="10.6" r="9.4" fill="rgba(0,0,0,0.25)" />
      <circle cx="10" cy="10" r="9.4" fill={CLASS_COLOR[cls]} />
      <Glyph cls={cls} />
    </svg>
  );
}
