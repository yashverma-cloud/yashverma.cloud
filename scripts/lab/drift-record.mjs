/**
 * Records a slow camera move over the case-study drawing, for checking that the linework holds
 * still: the camera dollies a little along the flight and turns slowly, with the drawing's clock
 * frozen at --t. Writes the full frame and a 3x nearest-neighbour zoom of the middle of the
 * drawing, where any shimmer is easy to see.
 *
 *   npm run build:fast && PLAYWRIGHT_BROWSERS_PATH=0 node scripts/lab/drift-record.mjs \
 *     [--size=1440x900] [--phone] [--from=0.795] [--to=0.805] [--seconds=6] [--t=5] [--label=after] \
 *     [--dist=dist] [--port=4322]
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { serveDist } from './serve.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
const phone = process.argv.includes('--phone');
const [w, h] = arg('size', phone ? '390x844' : '1440x900').split('x').map(Number);
const from = Number(arg('from', '0.795'));
const to = Number(arg('to', '0.805'));
const seconds = Number(arg('seconds', '6'));
const sceneT = Number(arg('t', '5'));
const label = arg('label', 'after');
const port = Number(arg('port', '4322'));
const dist = arg('dist', 'dist');
const FPS = 25;
// Phones run the mid tier at a 1.5 pixel ratio; recording at that ratio keeps one screenshot
// pixel per drawing-buffer pixel.
const dsf = phone ? 1.5 : 1;
const OUT = '.screenshots/web-05/drift';
await mkdir(OUT, { recursive: true });
const name = `${OUT}/${label}-${phone ? 'phone' : `${w}x${h}`}`;

const FFMPEG = 'node_modules/playwright-core/.local-browsers/ffmpeg-1011/ffmpeg-linux';
function encoder(file) {
  const p = spawn(FFMPEG, [
    '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-c:v', 'vp8', '-b:v', '8M', '-qmin', '0', '-qmax', '30', '-crf', '4', '-deadline', 'good', '-cpu-used', '2', file,
  ]);
  p.stderr.on('data', (d) => process.stderr.write(d));
  const done = new Promise((ok, bad) => p.on('close', (code) => (code ? bad(new Error(`ffmpeg ${code}`)) : ok())));
  return {
    async write(buf) {
      if (!p.stdin.write(buf)) await new Promise((ok) => p.stdin.once('drain', ok));
    },
    async end() {
      p.stdin.end();
      await done;
    },
  };
}

const server = await serveDist(port, resolve(dist));
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const full = encoder(`${name}.webm`);
const zoom = encoder(`${name}-zoom3x.webm`);
try {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, isMobile: phone, hasTouch: phone });
  page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
  await page.goto(`http://127.0.0.1:${port}/lab/altitude/?capture=1&q=${phone ? 'mid' : 'high'}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__altReady, null, { timeout: 300000 });
  const total = Math.round(seconds * FPS);
  const step = async (f, frames) => {
    const k = f / total;
    // An eased dolly along the flight and a slow turn, about a fifth of a pixel per frame.
    const p = from + (to - from) * (k * k * (3 - 2 * k));
    await page.evaluate(
      ([p, t, k, time, frames]) => {
        const e = window.__alt.engine;
        e.drift.yaw = Math.sin(k * Math.PI) * 0.35;
        e.drift.pitch = Math.sin(k * Math.PI * 0.5) * 0.12;
        e.renderAt(p, t, frames, time);
        const gl = e.renderer.getContext();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      },
      [p, sceneT, k, f / FPS, frames],
    );
  };
  // Warm the cloud history so the first frame is converged.
  await step(0, 8);
  const t0 = Date.now();
  const crop = { left: Math.round(w * dsf * 0.33), top: Math.round(h * dsf * 0.4), width: Math.round(w * dsf * 0.33), height: Math.round(h * dsf * 0.33) };
  for (let f = 0; f <= total; f++) {
    if (f) await step(f, 1);
    const png = await page.screenshot({ type: 'png' });
    // Playwright's ffmpeg reads JPEG only; full chroma keeps one-pixel lines intact.
    const jpeg = (img) => img.jpeg({ quality: 96, chromaSubsampling: '4:4:4' }).toBuffer();
    await full.write(await jpeg(sharp(png)));
    await zoom.write(await jpeg(sharp(png).extract(crop).resize({ width: crop.width * 3, kernel: 'nearest' })));
    if (f % 25 === 0) console.log(`frame ${f}/${total}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
} finally {
  await Promise.allSettled([full.end(), zoom.end()]);
  await browser.close();
  server.close();
}
console.log(`${name}.webm`, `${name}-zoom3x.webm`);
