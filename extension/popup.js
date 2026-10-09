const fields = ['chesscomUser', 'lichessUser'];
const $ = (id) => document.getElementById(id);
const status = (text) => ($('status').textContent = text);

const toggles = ['autoOpen', 'autoSave'];

chrome.storage.sync.get([...fields, ...toggles]).then((s) => {
  for (const f of fields) $(f).value = s[f] || '';
  for (const t of toggles) $(t).checked = !!s[t];
});

chrome.storage.local.get('pendingGames').then(({ pendingGames }) => {
  const n = (pendingGames || []).length;
  if (n) $('queued').textContent = `${n} saved game${n === 1 ? '' : 's'} waiting. Open ChessBuddy to analyse ${n === 1 ? 'it' : 'them'}.`;
});

for (const f of fields) {
  $(f).addEventListener('change', () => chrome.storage.sync.set({ [f]: $(f).value.trim() }));
}
for (const t of toggles) $(t).addEventListener('change', () => chrome.storage.sync.set({ [t]: $(t).checked }));

$('open').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('review.html#progress') });
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
