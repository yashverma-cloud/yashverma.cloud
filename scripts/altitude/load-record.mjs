/**
 * The home page's first seconds as a visitor sees them, and what moved: a real-time screencast
 * of the load encoded to WebM, a filmstrip of its opening frames, every layout shift with the
 * elements that moved, and where the hero's name, role and line sat on each frame.
 *
 *   npm run build:fast && PLAYWRIGHT_BROWSERS_PATH=0 node scripts/altitude/load-record.mjs \
 *     --profile=phone|laptop [--label=before] [--toolbar=56] [--seconds=8] [--path=/]
 *
 * phone: 390×844 at 3x, touch, 4× CPU slowdown and Slow 4G (Lighthouse's mobile profile).
 *   --toolbar=N makes innerHeight N px shorter than the large viewport, as a phone's URL bar
 *   does on load (device emulation has no browser chrome, so there svh = lvh = innerHeight).
 * laptop: 1440×900 at 1x, no CPU slowdown, a 10 Mbps / 40 ms connection.
 *
 * This machine renders WebGL on the CPU, so the scene's buffer is shrunk (?dpr=0.35) to keep
 * it from starving the page; layout, fonts, posters and timings are what a visitor gets.
 * Writes .screenshots/web-06-polish/load-<profile>-<label>.{webm,png,json}.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { serveDist } from '../lab/serve.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=').slice(1).join('=');
const profile = arg('profile', 'phone');
const label = arg('label', 'now');
const toolbar = Number(arg('toolbar', profile === 'phone' ? '56' : '0'));
const seconds = Number(arg('seconds', '8'));
const path = arg('path', '/');
const OUT = '.screenshots/web-06-polish';
const FPS = 30;

const PROFILES = {
  phone: {
    ctx: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
    },
    cpu: 4,
    net: { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
    cast: { maxWidth: 780, maxHeight: 1688 },
  },
  laptop: {
    ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    cpu: 1,
    net: { offline: false, latency: 40, downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8 },
    cast: { maxWidth: 1440, maxHeight: 900 },
  },
};
const P = PROFILES[profile];
if (!P) throw new Error(`unknown profile ${profile}`);

// In the page before any of its own scripts: the observers, and the hero's positions per frame.
const INIT = `
(() => {
  const toolbar = ${toolbar};
  if (toolbar > 0) {
    // Read through the real getter each time: at document start the layout viewport is still
    // 980 px wide (the viewport meta is not parsed yet), so a value captured now would be wrong.
    const d = Object.getOwnPropertyDescriptor(window, 'innerHeight') || Object.getOwnPropertyDescriptor(Window.prototype, 'innerHeight');
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => d.get.call(window) - toolbar });
  }
  const m = (window.__load = { shifts: [], lcp: [], fcp: 0, fontsReady: 0, archivo: 0, posterLoaded: 0, stageOn: 0, frames: [] });
  const describe = (n) => {
    if (!n) return '(gone)';
    if (n.nodeType === 3) return '#text "' + n.textContent.trim().slice(0, 40) + '"';
    const cls = typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\\s+/).join('.') : '';
    return n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + cls;
  };
  const r = (x) => x && { x: Math.round(x.x), y: Math.round(x.y), w: Math.round(x.width), h: Math.round(x.height) };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries())
      m.shifts.push({ t: Math.round(e.startTime), v: +e.value.toFixed(5), input: e.hadRecentInput, src: (e.sources || []).map((s) => ({ node: describe(s.node), prev: r(s.previousRect), cur: r(s.currentRect) })) });
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) m.lcp.push({ t: Math.round(e.startTime), el: describe(e.element), size: e.size });
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') m.fcp = Math.round(e.startTime);
  }).observe({ type: 'paint', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (/archivo-latin-var/.test(e.name)) m.archivo = Math.round(e.responseEnd);
  }).observe({ type: 'resource', buffered: true });
  document.fonts.ready.then(() => (m.fontsReady = Math.round(performance.now())));
  const els = { name: '[data-hero-name]', role: '[data-hero-role]', line: '[data-hero-line]', word: '[data-hero-name] .word' };
  let last = '';
  const t0 = performance.now();
  const tick = () => {
    const t = performance.now();
    const row = {};
    for (const [k, sel] of Object.entries(els)) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const b = el.getBoundingClientRect();
      row[k] = [Math.round(b.top * 2) / 2, Math.round(b.height * 2) / 2];
      if (k === 'word') row.wordOpacity = +getComputedStyle(el).opacity;
    }
    const img = document.querySelector('.stage-poster img');
    if (img && img.complete && img.naturalWidth && !m.posterLoaded) m.posterLoaded = Math.round(t);
    const stage = document.querySelector('.stage');
    if (stage && stage.dataset.stage === 'on' && !m.stageOn) m.stageOn = Math.round(t);
    const key = JSON.stringify(row);
    if (key !== last) {
      m.frames.push({ t: Math.round(t), ...row });
      last = key;
    }
    if (t - t0 < ${seconds * 1000}) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
`;

/** CLS as Chrome scores it: the worst session window (gaps under 1 s, at most 5 s long). */
function cls(shifts) {
  let worst = 0;
  let cur = 0;
  let start = -1;
  let prev = -1;
  for (const s of shifts.filter((x) => !x.input)) {
    if (start < 0 || s.t - prev > 1000 || s.t - start > 5000) {
      cur = 0;
      start = s.t;
    }
    cur += s.v;
    prev = s.t;
    worst = Math.max(worst, cur);
  }
  return +worst.toFixed(4);
}

await mkdir(OUT, { recursive: true });
const base = `${OUT}/load-${profile}-${label}`;
const server = await serveDist(4322);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const frames = [];
let result;
try {
  const context = await browser.newContext(P.ctx);
  const page = await context.newPage();
  await page.addInitScript(INIT);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => msg.type() === 'error' && !/GL Driver|GPU stall/.test(msg.text()) && errors.push(msg.text()));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', P.net);
  if (P.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: P.cpu });
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    frames.push({ t: metadata.timestamp * 1000, data: Buffer.from(data, 'base64') });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await page.goto('about:blank');
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, everyNthFrame: 1, ...P.cast });
  const sep = path.includes('?') ? '&' : '?';
  await page.goto(`http://127.0.0.1:4322${path}${sep}dpr=0.35`, { waitUntil: 'commit', timeout: 120000 });
  const origin = await page.evaluate(() => performance.timeOrigin);
  await page.waitForTimeout(seconds * 1000);
  await cdp.send('Page.stopScreencast');
  const m = await page.evaluate(() => window.__load);
  const mode = await page.evaluate(() => document.documentElement.dataset.mode);
  result = {
    profile,
    label,
    toolbar,
    mode,
    cls: cls(m.shifts),
    fcp: m.fcp,
    lcp: m.lcp.at(-1) ?? null,
    archivoFontMs: m.archivo,
    fontsReadyMs: m.fontsReady,
    posterLoadedMs: m.posterLoaded,
    stageOnMs: m.stageOn,
    shifts: m.shifts,
    hero: m.frames,
    errors,
    origin,
  };
} finally {
  await browser.close();
  server.close();
}

// Frames on a constant 30 fps clock from navigation start: each tick shows the latest frame.
const origin = result.origin;
const timeline = frames.map((f) => ({ ...f, t: f.t - origin })).filter((f) => f.t > -50).sort((a, b) => a.t - b.t);
delete result.origin;
const total = Math.round(seconds * FPS);
const ffmpeg = spawn('node_modules/playwright-core/.local-browsers/ffmpeg-1011/ffmpeg-linux', [
  '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
  '-c:v', 'vp8', '-b:v', '4M', '-qmin', '0', '-qmax', '40', '-crf', '10', '-deadline', 'good', '-cpu-used', '2', `${base}.webm`,
]);
const done = new Promise((ok) => ffmpeg.on('close', ok));
// Nothing is painted until the page commits: a white frame (the browser's blank) stands in.
const { width: fw, height: fh } = await sharp(timeline[0].data).metadata();
const blank = await sharp({ create: { width: fw, height: fh, channels: 3, background: '#fff' } }).jpeg().toBuffer();
let k = -1;
for (let i = 0; i < total; i++) {
  const t = (i / FPS) * 1000;
  while (k + 1 < timeline.length && timeline[k + 1].t <= t) k++;
  const jpg = k >= 0 ? timeline[k].data : blank;
  if (!ffmpeg.stdin.write(jpg)) await new Promise((ok) => ffmpeg.stdin.once('drain', ok));
}
ffmpeg.stdin.end();
await done;

// Filmstrip: the opening 3 s, every 150 ms, with the time on each frame.
const strip = [];
const cellW = profile === 'phone' ? 195 : 360;
for (let t = 0; t <= 3000; t += 150) {
  let f = null;
  for (const x of timeline) if (x.t <= t) f = x;
  const img = f ? sharp(f.data).resize({ width: cellW }) : sharp({ create: { width: cellW, height: Math.round(cellW * 1.6), channels: 3, background: '#fff' } });
  const buf = await img.png().toBuffer();
  const meta = await sharp(buf).metadata();
  const svg = Buffer.from(`<svg width="${meta.width}" height="28"><rect width="100%" height="28" fill="#000"/><text x="6" y="20" font-family="monospace" font-size="16" fill="#fff">${t} ms</text></svg>`);
  strip.push(await sharp(buf).composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer());
}
const meta = await sharp(strip[0]).metadata();
const cols = profile === 'phone' ? 7 : 4;
const rows = Math.ceil(strip.length / cols);
await sharp({ create: { width: cols * (meta.width + 4), height: rows * (meta.height + 4), channels: 3, background: '#222' } })
  .composite(strip.map((b, i) => ({ input: b, left: (i % cols) * (meta.width + 4), top: Math.floor(i / cols) * (meta.height + 4) })))
  .png()
  .toFile(`${base}.png`);

await writeFile(`${base}.json`, JSON.stringify(result, null, 1));
const moved = (k) => {
  const ys = result.hero.filter((r) => r[k]).map((r) => r[k][0]);
  return ys.length ? `${Math.min(...ys)}..${Math.max(...ys)}` : '-';
};
console.log(
  `${profile}/${label}: mode ${result.mode}, CLS ${result.cls} (${result.shifts.length} shifts), FCP ${result.fcp}, LCP ${result.lcp?.t} ${result.lcp?.el}, Archivo ${result.archivoFontMs}, fonts.ready ${result.fontsReadyMs}, poster ${result.posterLoadedMs}, stage ${result.stageOnMs}`,
);
console.log(`  top of name ${moved('name')}, role ${moved('role')}, line ${moved('line')} (px over ${result.hero.length} changes); errors ${result.errors.length}`);
console.log(`  ${base}.webm, ${base}.png, ${base}.json`);
