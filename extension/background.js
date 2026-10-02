// ChessBuddy background worker: receives a collected game from the content
// script, parks it in session storage and opens the review page.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'chessbuddy:review') return false;
  const key = `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  chrome.storage.session
    .set({ [key]: msg.payload })
    .then(() => chrome.tabs.create({ url: chrome.runtime.getURL(`review.html#import=${key}`) }))
    .then(() => sendResponse({ ok: true }))
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true; // keep the channel open for the async response
});
