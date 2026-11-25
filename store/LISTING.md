# Store listing

**Name:** Holdfast

**Summary:** Lock your browser to what you are studying. No early exit, no account, nothing leaves your browser.

**Category:** Productivity. **Privacy policy:** https://github.com/Assis-Mohanty/holdfast/blob/main/PRIVACY.md

**Description**

Choose a time, from 5 minutes to 4 hours, and what stays open. Holdfast blocks the rest until the time is up. There is no unlock button.

- Only these sites: every other site is blocked
- Only these videos: YouTube plays only the videos and playlists you list
- No Shorts, no music, no gaming videos
- Smart filter: YouTube shows coding, maths and books, judged on your device. It makes some mistakes.
- Development mode: study sites, plus yours, plus filtered YouTube

Blocked tabs come back when the lock ends. Save your work before you start one. You can still remove the extension from browser settings.

**Single purpose:** block distracting sites and videos for a time the user sets.

**Permissions**

- `tabs`, `webNavigation`: compare the address of each tab with the running lock and replace blocked ones.
- `storage`: keep settings and the running lock.
- `offscreen` (Chrome): run the packaged title model, which needs a page for WebAssembly.
- `https://www.youtube.com/*`: hide and block videos the user has filtered out.
- `wasm-unsafe-eval`: run the packaged ONNX Runtime. No remote code is loaded.

**Data collection:** none.

**Firefox source build:** Node 20 or newer, `npm ci`, then `npm run build -- --store`. Output is in `dist/firefox`.
