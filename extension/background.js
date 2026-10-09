// ChessBuddy background worker: receives a collected game from the content
// script, parks it in session storage and opens the review page.
// Auto-save: queue finished games; the review page analyses them when it is open.
async function queueGame(payload) {
  const { pendingGames = [] } = await chrome.storage.local.get('pendingGames');
  const id = payload.gameId || payload.url || `game-${Date.now()}`;
  if (pendingGames.some((g) => g.id === id)) return pendingGames.length;
  const next = [...pendingGames, { id, queuedAt: Date.now(), payload }];
  await chrome.storage.local.set({ pendingGames: next });
  await chrome.action.setBadgeBackgroundColor({ color: '#81b64c' });
  await chrome.action.setBadgeText({ text: String(next.length) });
  return next.length;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'chessbuddy:queue') {
    queueGame(msg.payload)
      .then((count) => sendResponse({ ok: true, count }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (!msg || msg.type !== 'chessbuddy:review') return false;
  const key = `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  chrome.storage.session
    .set({ [key]: msg.payload })
    .then(() => chrome.tabs.create({ url: chrome.runtime.getURL(`review.html#import=${key}`) }))
    .then(() => sendResponse({ ok: true }))
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true; // keep the channel open for the async response
});
