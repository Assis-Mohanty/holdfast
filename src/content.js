import { hideReason, isActive, listedAs, parseYouTube } from './rules.js';

const CARDS = 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model';
const root = document.documentElement;
let lock = null;
let current = null;
const seen = new WeakMap();
const cache = new Map();

const filtering = () => lock && (lock.toggles.smart || lock.toggles.noMusic || lock.toggles.noGaming);
const block = reason => chrome.runtime.sendMessage({ type: 'block', reason, url: location.href });

async function scoresFor(titles) {
  const todo = [...new Set(titles)].filter(title => !cache.has(title));
  for (let i = 0; i < todo.length; i += 16) {
    const batch = todo.slice(i, i + 16);
    const reply = await chrome.runtime.sendMessage({ type: 'classify', titles: batch }).catch(err => ({ error: err }));
    if (reply?.scores) batch.forEach((title, j) => cache.set(title, reply.scores[j]));
    else console.warn('Holdfast filter failed', reply?.error);
  }
  return titles.map(title => cache.get(title) ?? null);
}

function readCard(card) {
  const link = card.querySelector('a[href*="/watch?"], a[href*="/live/"]');
  const title = card.querySelector('#video-title, h3')?.textContent.trim();
  return link && title ? { yt: parseYouTube(link.href), title } : null;
}

let judging = false;
async function judgeCards() {
  if (judging || !filtering()) return;
  judging = true;
  try {
    const todo = [];
    for (const card of document.querySelectorAll(CARDS)) {
      if (card.parentElement.closest(CARDS)) continue;
      const info = readCard(card);
      // YouTube recycles cards, so a verdict only holds while the same video is in it.
      const key = info && info.yt?.video + info.title;
      if (seen.get(card) === key) continue;
      card.removeAttribute('data-holdfast');
      if (info) todo.push({ card, key, ...info });
    }
    const scores = await scoresFor(todo.map(item => item.title));
    if (!filtering()) return;
    todo.forEach(({ card, key, yt, title }, i) => {
      const hide = listedAs(lock, yt) ? null : hideReason(title, scores[i], lock.toggles);
      card.setAttribute('data-holdfast', hide ? 'hide' : 'keep');
      // A failed check is retried on the next pass.
      if (scores[i]) seen.set(card, key);
    });
  } finally {
    judging = false;
  }
}

async function videoInfo(id) {
  const response = await fetch(`/watch?v=${encodeURIComponent(id)}`, { credentials: 'same-origin' });
  const html = await response.text();
  const read = pattern => {
    const match = pattern.exec(html);
    return match ? JSON.parse(`"${match[1]}"`) : null;
  };
  return {
    title: read(/"videoDetails":\{"videoId":"[^"]+","title":"((?:[^"\\]|\\.)*)"/),
    category: read(/"category":"((?:[^"\\]|\\.)*)"/),
  };
}

const pauseWhileChecking = event => root.dataset.holdfastChecking && event.target.pause?.();

/** A crafted URL can pair any video with a locked playlist; the panel shows what is really in it. */
function watchPlaylist(yt) {
  let checks = 0;
  const timer = setInterval(() => {
    if (current !== location.href || !isActive(lock)) return clearInterval(timer);
    const items = document.querySelectorAll('ytd-playlist-panel-video-renderer a[href*="v="]');
    const found = [...items].some(a => parseYouTube(a.href)?.video === yt.video);
    if (found) clearInterval(timer);
    else if (++checks >= 20) {
      clearInterval(timer);
      block('video');
    }
  }, 500);
}

async function judgePage() {
  if (!lock || current === location.href) return;
  const href = (current = location.href);
  delete root.dataset.holdfastChecking;
  const yt = parseYouTube(href);
  if (!yt?.video) return;

  const how = listedAs(lock, yt);
  if (lock.toggles.videoLock) {
    if (how === 'list') watchPlaylist(yt);
    return;
  }
  if (!filtering() || how === 'video') return;

  root.dataset.holdfastChecking = '1';
  document.querySelectorAll('video').forEach(v => v.pause());
  let reason;
  try {
    const { title, category } = await videoInfo(yt.video);
    const [scores] = title ? await scoresFor([title]) : [null];
    reason = hideReason(title || '', scores, lock.toggles, category);
  } catch (err) {
    console.warn('Holdfast could not check this video', err);
    reason = lock.toggles.smart ? 'unchecked' : null;
  }
  if (location.href !== href || !isActive(lock)) return;
  if (reason) return block(reason);
  delete root.dataset.holdfastChecking;
  document.querySelector('video.html5-main-video')?.play().catch(() => {});
}

function apply(next) {
  lock = isActive(next) ? next : null;
  const t = lock?.toggles ?? {};
  root.toggleAttribute('data-holdfast-shorts', !!(t.noShorts || t.videoLock));
  root.toggleAttribute('data-holdfast-smart', !!t.smart);
  root.toggleAttribute('data-holdfast-video', !!t.videoLock);
  root.toggleAttribute('data-holdfast-filter', !!filtering());
  if (!lock) {
    current = null;
    delete root.dataset.holdfastChecking;
    return;
  }
  judgePage();
  judgeCards();
}

document.addEventListener('play', pauseWhileChecking, true);
document.addEventListener('yt-navigate-finish', judgePage);
chrome.storage.onChanged.addListener(changes => changes.lock && apply(changes.lock.newValue));
chrome.storage.local.get('lock').then(({ lock }) => apply(lock));
// Polling also catches YouTube's in-page navigation and cards loaded on scroll.
setInterval(() => {
  if (lock && !isActive(lock)) return apply(null);
  judgePage();
  judgeCards();
}, 700);
