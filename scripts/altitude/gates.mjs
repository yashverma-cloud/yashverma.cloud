/**
 * The web-06 gates that need a browser but not Lighthouse, on the built site.
 *
 *   npm run build && PLAYWRIGHT_BROWSERS_PATH=0 node scripts/altitude/gates.mjs [budgets] [nowebgl] [inapp] [widths]
 *
 *   budgets  first-party JS before the 3D (everything fetched before `load`) ≤ 80 KB gzip, and the
 *            3D (everything fetched after, the engine and three.js among it) ≤ 250 KB gzip,
 *            on the home and a case study, with the live scene running
 *   nowebgl  WebGL disabled: still mode, no page errors, the stills shown
 *   inapp    Instagram, LinkedIn and Facebook in-app user agents on a phone: a mode is chosen, no
 *            errors, nothing wider than the screen
 *   widths   every page at 390, 1280, 1440, 1920 and 2560: the widest empty band beside the content,
 *            as a share of the width, and any horizontal overflow
 * Exits 1 if a gate fails. Writes .screenshots/web-06/gates.json.
 */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { serveDist } from '../lab/serve.mjs';

const PORT = 4336;
const BASE = `http://127.0.0.1:${PORT}`;
const GPU = ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const PAGES = [
  '/',
  '/work/cloud-cost-optimisation/',
  '/work/live-migration-to-kubernetes/',
  '/work/alert-payload-reduction/',
  '/work/karpenter-autoscaling/',
  '/work/jarvis-slack-ops/',
  '/work/sendmail-ses-cli/',
  '/writing/',
  '/404.html',
];
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const UAS = {
  instagram:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 Instagram 352.0.0.40.104 Android (34/14; 420dpi; 1080x2205; Google/google; Pixel 7; panther; panther; en_US; 641123490)',
  linkedin:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 [LinkedInApp]/9.30.1234',
  facebook:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.40.109;]',
};

const only = process.argv.slice(2);
const run = (name) => !only.length || only.includes(name);
const results = {};
const failures = [];
const check = (ok, what) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
};
const kb = (n) => Math.round(n / 102.4) / 10;

/** Gzip size of a built file, by its URL path. */
async function gz(path) {
  return gzipSync(await readFile(`dist${path}`), { level: 9 }).length;
}

async function budgets(browser, path) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const seen = [];
  let loaded = Infinity;
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin === BASE && u.pathname.endsWith('.js')) seen.push({ path: u.pathname, at: Date.now() });
  });
  page.on('load', () => (loaded = Date.now()));
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('[data-stage="on"]'), null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  // Inline module scripts count toward the first load too.
  const inline = await page.evaluate(() =>
    [...document.querySelectorAll('script:not([src]):not([type="application/ld+json"])')].map((s) => s.textContent).join('\n'),
  );
  await page.close();
  let before = gzipSync(inline, { level: 9 }).length;
  let after = 0;
  const late = [];
  for (const s of new Map(seen.map((s) => [s.path, s])).values()) {
    const size = await gz(s.path);
    if (s.at <= loaded) before += size;
    else {
      after += size;
      late.push(s.path.replace('/_astro/', ''));
    }
  }
  const has3d = late.some((p) => p.startsWith('engine.')) && late.some((p) => p.startsWith('three.'));
  return { beforeKB: kb(before), threeDKB: kb(after), deferred: late, has3d };
}

async function noWebGL(path) {
  const browser = await chromium.launch({ args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const state = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('picture img')];
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)))));
    return {
      mode: document.documentElement.dataset.mode,
      stage: document.querySelector('[data-stage]')?.getAttribute('data-stage') ?? document.documentElement.dataset.stage ?? 'off',
      stills: imgs.length,
      shown: imgs.filter((i) => i.naturalWidth > 0).length,
    };
  });
  await browser.close();
  return { ...state, errors };
}

async function inApp(browser, name, ua) {
  const context = await browser.newContext({ ...PHONE, userAgent: ua });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page
    .waitForFunction(() => document.documentElement.dataset.mode === 'still' || document.querySelector('.stage[data-stage="on"]'), null, { timeout: 240000 })
    .catch(() => {});
  await page.waitForTimeout(1000);
  const state = await page.evaluate(() => ({
    mode: document.documentElement.dataset.mode,
    stage: document.querySelector('.stage')?.dataset.stage ?? 'off',
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  await context.close();
  return { ...state, errors };
}

/** The widest empty band beside the page's text and media, sampled down the page. */
async function sides(browser, path, w) {
  const phone = w < 600;
  const page = await browser.newPage(phone ? PHONE : { viewport: { width: w, height: 900 } });
  await page.goto(`${BASE}${path}?mode=still`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const boxes = [];
    for (const el of document.querySelectorAll('main h1, main h2, main h3, main p, main li, main a, main button, main dl, main figure, main table, main pre, footer p')) {
      const b = el.getBoundingClientRect();
      if (b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden') boxes.push([b.left, b.right]);
    }
    const left = Math.min(...boxes.map((b) => b[0]));
    const right = Math.max(...boxes.map((b) => b[1]));
    return { vw, sw: document.documentElement.scrollWidth, left: Math.round(left), right: Math.round(right), emptyLeft: left / vw, emptyRight: (vw - right) / vw };
  });
  await page.close();
  return r;
}

await mkdir('.screenshots/web-06', { recursive: true });
const server = await serveDist(PORT);
const browser = await chromium.launch({ args: GPU });
try {
  if (run('budgets')) {
    for (const path of ['/', '/work/karpenter-autoscaling/']) {
      const b = await budgets(browser, path);
      results[`budgets ${path}`] = b;
      check(b.beforeKB <= 80, `${path} JS before the 3D ${b.beforeKB} KB gzip (≤ 80)`);
      check(b.threeDKB <= 250, `${path} 3D JS ${b.threeDKB} KB gzip (≤ 250)`);
      check(b.has3d, `${path} engine and three.js load after the page (deferred: ${b.deferred.length} files)`);
    }
  }
  if (run('nowebgl')) {
    for (const path of ['/', '/work/cloud-cost-optimisation/', '/404.html']) {
      const s = await noWebGL(path);
      results[`nowebgl ${path}`] = s;
      check(s.mode === 'still' || path !== '/', `${path} no WebGL: mode ${s.mode}`);
      check(s.errors.length === 0, `${path} no WebGL: ${s.errors.length} page errors ${s.errors.join(' | ')}`);
      check(s.stills > 0 && s.shown === s.stills, `${path} no WebGL: ${s.shown}/${s.stills} stills shown`);
    }
  }
  if (run('inapp')) {
    for (const [name, ua] of Object.entries(UAS)) {
      const s = await inApp(browser, name, ua);
      results[`inapp ${name}`] = s;
      check(s.errors.length === 0, `${name} in-app: mode ${s.mode}, stage ${s.stage}, ${s.errors.length} errors ${s.errors.join(' | ')}`);
      check(s.scrollWidth <= s.clientWidth, `${name} in-app: ${s.scrollWidth} px wide on a ${s.clientWidth} px screen`);
    }
  }
  if (run('widths')) {
    for (const w of [390, 1280, 1440, 1920, 2560]) {
      for (const path of PAGES) {
        const s = await sides(browser, path, w);
        results[`widths ${w} ${path}`] = s;
        const worst = Math.max(s.emptyLeft, s.emptyRight);
        // Over a third of the screen empty on one side reads as a dead area.
        check(worst <= 0.34 && s.sw <= s.vw, `${w} ${path}: content ${s.left}–${s.right} of ${s.vw}, widest empty side ${Math.round(worst * 100)}%${s.sw > s.vw ? `, OVERFLOW ${s.sw}` : ''}`);
      }
    }
  }
} finally {
  await browser.close();
  server.close();
}
await writeFile('.screenshots/web-06/gates.json', JSON.stringify(results, null, 2));
console.log(failures.length ? `${failures.length} gate(s) failed` : 'all gates passed');
process.exit(failures.length ? 1 : 0);
