// node build.mjs            -> dist/chrome, dist/firefox (personal: also blocks the extensions page)
// node build.mjs --store    -> same folders, store-safe
import * as fs from 'node:fs';
import { deflateSync } from 'node:zlib';
import { build } from 'esbuild';

const PERSONAL = !process.argv.includes('--store');
const { version, description } = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
const MODEL = 'bge-small-en-v1.5';
const MODEL_REVISION = 'main';

for (const file of ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx']) {
  const path = `models/${MODEL}/${file}`;
  if (fs.existsSync(path)) continue;
  const response = await fetch(`https://huggingface.co/Xenova/${MODEL}/resolve/${MODEL_REVISION}/${file}`);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  fs.mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  fs.writeFileSync(path, Buffer.from(await response.arrayBuffer()));
}

/** A ring with a solid centre, drawn here so the repo needs no binary icons. */
function icon(size) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const b of body) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, body.length + 4);
    return out;
  };
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const cover = (r, edge) => Math.min(1, Math.max(0, edge - r + 0.5));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
      const alpha = cover(r, size * 0.5) - cover(r, size * 0.36) + cover(r, size * 0.2);
      raw.set([0x2f, 0x8f, 0x67, Math.round(alpha * 255)], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const target of ['chrome', 'firefox']) {
  const FIREFOX = target === 'firefox';
  const out = `dist/${target}`;
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(`${out}/ort`, { recursive: true });
  for (const file of fs.readdirSync('src').filter(f => /\.(html|css)$/.test(f))) fs.copyFileSync(`src/${file}`, `${out}/${file}`);
  for (const size of [16, 32, 48, 128]) fs.writeFileSync(`${out}/icon${size}.png`, icon(size));
  fs.cpSync(`models/${MODEL}`, `${out}/models/${MODEL}`, { recursive: true });
  // The one runtime variant transformers.js loads.
  for (const file of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) {
    fs.copyFileSync(`node_modules/onnxruntime-web/dist/${file}`, `${out}/ort/${file}`);
  }
  fs.cpSync('licenses', `${out}/licenses`, { recursive: true });

  const common = { bundle: true, outdir: out, target: 'es2022', define: { PERSONAL: String(PERSONAL), FIREFOX: String(FIREFOX) } };
  const page = { ...common, format: 'esm' };
  await build({ ...common, format: 'iife', entryPoints: ['src/content.js'] });
  await build({ ...page, entryPoints: ['src/background.js', 'src/popup.js', 'src/blocked.js'] });
  await build({ ...page, entryPoints: ['src/ai.js'], minify: true, logLevel: 'error' });

  const permissions = ['storage', 'tabs', 'webNavigation'];
  const icons = { 16: 'icon16.png', 32: 'icon32.png', 48: 'icon48.png', 128: 'icon128.png' };
  fs.writeFileSync(
    `${out}/manifest.json`,
    JSON.stringify(
      {
        manifest_version: 3,
        name: 'Holdfast',
        version,
        description,
        icons,
        action: { default_popup: 'popup.html', default_icon: icons },
        permissions: FIREFOX ? permissions : [...permissions, 'offscreen'],
        host_permissions: ['https://www.youtube.com/*'],
        content_scripts: [{ matches: ['https://www.youtube.com/*'], js: ['content.js'], css: ['content.css'], run_at: 'document_start' }],
        content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" },
        ...(FIREFOX
          ? {
              background: { scripts: ['ai.js', 'background.js'], type: 'module' },
              browser_specific_settings: { gecko: { id: 'holdfast@holdfast.local', strict_min_version: '128.0', data_collection_permissions: { required: ['none'] } } },
            }
          : { minimum_chrome_version: '123', background: { service_worker: 'background.js', type: 'module' } }),
      },
      null,
      2,
    ),
  );
}
console.log(`Built dist/chrome and dist/firefox (${PERSONAL ? 'personal' : 'store'})`);
