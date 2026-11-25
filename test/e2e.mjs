// Needs network. Run: npm run build && npm run test:e2e   (CHROME_PATH overrides the browser)
// Runs in a throwaway browser profile, never the user's own.
import assert from 'node:assert';
import * as path from 'node:path';
import { launch } from 'puppeteer-core';

const ext = path.resolve('dist/chrome');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (what, fn, ms = 25000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) if (await fn().catch(() => false)) return;
  throw new Error('Timed out: ' + what + ' ' + (globalThis.tabUrl?.() ?? ''));
};
const VIDEO = 'kCc8FmEb1nY'; // Karpathy, Let's build GPT
const LIST = 'PLAqhIrjkxbuWI23v9cThsA9GvCAUhRvKZ';
const MUSIC = 'dQw4w9WgXcQ';

const browser = await launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
  enableExtensions: [ext],
  pipe: true,
  args: ['--lang=en-US', '--mute-audio', '--window-size=1400,1000'],
  defaultViewport: null,
});
try {
  const worker = await (await browser.waitForTarget(t => t.type() === 'service_worker' && t.url().endsWith('background.js'))).worker();
  const base = await worker.evaluate(() => chrome.runtime.getURL(''));
  const set = data => worker.evaluate(d => chrome.storage.local.set(d), data);
  const unlock = () => worker.evaluate(() => chrome.storage.local.set({ lock: null }));
  const go = (page, url) => page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  const blocked = (page, reason) => until(`${reason} block`, async () => page.url().includes('blocked.html') && page.url().endsWith('r=' + reason));
  const shot = (page, name) => process.env.SHOTS && page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
  const ok = name => console.log('ok  ', name);

  const popup = await browser.newPage();
  await popup.setViewport({ width: 360, height: 900 });
  const start = async settings => {
    await unlock();
    await set({ settings: { minutes: 60, toggles: {}, sites: [], videos: [], ...settings } });
    await popup.bringToFront();
    await popup.goto(base + 'popup.html');
    await popup.waitForSelector('#setup:not([hidden])');
    await sleep(300);
    await popup.click('#lock');
    await popup.waitForSelector('#confirm:not([hidden])');
    await shot(popup, 'confirm');
    await popup.click('#confirmLock');
    await popup.waitForSelector('#running:not([hidden])');
    await shot(popup, 'running');
    await tab.bringToFront();
  };

  await popup.goto(base + 'popup.html');
  await popup.waitForSelector('#setup:not([hidden])');
  await sleep(300);
  await shot(popup, 'setup');
  await popup.click('#lock');
  assert.match(await popup.$eval('#error', e => e.textContent), /at least one/);
  ok('empty lock refused');

  const tab = await browser.newPage();
  globalThis.tabUrl = () => tab.url();
  await go(tab, 'https://example.org/');
  await start({ toggles: { siteLock: true }, sites: ['example.com'] });

  await blocked(tab, 'site');
  await shot(tab, 'blocked');
  ok('already-open tab blocked');
  await go(tab, 'https://example.com/anything?x=1');
  await sleep(800);
  assert.match(tab.url(), /^https:\/\/example\.com\//);
  ok('whole allowed site open');
  await go(tab, 'https://www.wikipedia.org/');
  await blocked(tab, 'site');
  ok('new navigation blocked');
  const second = await popup.evaluate(() =>
    chrome.runtime.sendMessage({ type: 'start', settings: { toggles: { noShorts: true }, sites: [], videos: [] }, minutes: 5 }),
  );
  assert.match(second.error, /already/);
  ok('running lock cannot be replaced');
  if (!process.env.STORE) {
    await go(tab, 'chrome://extensions/');
    await blocked(tab, 'manage');
    ok('extensions page blocked');
  }
  await go(tab, 'https://www.wikipedia.org/');
  await blocked(tab, 'site');
  await worker.evaluate(async () => {
    const { lock } = await chrome.storage.local.get('lock');
    await chrome.storage.local.set({ lock: { ...lock, endsAt: Date.now() + 3000 } });
  });
  await tab.reload();
  await until('tab restored', async () => tab.url().startsWith('https://www.wikipedia.org'));
  ok('tab comes back at the end');

  await start({ toggles: { videoLock: true }, videos: [{ type: 'video', id: VIDEO, title: 'GPT' }] });
  await go(tab, `https://www.youtube.com/watch?v=${VIDEO}`);
  await sleep(4000);
  assert.ok(tab.url().includes(VIDEO));
  await tab.evaluate(v => history.pushState({}, '', '/watch?v=' + v), MUSIC);
  await blocked(tab, 'video');
  ok('video lock, including in-page navigation');

  await start({ toggles: { videoLock: true }, videos: [{ type: 'list', id: LIST, title: 'Zero to Hero' }] });
  await go(tab, `https://www.youtube.com/watch?v=${VIDEO}&list=${LIST}`);
  await sleep(13000);
  assert.ok(tab.url().includes(VIDEO) && !tab.url().includes('blocked'), tab.url());
  await go(tab, `https://www.youtube.com/watch?v=${MUSIC}&list=${LIST}`);
  await blocked(tab, 'video');
  ok('playlist lock, including a foreign video on a locked playlist');

  await start({ toggles: { noShorts: true, noMusic: true } });
  await go(tab, 'https://www.youtube.com/shorts/aqz-KE-bpKQ');
  await blocked(tab, 'shorts');
  await go(tab, `https://www.youtube.com/watch?v=${MUSIC}`);
  await blocked(tab, 'music');
  ok('Shorts and music video blocked');

  await start({ toggles: { devMode: true } });
  await go(tab, 'https://www.reddit.com/');
  await blocked(tab, 'site');
  const t = Date.now();
  await go(tab, `https://www.youtube.com/watch?v=${VIDEO}`);
  await until(
    'lecture allowed',
    async () => (await tab.$('video')) && !(await tab.evaluate(() => document.documentElement.dataset.holdfastChecking)),
  );
  const took = Date.now() - t;
  await sleep(2000);
  assert.ok(tab.url().includes(VIDEO), tab.url());
  ok(`lecture plays (first check, model load included: ${took} ms)`);

  for (const query of ['raft consensus lecture', 'motivation speech discipline', 'funny comedy scenes']) {
    const started = Date.now();
    await go(tab, 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query));
    await until('cards judged', async () => (await tab.$$('[data-holdfast]')).length >= 5);
    const ms = Date.now() - started;
    await sleep(1500);
    const cards = await tab.$$eval('[data-holdfast]', all =>
      all.map(c => [c.dataset.holdfast, c.querySelector('#video-title, h3')?.textContent.trim(), c.checkVisibility()]),
    );
    assert.ok(cards.every(([v, , visible]) => v !== 'hide' || !visible), 'hidden cards are invisible');
    console.log(`     "${query}": ${cards.filter(c => c[0] === 'keep').length}/${cards.length} kept, ${ms} ms from navigation`);
    for (const [v, title] of cards) if (process.env.VERBOSE) console.log('       ', v, title);
    await shot(tab, 'search-' + query.split(' ')[0]);
  }
  await popup.bringToFront();
  const perf = await popup.evaluate(async () => {
    const titles = Array.from({ length: 30 }, (_, i) => `Sample lecture number ${i} about operating systems`);
    const s = performance.now();
    const reply = await chrome.runtime.sendMessage({ type: 'classify', titles });
    return [Math.round(performance.now() - s), reply.scores?.length, reply.error];
  });
  console.log('     browser model, 30 titles:', perf);
  assert.equal(perf[1], 30);
  console.log('passed');
} finally {
  await browser.close();
}
