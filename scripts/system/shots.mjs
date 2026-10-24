/**
 * Screenshots of built pages at review widths, for the design loop and the checks.
 *
 *   npm run build:fast && PLAYWRIGHT_BROWSERS_PATH=0 node scripts/system/shots.mjs <out-dir> <path>[,<path>...] [--sizes=390x844,1440x900] [--full] [--scroll] [--wait=ms]
 *
 * Each path may carry a query (e.g. /lab/altitude/?mode=still). Writes <out-dir>/<slug>-<w>x<h>.png.
 * --scroll scrolls the page through first (lazy images, frames, scroll-driven states).
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { serveDist } from '../lab/serve.mjs';

const [out, list] = process.argv.slice(2);
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
const sizes = arg('sizes', '390x844,1440x900,2560x1440').split(',').map((s) => s.split('x').map(Number));
const full = process.argv.includes('--full');
// Scroll through first, so lazy images, frames and scroll-driven states are what a reader sees.
const scroll = process.argv.includes('--scroll');
const wait = Number(arg('wait', '400'));
await mkdir(out, { recursive: true });
const server = await serveDist(4323);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const path of list.split(',')) {
    for (const [w, h] of sizes) {
      const phone = w < 600;
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`http://127.0.0.1:4323${path}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      if (scroll) {
        await page.evaluate(async () => {
          const step = window.innerHeight * 0.8;
          for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 120));
          }
          window.scrollTo(0, 0);
        });
      }
      await page.waitForTimeout(wait);
      const slug = path.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'home';
      const file = `${out}/${slug}-${w}x${h}.png`;
      await page.screenshot({ path: file, fullPage: full, timeout: 120000 });
      console.log(file, errors.length ? `ERRORS: ${errors.join(' | ')}` : '');
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
