// A lock must survive a browser restart. Uses a throwaway profile given as argv[2].
import assert from 'node:assert';
import * as path from 'node:path';
import { launch } from 'puppeteer-core';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const open = () => launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable', enableExtensions: [path.resolve('dist/chrome')], pipe: true, userDataDir: process.argv[2] });
const worker = async b => (await b.waitForTarget(t => t.type() === 'service_worker' && t.url().endsWith('background.js'))).worker();
let b = await open();
await (await worker(b)).evaluate(() => chrome.storage.local.set({ lock: { startedAt: Date.now(), endsAt: Date.now() + 600000, toggles: { siteLock: true }, sites: ['example.com'], videos: [] } }));
await sleep(1500);
await b.close();
b = await open();
try {
  await worker(b);
  const tab = await b.newPage();
  await tab.goto('https://example.org/').catch(() => {});
  await sleep(2500);
  assert.match(tab.url(), /blocked\.html/);
  console.log('lock survives restart');
} finally {
  await b.close();
}
