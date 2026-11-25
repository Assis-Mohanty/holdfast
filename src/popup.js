import { clock, length, timeOfDay } from './format.js';
import { isActive, isLockableList, parseYouTube, STUDY_SITES, toSite, validate } from './rules.js';

const LABELS = {
  siteLock: ['Only these sites', 'Every other site is blocked'],
  videoLock: ['Only these videos', 'YouTube plays only the list below'],
  noShorts: ['No Shorts', ''],
  noMusic: ['No music', 'Music sites and music videos'],
  noGaming: ['No gaming videos', ''],
  smart: ['Smart filter', 'YouTube shows coding, maths and books only'],
  devMode: ['Development mode', `${STUDY_SITES.length} study sites plus yours, filtered YouTube`],
};
const FORCED = ['noShorts', 'noMusic', 'noGaming', 'smart'];
const $ = id => document.getElementById(id);
const el = (tag, props, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

let state = { minutes: 60, toggles: {}, sites: [], videos: [] };
const save = () => chrome.storage.local.set({ settings: state });

function renderList(id, items, label) {
  $(id).replaceChildren(
    ...items.map((item, i) => {
      const remove = el('button', { textContent: '✕', type: 'button', ariaLabel: `Remove ${label(item)}` });
      remove.onclick = () => {
        items.splice(i, 1);
        update();
      };
      return el('li', {}, el('span', { textContent: label(item), title: label(item) }), remove);
    }),
  );
}

function render() {
  $('chosen').textContent = length(state.minutes);
  $('minutes').value = state.minutes;
  for (const b of $('presets').children) b.setAttribute('aria-pressed', String(+b.dataset.m === state.minutes));
  for (const input of $('toggles').querySelectorAll('input')) {
    const forced = state.toggles.devMode && FORCED.includes(input.name);
    input.checked = forced || !!state.toggles[input.name];
    input.disabled = forced;
  }
  $('sitesBox').hidden = !state.toggles.siteLock && !state.toggles.devMode;
  $('videosBox').hidden = !state.toggles.videoLock;
  renderList('sites', state.sites, site => site);
  renderList('videos', state.videos, v => `${v.type === 'list' ? 'Playlist: ' : ''}${v.title}`);
  $('lock').textContent = `Lock for ${length(state.minutes)}`;
  $('confirm').hidden = true;
  $('lock').hidden = false;
}

const fail = message => ($('error').textContent = message || '');
function update() {
  fail();
  save();
  render();
}

function addSite(text) {
  const site = toSite(text);
  if (!site) return fail('That is not a website address.');
  if (!state.sites.includes(site)) state.sites.push(site);
  $('siteInput').value = '';
  update();
}

function addVideo(type, id, title) {
  if (!state.videos.some(v => v.type === type && v.id === id)) state.videos.push({ type, id, title });
  $('videoInput').value = '';
  update();
}

function showRunning(lock) {
  $('setup').hidden = true;
  $('running').hidden = false;
  $('until').textContent = `Ends at ${timeOfDay(lock.endsAt)}`;
  const names = Object.keys(LABELS).filter(name => lock.toggles[name]).map(name => LABELS[name][0]);
  const items = [...names, ...(lock.toggles.siteLock || lock.toggles.devMode ? lock.sites : []), ...(lock.toggles.videoLock ? lock.videos.map(v => v.title) : [])];
  $('active').replaceChildren(...items.map(textContent => el('li', { textContent })));
  const tick = () => {
    if (!isActive(lock)) return location.reload();
    $('left').textContent = clock(lock.endsAt - Date.now());
  };
  tick();
  setInterval(tick, 500);
}

async function setup() {
  $('setup').hidden = false;
  for (const [name, [title, detail]] of Object.entries(LABELS)) {
    const input = el('input', { type: 'checkbox', name });
    input.setAttribute('role', 'switch');
    input.onchange = () => {
      state.toggles[name] = input.checked;
      update();
    };
    const text = el('span', { textContent: title });
    if (detail) text.append(el('small', { textContent: detail }));
    $('toggles').append(el('label', { className: 'toggle' }, text, input));
  }
  $('minutes').oninput = e => {
    state.minutes = +e.target.value;
    update();
  };
  $('presets').onclick = e => {
    if (!e.target.dataset.m) return;
    state.minutes = +e.target.dataset.m;
    update();
  };
  $('siteForm').onsubmit = e => {
    e.preventDefault();
    addSite($('siteInput').value);
  };
  $('videoForm').onsubmit = e => {
    e.preventDefault();
    const text = $('videoInput').value.trim();
    const yt = parseYouTube(text);
    if (yt?.path === '/playlist' && isLockableList(yt.list)) addVideo('list', yt.list, yt.list);
    else if (yt?.video) addVideo('video', yt.video, yt.video);
    else fail('Paste a YouTube video or a normal playlist. Mixes cannot be locked.');
  };
  $('lock').onclick = () => {
    const error = validate(state, state.minutes);
    if (error) return fail(error);
    $('confirmText').textContent = `Locked until ${timeOfDay(Date.now() + state.minutes * 60000)}.`;
    $('confirm').hidden = false;
    $('lock').hidden = true;
    $('confirmLock').focus();
  };
  $('cancel').onclick = render;
  $('confirmLock').onclick = async () => {
    // Firefox lets users withhold site access; Chrome resolves this silently.
    if (!(await chrome.permissions.request({ origins: ['https://www.youtube.com/*'] }))) return fail('YouTube access is needed for the filters.');
    const { minutes, ...settings } = state;
    const reply = await chrome.runtime.sendMessage({ type: 'start', settings, minutes });
    if (!reply?.ok) return fail(reply?.error || 'Could not start the lock.');
    location.reload();
  };

  if (!(await chrome.extension.isAllowedIncognitoAccess())) {
    $('note').textContent = 'Private windows are not covered. Allow Holdfast in them from the browser’s extension settings.';
    $('note').hidden = false;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const site = tab?.url && /^https?:/.test(tab.url) && toSite(tab.url);
  if (site) {
    $('addCurrent').textContent = `Add ${site}`;
    $('addCurrent').hidden = false;
    $('addCurrent').onclick = () => addSite(site);
  }
  const yt = tab?.url && parseYouTube(tab.url);
  const title = tab?.title?.replace(/^\(\d+\) /, '').replace(/ - YouTube$/, '');
  if (yt?.video) {
    $('addVideo').hidden = false;
    $('addVideo').onclick = () => addVideo('video', yt.video, title);
  }
  if (yt && isLockableList(yt.list)) {
    $('addList').hidden = false;
    $('addList').onclick = () => addVideo('list', yt.list, title);
  }
  render();
}

const stored = await chrome.storage.local.get(['lock', 'settings']);
state = { ...state, ...stored.settings };
if (isActive(stored.lock)) showRunning(stored.lock);
else await setup();
