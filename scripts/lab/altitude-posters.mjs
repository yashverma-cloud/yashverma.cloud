/**
 * Renders the Altitude prototype's posters from the live scene, for the loading frame and the
 * still mode. Writes src/assets/lab/altitude/<shot>-<orientation>.webp; Astro makes the
 * AVIF and WebP sizes at build time.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=0 node scripts/lab/altitude-posters.mjs [shot ...]
 */
import { chromium } from 'playwright';
import { serveDist } from './serve.mjs';
import sharp from 'sharp';

const SHOTS = { hero: 0, between: 0.43, close: 0.815, wide: 0.95 };
const SIZES = { landscape: [2560, 1220], portrait: [1200, 1600] };
const only = process.argv.slice(2);
const frames = 18;

// Run `npm run build:fast` first: captures use the built page, not the dev server.
const server = await serveDist(4322);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const [orientation, [w, h]] of Object.entries(SIZES)) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:4322/lab/altitude/?capture=1&q=poster', { waitUntil: 'load' });
    // The dev server can reload the page once while it optimises dependencies; wait it out.
    for (let i = 0; i < 3; i++) {
      await page.waitForFunction(() => window.__altReady && window.__alt, null, { timeout: 300000 });
      await page.waitForTimeout(1500);
      if (await page.evaluate(() => !!window.__alt)) break;
    }
    for (const [shot, p] of Object.entries(SHOTS)) {
      if (only.length && !only.includes(shot)) continue;
      const t0 = Date.now();
      const png = await page.evaluate(
        ([p, f]) => {
          window.__alt.goto(p, f);
          return document.querySelector('[data-canvas]').toDataURL('image/png');
        },
        [p, frames],
      );
      const out = `src/assets/lab/altitude/${shot}-${orientation}.webp`;
      const info = await sharp(Buffer.from(png.split(',')[1], 'base64')).webp({ quality: 90, effort: 6 }).toFile(out);
      console.log(out, `${w}x${h}`, `${Math.round(info.size / 1024)} KB`, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
