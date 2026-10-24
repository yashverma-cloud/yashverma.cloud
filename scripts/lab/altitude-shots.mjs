/**
 * Screenshots of the Altitude prototype at review widths, from the built site.
 *
 *   npm run build:fast && PLAYWRIGHT_BROWSERS_PATH=0 node scripts/lab/altitude-shots.mjs [--sizes=1440x900,390x844]
 *
 * Writes .screenshots/web-04/shots/<method>-<w>x<h>-<frame>.png, then one contact sheet per size.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { serveDist } from './serve.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
const method = arg('method', 'raymarch');
const sizes = arg('sizes', '1280x720,1440x900,1920x1080,2560x1440,390x844').split(',').map((s) => s.split('x').map(Number));
const ALL = { hero: 0, descent: 0.2, between: 0.44, close: 0.82, wide: 0.95 };
const pick = arg('frames', '');
const FRAMES = pick ? Object.fromEntries(Object.entries(ALL).filter(([k]) => pick.split(',').includes(k))) : ALL;
const OUT = '.screenshots/web-04/shots';
await mkdir(OUT, { recursive: true });

const server = await serveDist(4322);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const [w, h] of sizes) {
    const phone = w < 600;
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone });
    await page.goto(`http://127.0.0.1:4322/lab/altitude/?capture=1&q=high`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__altReady, null, { timeout: 300000 });
    const files = [];
    for (const [name, p] of Object.entries(FRAMES)) {
      await page.evaluate(([p]) => {
        window.__alt.goto(p, 6);
        // Wait for the GPU to finish the queued frames, or the screenshot waits on them.
        const gl = window.__alt.engine.renderer.getContext();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      }, [p]);
      await page.waitForTimeout(60);
      const file = `${OUT}/${method}-${w}x${h}-${name}.png`;
      await page.screenshot({ path: file, timeout: 180000 });
      files.push(file);
      console.log(file);
    }
    // One sheet per size, scaled to 1600 wide per tile row.
    const all = Object.keys(ALL).map((n) => `${OUT}/${method}-${w}x${h}-${n}.png`);
    const tiles = await Promise.all(all.map((f) => sharp(f).resize({ width: phone ? 360 : 960 }).png().toBuffer()));
    const meta = await sharp(tiles[0]).metadata();
    const cols = phone ? 5 : 2;
    const rows = Math.ceil(tiles.length / cols);
    await sharp({ create: { width: cols * meta.width + (cols - 1) * 6, height: rows * meta.height + (rows - 1) * 6, channels: 3, background: '#000' } })
      .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * (meta.width + 6), top: Math.floor(i / cols) * (meta.height + 6) })))
      .png()
      .toFile(`${OUT}/${method}-${w}x${h}-sheet.png`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
