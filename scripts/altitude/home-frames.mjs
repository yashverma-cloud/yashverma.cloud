/**
 * Frames of the home descent at chosen points of the flight, from the built page in capture
 * mode, tiled into one sheet: the check that the camera, the clouds, the drawings and the copy
 * line up along the whole descent.
 *
 *   npm run build:fast && PLAYWRIGHT_BROWSERS_PATH=0 node scripts/altitude/home-frames.mjs [--size=1440x900] [--at=0,0.1,...] [--frames=6] [--out=name]
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { serveDist } from '../lab/serve.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
const [w, h] = arg('size', '1440x900').split('x').map(Number);
const at = arg('at', '0,0.08,0.17,0.24,0.3,0.36,0.5,0.56,0.7,0.76,0.9,0.97').split(',').map(Number);
const frames = Number(arg('frames', '6'));
const name = arg('out', `home-${w}x${h}`);
const OUT = '.screenshots/web-06/home';
await mkdir(OUT, { recursive: true });
const server = await serveDist(4331);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const phone = w < 600;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
  await page.goto(`http://127.0.0.1:4331/?capture=1&q=${phone ? 'mid' : 'high'}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__altReady, null, { timeout: 300000 });
  const tiles = [];
  for (const p of at) {
    await page.evaluate(([p, f]) => {
      window.__alt.goto(p, f);
      const gl = window.__alt.engine.renderer.getContext();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    }, [p, frames]);
    await page.waitForTimeout(120);
    const file = `${OUT}/${name}-p${p}.png`;
    await page.screenshot({ path: file, timeout: 120000 });
    tiles.push(file);
    console.log(file);
  }
  const scaled = await Promise.all(tiles.map((t) => sharp(t).resize({ width: phone ? 300 : 720 }).png().toBuffer()));
  const m = await sharp(scaled[0]).metadata();
  const cols = phone ? 6 : 3;
  const rows = Math.ceil(scaled.length / cols);
  await sharp({ create: { width: cols * m.width + (cols - 1) * 6, height: rows * m.height + (rows - 1) * 6, channels: 3, background: '#000' } })
    .composite(scaled.map((t, i) => ({ input: t, left: (i % cols) * (m.width + 6), top: Math.floor(i / cols) * (m.height + 6) })))
    .png()
    .toFile(`${OUT}/${name}-sheet.png`);
} finally {
  await browser.close();
  server.close();
}
