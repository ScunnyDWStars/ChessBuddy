const fields = ['chesscomUser', 'lichessUser'];
const $ = (id) => document.getElementById(id);
const status = (text) => ($('status').textContent = text);

chrome.storage.sync.get([...fields, 'autoOpen']).then((s) => {
  for (const f of fields) $(f).value = s[f] || '';
  $('autoOpen').checked = !!s.autoOpen;
});

for (const f of fields) {
  $(f).addEventListener('change', () => chrome.storage.sync.set({ [f]: $(f).value.trim() }));
}
$('autoOpen').addEventListener('change', () => chrome.storage.sync.set({ autoOpen: $('autoOpen').checked }));

$('open').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('review.html') });
  window.close();
});

$('review').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'chessbuddy:review-current' });
    if (res && res.ok) window.close();
    else status('Open a finished game on Chess.com or Lichess, then try again.');
  } catch {
    status('Go to a finished game on Chess.com or Lichess first. If the page was already open, reload it.');
  }
});
