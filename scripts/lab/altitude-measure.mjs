/**
 * Measures the Altitude prototype against the brief's gates, on the built site.
 *
 *   npm run build:fast && PLAYWRIGHT_BROWSERS_PATH=0 node scripts/lab/altitude-measure.mjs [--quick]
 *
 * This machine has no GPU (WebGL runs in SwiftShader, on the CPU), so it reports:
 *   - load: LCP, FCP, time to the live scene, and bytes, on a mid-range phone profile
 *     (412×823 @1.75, 4× CPU slowdown, Slow 4G) and on a desktop profile;
 *   - CPU: main-thread milliseconds per frame at 4× slowdown, with the drawing buffer shrunk
 *     so GPU work is negligible: the part of the frame budget a GPU cannot help with;
 *   - GPU, relative: software-rendered milliseconds per frame for each cloud method at the
 *     same settings. Absolute fps needs real hardware: open the page with ?stats=1;
 *   - fallbacks: WebGL disabled, and in-app browser user agents.
 * Writes .screenshots/web-04/measure.json and prints a summary.
 */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { serveDist } from './serve.mjs';

const BASE = 'http://127.0.0.1:4322/lab/altitude/';
const OUT = '.screenshots/web-04';
const quick = process.argv.includes('--quick');
const results = {};
const log = (...a) => console.log(...a);

const MOBILE = {
  viewport: { width: 412, height: 823 },
  deviceScaleFactor: 1.75,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
};
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };

const INIT = `
  window.__m = { lcp: 0, fcp: 0, stageOn: 0, lcpEl: '' };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__m.lcp = e.startTime; window.__m.lcpEl = (e.element && (e.element.tagName + '.' + e.element.className)) || e.url || ''; } }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__m.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
  const poll = setInterval(() => {
    if (document.documentElement && document.documentElement.dataset.stage === 'on') {
      window.__m.stageOn = performance.now();
      clearInterval(poll);
    }
  }, 50);
`;

async function gz(path) {
  try {
    const body = await readFile(join('dist', path));
    return { raw: body.length, gzip: gzipSync(body, { level: 9 }).length };
  } catch {
    return { raw: 0, gzip: 0 };
  }
}

const GPU_ARGS = ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function loadRun(name, ctxOpts, { throttle = false, query = '' } = {}) {
  const browser = await chromium.launch({ args: GPU_ARGS });
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  await page.addInitScript(INIT);
  const reqs = [];
  page.on('requestfinished', async (r) => {
    const u = new URL(r.url());
    reqs.push({ path: u.pathname, type: r.resourceType(), t: Date.now() });
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/GL Driver/.test(m.text()) && errors.push(m.text()));
  if (throttle) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  const t0 = Date.now();
  // A small drawing buffer: software WebGL at full size would starve the throttled main
  // thread and distort every timing after the first frame. Load, LCP and bytes are unaffected.
  const q = ['dpr=0.25', query].filter(Boolean).join('&');
  await page.goto(`${BASE}?${q}`, { waitUntil: 'load', timeout: 180000 });
  const loadMs = Date.now() - t0;
  log(`  ${name}: load event after ${loadMs} ms`);
  await page
    .waitForFunction(() => window.__m.stageOn > 0 || document.documentElement.dataset.mode === 'still', null, { timeout: 240000, polling: 500 })
    .catch(() => log('  scene did not start within 240 s'));
  log(`  ${name}: scene step done after ${Date.now() - t0} ms`);
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => ({ ...window.__m, mode: document.documentElement.dataset.mode }));
  // Bytes, gzip-compressed as Cloudflare would serve text; images and fonts as they are.
  const seen = new Set();
  const rows = [];
  for (const r of reqs) {
    if (seen.has(r.path)) continue;
    seen.add(r.path);
    const file = r.path.endsWith('/') ? r.path + 'index.html' : r.path;
    const size = await gz(file);
    const text = /\.(js|css|html|svg|json)$/.test(file);
    rows.push({ path: r.path, type: r.type, bytes: text ? size.gzip : size.raw, raw: size.raw });
  }
  const js = rows.filter((r) => r.path.endsWith('.js'));
  // The scene is everything loaded on idle after `load`: the engine and three.js.
  const engineChunk = js.filter((r) => /engine|three/.test(r.path));
  const total = rows.reduce((a, r) => a + r.bytes, 0);
  const res = {
    lcpMs: Math.round(m.lcp),
    lcpElement: m.lcpEl,
    fcpMs: Math.round(m.fcp),
    sceneOnMs: Math.round(m.stageOn),
    loadEventMs: loadMs,
    mode: m.mode,
    jsGzipKB: +(js.reduce((a, r) => a + r.bytes, 0) / 1024).toFixed(1),
    jsBefore3dGzipKB: +(js.filter((r) => !engineChunk.includes(r)).reduce((a, r) => a + r.bytes, 0) / 1024).toFixed(1),
    engineChunkGzipKB: +(engineChunk.reduce((a, r) => a + r.bytes, 0) / 1024).toFixed(1),
    totalKB: +(total / 1024).toFixed(1),
    requests: rows.map((r) => `${r.path} ${(r.bytes / 1024).toFixed(1)} KB`),
    errors,
  };
  await page.screenshot({ path: `${OUT}/measure-${name}.png`, timeout: 60000 }).catch(() => log('  screenshot timed out'));
  await browser.close();
  return res;
}

async function cpuRun(method) {
  // Tiny drawing buffer: what is left is the main thread's own work per frame.
  const browser = await chromium.launch({ args: GPU_ARGS });
  const context = await browser.newContext(MOBILE);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await page.goto(`${BASE}?perf=1&dpr=0.08&q=low&clouds=${method}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__altLive && window.__altLive.on(), null, { timeout: 240000 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => {
    window.__altLive.perf.work.length = 0;
    window.__altLive.perf.stamps.length = 0;
  });
  // Scroll the whole flight in 14 seconds.
  await page.evaluate(
    () =>
      new Promise((done) => {
        const max = document.documentElement.scrollHeight - innerHeight;
        const t0 = performance.now();
        const step = (now) => {
          const k = Math.min(1, (now - t0) / 14000);
          scrollTo(0, k * max);
          if (k < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      }),
  );
  const perf = await page.evaluate(() => window.__altLive.perf);
  const passes = await page.evaluate(() => window.__altLive.stats().cpuMs);
  await browser.close();
  const work = [...perf.work].sort((a, b) => a - b);
  const gaps = perf.stamps.slice(1).map((t, i) => t - perf.stamps[i]).sort((a, b) => a - b);
  const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))];
  return {
    frames: work.length,
    mainThreadMsMedian: +q(work, 0.5).toFixed(2),
    mainThreadMsP95: +q(work, 0.95).toFixed(2),
    fpsMedian: +(1000 / q(gaps, 0.5)).toFixed(1),
    fpsP5: +(1000 / q(gaps, 0.95)).toFixed(1),
    passMs: Object.fromEntries(Object.entries(passes).map(([k, v]) => [k, +v.toFixed(2)])),
  };
}

async function gpuRelative(method, ctxOpts, tier) {
  const browser = await chromium.launch({ args: GPU_ARGS });
  const page = await browser.newPage(ctxOpts);
  await page.goto(`${BASE}?capture=1&q=${tier}&clouds=${method}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__altReady, null, { timeout: 240000 });
  const points = [0, 0.2, 0.42, 0.62, 0.83, 0.95];
  const out = {};
  for (const p of points) {
    out[p] = await page.evaluate((p) => {
      const e = window.__alt.engine;
      const gl = e.renderer.getContext();
      // gl.finish() returns at once in Chrome; reading a pixel back is what waits for the GPU.
      const px = new Uint8Array(4);
      const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      window.__alt.goto(p, 2);
      sync();
      const t0 = performance.now();
      for (let i = 0; i < 4; i++) {
        e.renderAt(p, -1, 1);
        sync();
      }
      return +((performance.now() - t0) / 4).toFixed(0);
    }, p);
  }
  const stats = await page.evaluate(() => window.__alt.engine.stats());
  await browser.close();
  return { msPerFrameSoftware: out, cloudRes: stats.cloudRes, drawRes: stats.drawRes };
}

async function noWebGL() {
  const browser = await chromium.launch({ args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });
  const page = await browser.newPage(DESKTOP);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.mode === 'still', null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const state = await page.evaluate(() => ({
    mode: document.documentElement.dataset.mode,
    h1: document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim(),
    postersShown: [...document.querySelectorAll('.plate-poster img')].filter((i) => i.complete && i.naturalWidth > 0).length,
    caseTitle: document.querySelector('#case-title')?.textContent,
    textVisible: getComputedStyle(document.querySelector('.beat')).opacity,
  }));
  await page.screenshot({ path: `${OUT}/measure-nowebgl.png`, fullPage: true });
  await browser.close();
  return { ...state, errors };
}

async function inApp(name, ua) {
  const browser = await chromium.launch({ args: GPU_ARGS });
  const context = await browser.newContext({ ...MOBILE, viewport: { width: 412, height: 740 }, userAgent: ua });
  const page = await context.newPage();
  await page.addInitScript(INIT);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__m.stageOn > 0 || document.documentElement.dataset.mode === 'still', null, { timeout: 240000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const state = await page.evaluate(() => ({ mode: document.documentElement.dataset.mode, stage: document.documentElement.dataset.stage ?? 'off', lcp: Math.round(window.__m.lcp) }));
  await page.screenshot({ path: `${OUT}/measure-inapp-${name}.png` });
  await browser.close();
  return { ...state, errors };
}

await mkdir(OUT, { recursive: true });
const server = await serveDist(4322);
try {
  log('load: mobile, 4x CPU, Slow 4G');
  results.loadMobile = await loadRun('mobile', MOBILE, { throttle: true });
  log(results.loadMobile);
  log('load: desktop');
  results.loadDesktop = await loadRun('desktop', DESKTOP);
  log({ ...results.loadDesktop, requests: undefined });
  for (const method of ['raymarch', 'billboard']) {
    log(`cpu: ${method}, 4x CPU`);
    results[`cpu4x_${method}`] = await cpuRun(method);
    log(results[`cpu4x_${method}`]);
  }
  if (!quick) {
    for (const method of ['raymarch', 'billboard']) {
      log(`gpu (software), ${method}, phone low tier`);
      results[`gpuPhoneLow_${method}`] = await gpuRelative(method, { viewport: { width: 412, height: 915 }, deviceScaleFactor: 1.5 }, 'low');
      log(results[`gpuPhoneLow_${method}`]);
      log(`gpu (software), ${method}, desktop high tier`);
      results[`gpuDesktopHigh_${method}`] = await gpuRelative(method, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, 'high');
      log(results[`gpuDesktopHigh_${method}`]);
    }
  }
  log('no WebGL');
  results.noWebGL = await noWebGL();
  log(results.noWebGL);
  const uas = {
    instagram:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 Instagram 352.0.0.40.104 Android (34/14; 420dpi; 1080x2205; Google/google; Pixel 7; panther; panther; en_US; 641123490)',
    linkedin:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 [LinkedInApp]/9.30.1234',
    facebook:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.40.109;]',
  };
  for (const [name, ua] of Object.entries(uas)) {
    log(`in-app: ${name}`);
    results[`inApp_${name}`] = await inApp(name, ua);
    log(results[`inApp_${name}`]);
  }
} finally {
  server.close();
}
await writeFile(`${OUT}/measure.json`, JSON.stringify(results, null, 2));
log(`wrote ${OUT}/measure.json`);
