// ChessBuddy content script for Chess.com and Lichess.
// Shows a "Review with ChessBuddy" button on game pages, notices when a game
// ends, collects the finished game (no PGN download needed) and hands it to
// the extension, which opens the review in a new tab.
(() => {
  'use strict';
  if (window.__chessbuddyLoaded) return;
  window.__chessbuddyLoaded = true;

  const SITE = location.hostname.endsWith('lichess.org') ? 'lichess' : 'chesscom';
  const LICHESS_RESERVED = new Set([
    'training', 'analysis', 'streamer', 'tournament', 'swiss', 'practice', 'learn', 'coach',
    'insights', 'broadcast', 'puzzle', 'storm', 'racer', 'streak', 'editor', 'paste', 'player',
  ]);
  const notified = new Set();
  let settings = { autoOpen: false, chesscomUser: '', lichessUser: '' };

  chrome.storage.sync.get(['autoOpen', 'chesscomUser', 'lichessUser']).then((s) => {
    settings = { ...settings, ...s };
  });
  chrome.storage.onChanged.addListener((changes) => {
    for (const [k, v] of Object.entries(changes)) settings[k] = v.newValue;
  });

  // ---------- Finding the game ----------

  /** Game id from a Chess.com or Lichess URL/path, or null. */
  function gameFromPath(path) {
    if (SITE === 'chesscom') {
      const m = path.match(/\/game\/(live|daily)\/(\d+)/) || path.match(/\/game\/(\d+)(?:[/?#]|$)/);
      if (!m) return null;
      return m.length === 3 ? { type: m[1], id: m[2] } : { type: 'live', id: m[1] };
    }
    const m = path.match(/^\/([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{4})?(?:\/(?:white|black))?\/?$/);
    if (!m || LICHESS_RESERVED.has(m[1].toLowerCase())) return null;
    return { type: 'game', id: m[1] };
  }

  function currentGame() {
    const fromUrl = gameFromPath(location.pathname);
    if (fromUrl) return fromUrl;
    // While playing, Chess.com's URL may not include the game yet; the
    // game-over panel links to the finished game (e.g. "Game Review").
    if (SITE === 'chesscom' && gameOverVisible()) {
      const links = [...document.querySelectorAll('a[href*="/game/"]')]
        .map((a) => gameFromPath(new URL(a.href, location.href).pathname))
        .filter(Boolean);
      return links[links.length - 1] || null;
    }
    return null;
  }

  function gameOverVisible() {
    if (SITE === 'lichess') {
      return !!document.querySelector('.result-wrap, .rcontrols .follow-up, .game__meta .status');
    }
    return !!document.querySelector(
      '.game-over-modal-content, .game-over-modal-container, [data-cy="game-over-modal"], .game-over-header-component, .game-result-component',
    );
  }

  /** Which side is at the bottom of the board (usually your side). */
  function boardPerspective() {
    if (SITE === 'lichess') {
      return document.querySelector('.cg-wrap.orientation-black, .orientation-black') ? 'b' : 'w';
    }
    const board = document.querySelector('wc-chess-board, chess-board, #board-single, .board');
    return board && board.classList.contains('flipped') ? 'b' : 'w';
  }

  // ---------- Collecting the moves ----------

  async function collectChessCom(game) {
    // 1. Chess.com's own game data (what its board uses): immediate after the game ends.
    try {
      const res = await fetch(`https://www.chess.com/callback/${game.type}/game/${game.id}`, { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        if (json && json.game && json.game.moveList) {
          if (json.game.isFinished === false) throw Object.assign(new Error('This game is still in progress.'), { final: true });
          return { kind: 'chesscom-callback', data: json };
        }
      }
    } catch (e) {
      if (e.final) throw e;
    }
    // 2. The public API archive (can lag a few minutes behind).
    const user = (settings.chesscomUser || '').trim().toLowerCase();
    if (user) {
      try {
        const now = new Date();
        for (const d of [now, new Date(now.getFullYear(), now.getMonth() - 1, 1)]) {
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/${d.getFullYear()}/${mm}`);
          if (!res.ok) continue;
          const { games } = await res.json();
          const found = (games || []).find((g) => g.url && g.url.endsWith(`/${game.id}`) && g.pgn);
          if (found) return { kind: 'pgn', data: found.pgn };
        }
      } catch (_) {
        /* fall through */
      }
    }
    // 3. Read the move list shown on the page.
    const sans = scrapeChessComMoves();
    if (sans.length) return { kind: 'san-list', data: { sans, headers: scrapeChessComHeaders() } };
    throw new Error("Couldn't read this game from Chess.com. Open the finished game and try again.");
  }

  function scrapeChessComMoves() {
    const nodes = document.querySelectorAll(
      'wc-simple-move-list .node, .move-list .node, [data-node] .node-highlight-content, .vertical-move-list .node',
    );
    const sans = [];
    for (const node of nodes) {
      const fig = node.querySelector('[data-figurine]');
      const text = (node.textContent || '').replace(/\s+/g, '').replace(/^\d+\.+/, '');
      if (!text) continue;
      sans.push((fig ? fig.getAttribute('data-figurine') : '') + text);
    }
    return sans;
  }

  function scrapeChessComHeaders() {
    const names = [...document.querySelectorAll('[data-test-element="user-tagline-username"], .user-username-component')].map(
      (el) => el.textContent.trim(),
    );
    // Top tagline is the opponent of the bottom (perspective) player.
    const flipped = boardPerspective() === 'b';
    const [top, bottom] = names;
    return { Site: 'Chess.com', White: flipped ? top : bottom, Black: flipped ? bottom : top };
  }

  async function collectLichess(game) {
    const res = await fetch(`https://lichess.org/game/export/${game.id}?clocks=true&evals=false&literate=false`, {
      headers: { Accept: 'application/x-chess-pgn' },
    });
    if (!res.ok) throw new Error(`Lichess returned an error (${res.status}).`);
    const pgn = await res.text();
    if (/\[Result "\*"\]/.test(pgn)) throw new Error('This game is still in progress.');
    return { kind: 'pgn', data: pgn };
  }

  async function reviewCurrentGame() {
    const game = currentGame();
    if (!game) {
      toast('Open a finished game to review it.');
      return;
    }
    setBusy(true);
    try {
      const payload = SITE === 'lichess' ? await collectLichess(game) : await collectChessCom(game);
      payload.perspective = boardPerspective();
      payload.url = location.href;
      const res = await chrome.runtime.sendMessage({ type: 'chessbuddy:review', payload });
      if (!res || !res.ok) throw new Error('The extension could not open the review.');
      hideToast();
    } catch (e) {
      toast(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---------- UI ----------

  const root = document.createElement('div');
  root.id = 'chessbuddy-root';
  root.innerHTML = `
    <div class="cb-toast" hidden>
      <span class="cb-toast-text"></span>
      <button type="button" class="cb-toast-close" aria-label="Dismiss">×</button>
    </div>
    <button type="button" class="cb-review-btn" hidden>
      <img alt="" src="${chrome.runtime.getURL('icons/icon-48.png')}">
      <span class="cb-label">Review with ChessBuddy</span>
    </button>`;
  const btn = root.querySelector('.cb-review-btn');
  const toastEl = root.querySelector('.cb-toast');
  btn.addEventListener('click', reviewCurrentGame);
  root.querySelector('.cb-toast-close').addEventListener('click', hideToast);
  document.documentElement.appendChild(root);

  function setBusy(busy) {
    btn.disabled = busy;
    btn.querySelector('.cb-label').textContent = busy ? 'Collecting game…' : 'Review with ChessBuddy';
  }

  function toast(text) {
    toastEl.querySelector('.cb-toast-text').textContent = text;
    toastEl.hidden = false;
  }

  function hideToast() {
    toastEl.hidden = true;
  }

  function refresh() {
    const game = currentGame();
    btn.hidden = !game;
    if (!game) return;
    if (gameOverVisible() && !notified.has(game.id)) {
      notified.add(game.id);
      btn.classList.add('cb-pulse');
      if (settings.autoOpen) reviewCurrentGame();
    }
  }

  // Both sites are single-page apps: watch the DOM and the URL.
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      refresh();
    }, 400);
  }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(refresh, 1500);
  refresh();

  // The popup's "Review this game" button.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'chessbuddy:review-current') {
      const game = currentGame();
      sendResponse({ ok: !!game });
      if (game) reviewCurrentGame();
    }
  });
})();
