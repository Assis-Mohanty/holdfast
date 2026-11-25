import * as path from 'node:path';
import { launch } from 'puppeteer-core';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable', enableExtensions: [path.resolve('dist/chrome')], pipe: true });
try {
  const target = await browser.waitForTarget(t => t.type() === 'service_worker' && t.url().endsWith('background.js'));
  const worker = await target.worker();
  const toggles = { devMode: true, smart: true, noShorts: true, noMusic: true, noGaming: true };
  await worker.evaluate(toggles => chrome.storage.local.set({ lock: { startedAt: Date.now(), endsAt: Date.now() + 3600000, toggles, sites: [], videos: [] } }), toggles);
  const tab = await browser.newPage();
  let bad = 0;
  const urls = ['https://www.reddit.com/', 'https://www.wikipedia.org/', 'https://example.org/', 'https://www.youtube.com/shorts/aqz-KE-bpKQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://news.ycombinator.com/'];
  for (let i = 0; i < 60; i++) {
    const url = urls[i % urls.length];
    const error = await tab.goto(url, { waitUntil: 'domcontentloaded' }).then(() => '', e => e.message.split('\n')[0]);
    let good = false;
    for (let k = 0; k < 32 && !good; k++) {
      good = tab.url().includes('blocked.html') && new URLSearchParams(new URL(tab.url()).hash.slice(1)).get('u')?.startsWith(new URL(url).origin);
      if (!good) await sleep(250);
    }
    if (!good) {
      bad++;
      const real = await worker.evaluate(async () => (await chrome.tabs.query({})).map(t => [t.url, t.pendingUrl, t.status]));
      console.log('BAD', i, url, '| page', tab.url(), '| goto', error, '|', JSON.stringify(real));
    }
  }
  console.log('bad', bad, 'of 60');
} finally {
  await browser.close();
}
