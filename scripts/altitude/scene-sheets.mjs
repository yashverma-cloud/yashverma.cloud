/**
 * Contact sheets of each case-study scene at four moments of its drawing, from the built
 * /work/<slug>/ pages in capture mode: the check that every drawing reads, beat by beat.
 *
 *   npm run build:fast && PLAYWRIGHT_BROWSERS_PATH=0 node scripts/altitude/scene-sheets.mjs [slug ...] [--size=1440x900]
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { serveDist } from '../lab/serve.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
const [w, h] = arg('size', '1440x900').split('x').map(Number);
const all = ['cloud-cost-optimisation', 'live-migration-to-kubernetes', 'alert-payload-reduction', 'karpenter-autoscaling', 'jarvis-slack-ops', 'sendmail-ses-cli'];
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const OUT = '.screenshots/web-06/scenes';
await mkdir(OUT, { recursive: true });
const server = await serveDist(4330);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const slug of only.length ? only : all) {
    const phone = w < 600;
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone });
    page.on('pageerror', (e) => console.error(slug, 'page error:', e.message));
    await page.goto(`http://127.0.0.1:4330/work/${slug}/?capture=1&q=high`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__altReady, null, { timeout: 120000 });
    const d = await page.evaluate(() => window.__alt.duration);
    const tiles = [];
    for (const f of [0.3, 0.55, 0.8, 1]) {
      await page.evaluate(([f, d]) => {
        window.__alt.goto(Math.min(1, f * 1.1), f * d, 3);
        const gl = window.__alt.engine.renderer.getContext();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      }, [f, d]);
      await page.waitForTimeout(80);
      tiles.push(await page.screenshot());
    }
    const scaled = await Promise.all(tiles.map((t) => sharp(t).resize({ width: phone ? 390 : 960 }).png().toBuffer()));
    const m = await sharp(scaled[0]).metadata();
    const cols = phone ? 4 : 2;
    const rows = Math.ceil(scaled.length / cols);
    await sharp({ create: { width: cols * m.width + (cols - 1) * 6, height: rows * m.height + (rows - 1) * 6, channels: 3, background: '#000' } })
      .composite(scaled.map((t, i) => ({ input: t, left: (i % cols) * (m.width + 6), top: Math.floor(i / cols) * (m.height + 6) })))
      .png()
      .toFile(`${OUT}/${slug}-${w}x${h}.png`);
    console.log(`${OUT}/${slug}-${w}x${h}.png`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
