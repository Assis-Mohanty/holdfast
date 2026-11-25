import assert from 'node:assert';
import test from 'node:test';
import { blockReason, createLock, hideReason, isActive, isLockableList, toSite, validate } from '../src/rules.js';

const lock = (on, sites = [], videos = []) =>
  createLock({ toggles: Object.fromEntries(on.map(n => [n, true])), sites, videos }, 60, 0);
const check = (l, cases) => cases.forEach(([url, want]) => assert.equal(blockReason(url, l), want, url));
const video = { type: 'video', id: 'abc' };
const list = { type: 'list', id: 'PL1' };

test('site lock covers the whole site and nothing else', () =>
  check(lock(['siteLock'], ['maang.in', 'chatgpt.com']), [
    ['https://maang.in/problems/x', null],
    ['https://www.maang.in/lectures/1?a=b', null],
    ['https://evilmaang.in/', 'site'],
    ['https://maang.in.evil.com/', 'site'],
    ['https://maang.in./x', null],
    ['https://reddit.com/', 'site'],
    ['https://www.youtube.com/', 'site'],
    ['https://auth.openai.com/login', null],
    ['chrome://newtab/', null],
    ['file:///home/x/book.pdf', null],
  ]));

test('video lock allows only listed videos and playlists', () =>
  check(lock(['videoLock'], [], [video, list]), [
    ['https://www.youtube.com/watch?v=abc&t=10', null],
    ['https://youtu.be/abc', null],
    ['https://www.youtube.com/live/abc', null],
    ['https://www.youtube.com/watch?v=zzz&list=PL1', null],
    ['https://www.youtube.com/playlist?list=PL1', null],
    ['https://www.youtube.com/watch?v=zzz', 'video'],
    ['https://www.youtube.com/', 'video'],
    ['https://www.youtube.com/?list=PL1', 'video'],
    ['https://www.youtube.com/shorts/abc', 'video'],
    ['https://www.youtube.com/embed/zzz?list=PL1', 'video'],
    ['https://m.youtube.com/watch?v=abc', 'video'],
    ['https://music.youtube.com/watch?v=abc', 'video'],
    ['https://reddit.com/', null],
  ]));

test('site and video locks combine', () =>
  check(lock(['siteLock', 'videoLock'], ['maang.in', 'youtube.com'], [video]), [
    ['https://www.youtube.com/watch?v=abc', null],
    ['https://www.youtube.com/watch?v=zzz', 'video'],
    ['https://maang.in/', null],
    ['https://x.com/', 'site'],
  ]));

test('single toggles', () => {
  check(lock(['noShorts']), [['https://www.youtube.com/shorts/q', 'shorts'], ['https://www.youtube.com/', null]]);
  check(lock(['noMusic']), [
    ['https://music.youtube.com/', 'music'],
    ['https://open.spotify.com/x', 'music'],
    ['https://m.youtube.com/watch?v=q', 'player'],
    ['https://www.youtube.com/embed/q', 'player'],
    ['https://www.youtube.com/watch?v=q', null],
    ['https://youtu.be/q', null],
  ]);
});

test('development mode opens study sites and filtered YouTube', () => {
  const l = lock(['devMode'], ['mybook.com']);
  assert.ok(l.toggles.smart && l.toggles.noShorts && l.toggles.noMusic && l.toggles.noGaming);
  check(l, [
    ['https://en.cppreference.com/w/', null],
    ['https://mybook.com/1', null],
    ['https://www.youtube.com/', null],
    ['https://www.youtube.com/shorts/x', 'shorts'],
    ['https://reddit.com/', 'site'],
  ]);
});

test('validation', () => {
  const s = (on, sites = [], videos = []) => ({ toggles: Object.fromEntries(on.map(n => [n, true])), sites, videos });
  assert.ok(validate(s([]), 60));
  assert.ok(validate(s(['siteLock']), 60));
  assert.ok(validate(s(['videoLock'], ['a.com']), 60));
  assert.ok(validate(s(['noShorts']), 241));
  assert.ok(validate(s(['noShorts']), 0));
  assert.ok(validate(s(['noShorts']), NaN));
  assert.equal(validate(s(['siteLock', 'videoLock'], [], [video]), 60), null);
  assert.equal(isActive(lock(['noShorts']), 3599999), true);
  assert.equal(isActive(lock(['noShorts']), 3600000), false);
  assert.equal(toSite('https://www.maang.in/a'), 'maang.in');
  assert.equal(toSite('chatgpt.com'), 'chatgpt.com');
  assert.equal(toSite('javascript://x.com'), null);
  assert.equal(toSite('hello'), null);
  assert.equal(isLockableList('RDabc'), false);
  assert.equal(isLockableList('PLabc'), true);
});

test('video verdicts', () => {
  const keep = { keep: 0.8, music: 0.5, gaming: 0.5, other: 0.6 };
  const other = { keep: 0.5, music: 0.5, gaming: 0.4, other: 0.8 };
  const all = { smart: true };
  assert.equal(hideReason('Raft lecture', keep, all), null);
  assert.equal(hideReason('Wake up at 5', other, all), 'smart');
  assert.equal(hideReason('Wake up at 5', other, { noMusic: true }), null);
  assert.equal(hideReason('x', null, all), 'unchecked');
  assert.equal(hideReason('x', null, { noMusic: true }), null);
  assert.equal(hideReason('Raft lecture', keep, { noMusic: true }, 'Music'), 'music');
  assert.equal(hideReason('Coding music mix', keep, all), 'music');
});
