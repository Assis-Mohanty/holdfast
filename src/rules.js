export const MAX_MINUTES = 240;
export const TOGGLES = ['siteLock', 'videoLock', 'noShorts', 'noMusic', 'noGaming', 'devMode', 'smart'];

export const STUDY_SITES = [
  'maang.in', 'algozenith.com', 'codeforces.com', 'leetcode.com', 'atcoder.jp', 'cses.fi', 'cp-algorithms.com',
  'learncpp.com', 'cppreference.com', 'godbolt.org', 'fluentcpp.com', 'itanium-cxx-abi.github.io', 'go.dev',
  'grpc.io', 'protobuf.dev', 'google.github.io', 'docs.libuv.org', 'ostep.org', 'build-your-own.org', 'jepsen.io',
  'raft.github.io', 'thesquareplanet.com', 'use-the-index-luke.com', 'unixism.net', 'rfleury.com', 'kegel.com',
  'danluu.com', 'catb.org', 'blog.regehr.org', 'blog.josejg.com', '1024cores.net', 'code.kx.com', 'emi.nasdaq.com',
  'quantinsti.com', 'deshawindia.com', 'jointaro.com', 'github.com', 'stackoverflow.com', 'man7.org',
  'developer.mozilla.org', 'kernel.org', 'chatgpt.com', 'claude.ai',
];
const MUSIC_SITES = [
  'music.youtube.com', 'spotify.com', 'soundcloud.com', 'gaana.com', 'jiosaavn.com', 'wynk.in', 'music.apple.com',
  'music.amazon.com', 'music.amazon.in', 'hungama.com', 'deezer.com', 'tidal.com',
];
// Sign-in pages, so a logged-out session does not strand the user mid-lock.
const AUTH_SITES = [
  'accounts.google.com', 'accounts.youtube.com', 'auth.openai.com', 'auth0.openai.com', 'login.live.com',
  'login.microsoftonline.com', 'appleid.apple.com',
];

export const isActive = (lock, now = Date.now()) => !!lock && now < lock.endsAt;

const inSites = (host, sites) => sites.some(site => host === site || host.endsWith('.' + site));

export function toSite(text) {
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(text.trim()) ? text.trim() : 'https://' + text.trim());
    const host = url.hostname.replace(/^www\./, '').replace(/\.$/, '');
    return /^https?:$/.test(url.protocol) && (host.includes('.') || host === 'localhost') ? host : null;
  } catch {
    return null;
  }
}

/** Returns { video, list } for a YouTube URL, or null for any other site. */
export function parseYouTube(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/\.$/, '');
  if (host === 'youtu.be') {
    return { host, path: url.pathname, video: url.pathname.slice(1) || null, list: url.searchParams.get('list') };
  }
  if (!inSites(host, ['youtube.com', 'youtube-nocookie.com'])) {
    return null;
  }
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const live = /^\/live\/([\w-]+)$/.exec(path);
  return {
    host,
    path,
    video: path === '/watch' ? url.searchParams.get('v') : live ? live[1] : null,
    list: url.searchParams.get('list'),
  };
}

/** Mixes and radios (RD...) never end, and WL/LL are editable, so they cannot be locked to. */
export const isLockableList = list => !!list && /^(PL|UU|OL|FL)[\w-]+$/.test(list);

export function validate(settings, minutes) {
  const t = settings.toggles;
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) return `Pick 1 to ${MAX_MINUTES} minutes.`;
  if (!TOGGLES.some(name => t[name])) return 'Turn on at least one option.';
  if (t.videoLock && !settings.videos.length) return 'Add a video or playlist first.';
  if (t.siteLock && !settings.sites.length && !(t.videoLock && settings.videos.length)) return 'Add a site first.';
  return null;
}

export function createLock(settings, minutes, now = Date.now()) {
  const on = settings.toggles;
  const toggles = Object.fromEntries(TOGGLES.map(name => [name, !!on[name]]));
  if (toggles.devMode) {
    toggles.smart = toggles.noShorts = toggles.noMusic = toggles.noGaming = true;
  }
  return { startedAt: now, endsAt: now + minutes * 60000, toggles, sites: [...settings.sites], videos: [...settings.videos] };
}

const listed = (lock, yt) =>
  lock.videos.some(item => (item.type === 'video' ? item.id === yt.video : !!yt.list && item.id === yt.list));

/** 'video' when the video itself was added, 'list' when only its playlist was, else null. */
export function listedAs(lock, yt) {
  if (lock.videos.some(item => item.type === 'video' && item.id === yt.video)) return 'video';
  return listed(lock, yt) ? 'list' : null;
}

/** Returns why a top-level URL is blocked, or null when it is allowed. */
export function blockReason(href, lock) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;

  const t = lock.toggles;
  const host = url.hostname.replace(/\.$/, '');
  if (inSites(host, AUTH_SITES)) return null;
  if (t.noMusic && inSites(host, MUSIC_SITES)) return 'music';

  const yt = parseYouTube(href);
  if (yt) {
    if (t.noShorts && yt.path.startsWith('/shorts')) return 'shorts';
    if (t.videoLock) {
      const page = yt.video || yt.path === '/playlist';
      return page && yt.host !== 'music.youtube.com' && yt.host !== 'm.youtube.com' && listed(lock, yt) ? null : 'video';
    }
    if (t.siteLock && !t.devMode && !inSites(host, lock.sites)) return 'site';
    // Only www pages run the content script that filters videos.
    const filtered = t.smart || t.noMusic || t.noGaming;
    if (filtered && host !== 'youtu.be' && (host !== 'www.youtube.com' && host !== 'youtube.com' || /^\/(embed|tv|clip|v|e)(\/|$)/.test(yt.path))) {
      return 'player';
    }
    return null;
  }

  if (t.siteLock || t.devMode) {
    const allowed = t.devMode ? [...lock.sites, ...STUDY_SITES] : lock.sites;
    if (!inSites(host, allowed)) return 'site';
  }
  return null;
}

const MUSIC_WORDS = /\b(songs?|gaan[ae]|lofi|lo-fi|jukebox|lyrics?|lyrical|remix|mashup|playlist mix|music mix|beats|bhajan|official (music )?video|official audio|slowed|reverb)\b/i;
const GAMING_WORDS = /\b(gameplay|bgmi|pubg|free fire|valorant|minecraft|gta ?(v|5|6|vi)?|fortnite|roblox|elden ring|no hit run|speedrun|walkthrough part|montage)\b/i;
const BLOCKED_CATEGORIES = ['Comedy', 'Sports', 'Movies', 'Film & Animation', 'Autos & Vehicles', 'Pets & Animals'];

/** scores: { keep, music, gaming, other } similarities, or null when the model failed. */
export function hideReason(title, scores, toggles, category = null) {
  if ((toggles.noMusic || toggles.smart) && (category === 'Music' || MUSIC_WORDS.test(title))) return 'music';
  if ((toggles.noGaming || toggles.smart) && (category === 'Gaming' || GAMING_WORDS.test(title))) return 'gaming';
  if (toggles.smart && BLOCKED_CATEGORIES.includes(category)) return 'smart';
  if (!scores) return toggles.smart ? 'unchecked' : null;
  const top = Math.max(scores.keep, scores.music, scores.gaming, scores.other);
  if (toggles.noMusic && scores.music === top) return 'music';
  if (toggles.noGaming && scores.gaming === top) return 'gaming';
  return toggles.smart && scores.keep < top ? 'smart' : null;
}
