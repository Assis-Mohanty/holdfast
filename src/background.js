import { blockReason, createLock, isActive, validate } from './rules.js';

/* global PERSONAL, FIREFOX */
// Personal builds only: extension stores reject add-ons that block this page.
const MANAGE_PAGES = /^(chrome|edge|brave|opera|vivaldi|about):(\/\/extensions|addons)/;
const BLOCKED_PAGE = chrome.runtime.getURL('blocked.html');

const getLock = async () => {
  const { lock } = await chrome.storage.local.get('lock');
  return isActive(lock) ? lock : null;
};

const blockTab = (tabId, url, reason) =>
  chrome.tabs
    .update(tabId, { url: `${BLOCKED_PAGE}#${new URLSearchParams({ u: url, r: reason })}` })
    .catch(err => console.warn('Could not block tab', tabId, err));

async function enforce(tabId, url) {
  const lock = url && !url.startsWith(BLOCKED_PAGE) && (await getLock());
  if (!lock) return;
  const reason = PERSONAL && MANAGE_PAGES.test(url) ? 'manage' : blockReason(url, lock);
  if (reason) await blockTab(tabId, url, reason);
}

async function sweep() {
  if (!(await getLock())) return;
  for (const tab of await chrome.tabs.query({})) await enforce(tab.id, tab.pendingUrl || tab.url);
}

chrome.webNavigation.onBeforeNavigate.addListener(d => d.frameId === 0 && d.tabId >= 0 && enforce(d.tabId, d.url));
chrome.webNavigation.onCommitted.addListener(d => d.frameId === 0 && enforce(d.tabId, d.url));
chrome.webNavigation.onHistoryStateUpdated.addListener(d => d.frameId === 0 && enforce(d.tabId, d.url));
chrome.tabs.onUpdated.addListener((tabId, change) => change.url && enforce(tabId, change.url));
chrome.tabs.onActivated.addListener(async ({ tabId }) => enforce(tabId, (await chrome.tabs.get(tabId)).url));
chrome.runtime.onStartup.addListener(sweep);
chrome.runtime.onInstalled.addListener(sweep);

let starting = Promise.resolve();
function start({ settings, minutes }) {
  // Serialised, so two windows cannot replace each other's lock.
  starting = starting.catch(() => {}).then(async () => {
    if (await getLock()) return { error: 'A lock is already running.' };
    const error = validate(settings, minutes);
    if (error) return { error };
    await chrome.storage.local.set({ lock: createLock(settings, minutes) });
    await sweep();
    return { ok: true };
  });
  return starting;
}

async function blockFromPage(tabId, { url, reason }) {
  const tab = await chrome.tabs.get(tabId);
  // The page may already have been replaced while its message was in flight.
  if ((await getLock()) && !tab.url?.startsWith(BLOCKED_PAGE)) await blockTab(tabId, url, reason);
}

let aiReady;
function ensureAi() {
  if (FIREFOX) return Promise.resolve();
  aiReady ??= (async () => {
    if (!(await chrome.offscreen.hasDocument())) {
      await chrome.offscreen.createDocument({
        url: 'ai.html',
        reasons: ['WORKERS'],
        justification: 'Runs the on-device title filter.',
      });
    }
  })().catch(err => {
    aiReady = null;
    throw err;
  });
  return aiReady;
}

async function classify(titles) {
  if (FIREFOX) return globalThis.holdfastClassify(titles);
  await ensureAi();
  const reply = await chrome.runtime.sendMessage({ type: 'ai', titles });
  if (!reply || reply.error) throw new Error(reply?.error || 'The filter did not answer.');
  return reply.scores;
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  const answer = promise => {
    promise.then(respond, err => respond({ error: String(err) }));
    return true;
  };
  if (msg.type === 'start' && sender.url?.startsWith(chrome.runtime.getURL('popup.html'))) return answer(start(msg));
  if (msg.type === 'classify') return answer(classify(msg.titles).then(scores => ({ scores })));
  if (msg.type === 'block' && sender.tab) {
    return answer(blockFromPage(sender.tab.id, msg));
  }
});
