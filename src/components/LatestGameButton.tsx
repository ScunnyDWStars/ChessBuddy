import { useState } from 'react';
import { fetchLatestGame } from '../lib/importers';
import { getSiteUsernames } from '../lib/library';

/**
 * One tap: fetch and review your most recent game from Chess.com and/or
 * Lichess, using the usernames saved on the Load page.
 */
export function LatestGameButton({
  onLoad,
  onNeedUsername,
  className = '',
}: {
  onLoad: (pgn: string, username: string) => void;
  onNeedUsername: () => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    const users = getSiteUsernames();
    if (!users.chesscom && !users.lichess) {
      onNeedUsername();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const game = await fetchLatestGame(users);
      if (!game) setError('No finished games found for your username.');
      else onLoad(game.pgn, game.source === 'chess.com' ? users.chesscom : users.lichess);
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Couldn't reach Chess.com or Lichess. Check your connection, or paste the game's PGN instead."
          : `${(e as Error).message} Check your username.`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`latest-game ${className}`}>
      <button className="btn-primary btn-xl" onClick={go} disabled={busy}>
        {busy ? 'Finding your game…' : 'Review my latest game'}
      </button>
      {error && <div className="error-box small">{error}</div>}
    </div>
  );
}
