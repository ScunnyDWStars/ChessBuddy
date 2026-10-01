import { useState } from 'react';
import { SAMPLE_GAMES } from '../data/samples';
import { fetchChessComGames, fetchLichessGames, type RemoteGame } from '../lib/importers';
import { splitPgn, parsePgn } from '../lib/pgn';
import type { RecentReview } from '../lib/storage';
import { CoachAvatar } from './common';

export const DEPTHS = [
  { depth: 12, label: 'Fast', hint: 'Quick look' },
  { depth: 15, label: 'Standard', hint: 'Recommended' },
  { depth: 18, label: 'Deep', hint: 'Slower, sharper' },
];

function describe(pgn: string): string {
  try {
    const g = parsePgn(pgn);
    return `${g.headers.white} vs ${g.headers.black} · ${g.headers.result}${g.headers.date ? ` · ${g.headers.date}` : ''} · ${Math.ceil(g.moves.length / 2)} moves`;
  } catch {
    return 'Unreadable game';
  }
}

export function LoadView({
  depth,
  onDepth,
  onLoad,
  recent,
  onOpenRecent,
  error,
}: {
  depth: number;
  onDepth: (d: number) => void;
  onLoad: (pgn: string, username?: string) => void;
  recent: RecentReview[];
  onOpenRecent: (r: RecentReview) => void;
  error: string | null;
}) {
  const [text, setText] = useState('');
  const [choices, setChoices] = useState<string[] | null>(null);
  const [source, setSource] = useState<'chess.com' | 'lichess'>('chess.com');
  const [username, setUsername] = useState('');
  const [remote, setRemote] = useState<RemoteGame[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const submit = (pgnText: string) => {
    const games = splitPgn(pgnText);
    if (games.length > 1) setChoices(games);
    else if (games.length === 1) onLoad(games[0]);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const content = await file.text();
    setText(content);
    submit(content);
  };

  const fetchGames = async () => {
    if (!username.trim()) return;
    setFetching(true);
    setFetchError(null);
    setRemote(null);
    try {
      const games = source === 'chess.com' ? await fetchChessComGames(username) : await fetchLichessGames(username);
      setRemote(games);
      if (games.length === 0) setFetchError('No standard games found for this player.');
    } catch (e) {
      const site = source === 'chess.com' ? 'Chess.com' : 'Lichess';
      // A network/CSP block surfaces as a TypeError ("Failed to fetch").
      setFetchError(
        e instanceof TypeError
          ? `Couldn't reach ${site} from this page. Open the game on ${site}, choose Share → PGN, copy it and paste it above.`
          : `${(e as Error).message} Check the username, or paste the PGN instead.`,
      );
    } finally {
      setFetching(false);
    }
  };

  const me = username.trim().toLowerCase();

  return (
    <div className="panel-scroll load-view">
      <div className="coach-row">
        <CoachAvatar size={56} />
        <div className="bubble">
          Load one of your games and I'll go through it move by move — what went well, what went wrong, and what to practise to gain rating.
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {choices ? (
        <section className="card">
          <div className="card-head">
            <h3>Choose a game ({choices.length} found)</h3>
            <button className="btn-ghost" onClick={() => setChoices(null)}>
              Back
            </button>
          </div>
          <div className="game-list">
            {choices.map((g, i) => (
              <button key={i} className="game-item" onClick={() => onLoad(g)}>
                {describe(g)}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className="card">
            <h3>Paste PGN</h3>
            <textarea
              className="pgn-input"
              placeholder={'[Event "Live Chess"]\n[White "you"]\n[Black "opponent"]\n\n1. e4 e5 2. Nf3 Nc6 ...'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
            />
            <div className="row gap">
              <button className="btn-primary" disabled={!text.trim()} onClick={() => submit(text)}>
                Review game
              </button>
              <label className="btn-secondary file-btn">
                Upload .pgn
                <input type="file" accept=".pgn,.txt,application/x-chess-pgn,text/plain" onChange={(e) => onFile(e.target.files?.[0])} hidden />
              </label>
            </div>
          </section>

          <section className="card">
            <h3>Import by username</h3>
            <div className="segmented">
              {(['chess.com', 'lichess'] as const).map((s) => (
                <button key={s} className={source === s ? 'active' : ''} onClick={() => setSource(s)}>
                  {s === 'chess.com' ? 'Chess.com' : 'Lichess'}
                </button>
              ))}
            </div>
            <form
              className="row gap"
              onSubmit={(e) => {
                e.preventDefault();
                void fetchGames();
              }}
            >
              <input className="text-input" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
              <button className="btn-secondary" type="submit" disabled={fetching || !username.trim()}>
                {fetching ? 'Loading…' : 'Find games'}
              </button>
            </form>
            {fetchError && <div className="error-box small">{fetchError}</div>}
            {remote && remote.length > 0 && (
              <div className="game-list">
                {remote.map((g) => {
                  const iAmWhite = g.white.toLowerCase() === me;
                  const myResult = g.result === '½-½' ? 'draw' : (g.result === '1-0') === iAmWhite ? 'win' : 'loss';
                  return (
                    <button key={g.id} className="game-item remote" onClick={() => onLoad(g.pgn, username)}>
                      <span className={`result-dot ${myResult}`} title={myResult} />
                      <span className="gi-players">
                        <span>
                          {g.white} {g.whiteRating ? <em>({g.whiteRating})</em> : null}
                        </span>
                        <span>
                          {g.black} {g.blackRating ? <em>({g.blackRating})</em> : null}
                        </span>
                      </span>
                      <span className="gi-meta">
                        {g.timeClass}
                        {g.endTime ? <> · {new Date(g.endTime).toLocaleDateString()}</> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card">
            <h3>Analysis depth</h3>
            <div className="segmented">
              {DEPTHS.map((d) => (
                <button key={d.depth} className={depth === d.depth ? 'active' : ''} onClick={() => onDepth(d.depth)} title={d.hint}>
                  {d.label}
                  <small>depth {d.depth}</small>
                </button>
              ))}
            </div>
          </section>

          {recent.length > 0 && (
            <section className="card">
              <h3>Recent reviews</h3>
              <div className="game-list">
                {recent.map((r) => (
                  <button key={r.key} className="game-item" onClick={() => onOpenRecent(r)}>
                    <span className="gi-players">
                      <span>
                        {r.white} vs {r.black}
                      </span>
                      <em>
                        {r.result} · accuracy {r.accuracy[0].toFixed(0)} / {r.accuracy[1].toFixed(0)}
                      </em>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="card">
            <h3>Try a sample game</h3>
            <div className="game-list">
              {SAMPLE_GAMES.map((s) => (
                <button key={s.id} className="game-item" onClick={() => onLoad(s.pgn, s.id === 'club-blitz' ? 'You' : undefined)}>
                  <span className="gi-players">
                    <span>{s.title}</span>
                    <em>{s.subtitle}</em>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
