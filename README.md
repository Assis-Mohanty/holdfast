# Holdfast

Locks your browser to what you are studying, for a time you choose. There is no early unlock in the extension, no account, and nothing leaves your browser.

One timer (5 minutes to 4 hours), seven toggles:

- **Only these sites**: every other site is blocked. Adding a site allows all of its pages.
- **Only these videos**: YouTube plays only the videos and playlists you list.
- **No Shorts**, **No music**, **No gaming videos**
- **Smart filter**: YouTube shows coding, maths and books. Titles are judged by a small model inside the extension, so it makes some mistakes.
- **Development mode**: a list of study sites, plus yours, plus filtered YouTube. Edit `STUDY_SITES` in `src/rules.js`.

## Install

Download a zip from [Releases](https://github.com/Assis-Mohanty/holdfast/releases) and unzip it.

**Chrome, or another Chromium browser (123 or newer):** open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and choose the unzipped folder. Keep the folder; the browser loads the extension from it. Then open Details and allow it in Incognito if you want private windows covered.

**Firefox 128 or newer (temporary, until restart):** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and pick `manifest.json` from the unzipped folder.

Try a 5 minute lock first. Blocked tabs are replaced and reload when the lock ends, so save your work.

## Limits

You can still remove the extension from browser settings, change the system clock, or use another browser or profile. Updates are manual. Tested on Chrome; on Firefox only blocking and the filter were tested. Other Chromium browsers have not been tested yet.

## Privacy

Settings stay in the browser's extension storage. There is no server, tracking or analytics. With a filter on, the extension requests a video's YouTube page from YouTube to read its title and category. Other requests are for your normal browsing only.

## Build

```
npm install
npm run build -- --store   # dist/chrome and dist/firefox, as released
npm test
```

`npm run build` without `--store` also blocks the browser's extensions page during a lock. The first build downloads the model from Hugging Face.

Third-party licenses are in `licenses/`.
