import { clock } from './format.js';
import { isActive } from './rules.js';

const WHY = {
  site: 'This site is not on your list.',
  video: 'This video is not on your list.',
  shorts: 'Shorts are off.',
  music: 'Music is off.',
  gaming: 'Gaming is off.',
  smart: 'This does not look like study material.',
  unchecked: 'This video could not be checked, so it stays blocked.',
  player: 'Open this video on www.youtube.com instead.',
  manage: 'Extension settings open again when the lock ends.',
};
const params = new URLSearchParams(location.hash.slice(1));
const url = params.get('u') || '';
const web = /^https?:\/\//.test(url);
const $ = id => document.getElementById(id);
$('why').textContent = WHY[params.get('r')] || WHY.site;
$('site').textContent = web ? new URL(url).hostname : '';

const { lock } = await chrome.storage.local.get('lock');
if (isActive(lock)) {
  const links = [
    ...(lock.toggles.siteLock || lock.toggles.devMode ? lock.sites.map(site => ['https://' + site, site]) : []),
    ...(lock.toggles.videoLock
      ? lock.videos.map(v => [v.type === 'video' ? `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}` : `https://www.youtube.com/playlist?list=${encodeURIComponent(v.id)}`, v.title])
      : []),
  ];
  for (const [href, textContent] of links) {
    const li = document.createElement('li');
    li.append(Object.assign(document.createElement('a'), { href, textContent }));
    $('allowed').append(li);
  }
}
let done = false;
function tick() {
  if (done) return;
  if (isActive(lock)) {
    $('left').textContent = clock(lock.endsAt - Date.now());
    return;
  }
  done = true;
  $('left').textContent = '0:00';
  $('why').textContent = 'The lock has ended.';
  if (web) location.replace(url);
}
tick();
setInterval(tick, 500);
