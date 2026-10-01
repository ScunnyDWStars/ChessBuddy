export interface RemoteGame {
  id: string;
  source: 'chess.com' | 'lichess';
  white: string;
  black: string;
  whiteRating?: number;
  blackRating?: number;
  result: string;
  timeClass?: string;
  endTime?: number;
  pgn: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) throw new Error('Player not found.');
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  return res.json() as Promise<T>;
}

interface ChessComGame {
  url: string;
  pgn?: string;
  end_time?: number;
  time_class?: string;
  rules?: string;
  white: { username: string; rating?: number; result: string };
  black: { username: string; rating?: number; result: string };
}

const chessComResult = (g: ChessComGame) =>
  g.white.result === 'win' ? '1-0' : g.black.result === 'win' ? '0-1' : '½-½';

/** Most recent standard games from chess.com's public API (newest first). */
export async function fetchChessComGames(username: string, max = 20): Promise<RemoteGame[]> {
  const user = encodeURIComponent(username.trim().toLowerCase());
  const { archives } = await getJson<{ archives: string[] }>(`https://api.chess.com/pub/player/${user}/games/archives`);
  const games: RemoteGame[] = [];
  for (const archive of [...archives].reverse()) {
    const { games: monthly } = await getJson<{ games: ChessComGame[] }>(archive);
    for (const g of [...monthly].reverse()) {
      if (!g.pgn || (g.rules && g.rules !== 'chess')) continue;
      games.push({
        id: g.url,
        source: 'chess.com',
        white: g.white.username,
        black: g.black.username,
        whiteRating: g.white.rating,
        blackRating: g.black.rating,
        result: chessComResult(g),
        timeClass: g.time_class,
        endTime: g.end_time ? g.end_time * 1000 : undefined,
        pgn: g.pgn,
      });
      if (games.length >= max) return games;
    }
    if (games.length >= max) break;
  }
  return games;
}

interface LichessGame {
  id: string;
  speed?: string;
  variant?: string;
  winner?: 'white' | 'black';
  status?: string;
  lastMoveAt?: number;
  players: {
    white: { user?: { name: string }; rating?: number; aiLevel?: number };
    black: { user?: { name: string }; rating?: number; aiLevel?: number };
  };
  pgn?: string;
}

/** Most recent standard games from the lichess API (newest first). */
export async function fetchLichessGames(username: string, max = 20): Promise<RemoteGame[]> {
  const user = encodeURIComponent(username.trim());
  const res = await fetch(
    `https://lichess.org/api/games/user/${user}?max=${max}&pgnInJson=true&clocks=true&perfType=ultraBullet,bullet,blitz,rapid,classical,correspondence`,
    { headers: { Accept: 'application/x-ndjson' } },
  );
  if (res.status === 404) throw new Error('Player not found.');
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  const text = await res.text();
  return text
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as LichessGame)
    .filter((g) => g.pgn && (!g.variant || g.variant === 'standard'))
    .map((g) => ({
      id: g.id,
      source: 'lichess' as const,
      white: g.players.white.user?.name ?? (g.players.white.aiLevel ? `Stockfish level ${g.players.white.aiLevel}` : 'Anonymous'),
      black: g.players.black.user?.name ?? (g.players.black.aiLevel ? `Stockfish level ${g.players.black.aiLevel}` : 'Anonymous'),
      whiteRating: g.players.white.rating,
      blackRating: g.players.black.rating,
      result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½',
      timeClass: g.speed,
      endTime: g.lastMoveAt,
      pgn: g.pgn!,
    }));
}
