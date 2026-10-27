/**
 * A case study read top to bottom, as a screen recording: the page scrolled at an even pace from
 * the opening to the end. Live mode renders the scene in capture mode at each scroll position
 * (software rendering is too slow to scroll in real time), with the drawing's clock eased as the
 * live page eases it; still mode records the page as it is. Encodes WebM.
 *
 *   npm run build:fast && PLAYWRIGHT_BROWSERS_PATH=0 node scripts/altitude/read-record.mjs <slug> \
 *     [--size=1440x900] [--mode=live|still] [--seconds=22] [--dist=dist] [--label=after] [--out=dir]
 *
 * `--dist` records another build (an older one, for a before and after).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { serveDist } from '../lab/serve.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
const slug = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'karpenter-autoscaling';
const [w, h] = arg('size', '1440x900').split('x').map(Number);
const mode = arg('mode', 'live');
const seconds = Number(arg('seconds', '22'));
const label = arg('label', 'after');
const OUT = arg('out', '.screenshots/web-06-final2');
const FPS = 20;
const HOLD = { start: 1, end: 1.5 };

await mkdir(OUT, { recursive: true });
const server = await serveDist(4338, resolve(arg('dist', 'dist')));
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const file = `${OUT}/read-${slug}-${mode}-${w}x${h}-${label}.webm`;
try {
  const phone = w < 600;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`http://127.0.0.1:4338/work/${slug}/${mode === 'live' ? '?capture=1&q=high' : '?mode=still'}`, { waitUntil: 'load' });
  const live = mode === 'live' && (await page.waitForFunction(() => window.__altReady, null, { timeout: 120000 }).then(() => page.evaluate(() => typeof window.__alt.want === 'function')));
  await page.evaluate(() => document.fonts.ready);
  // Lazy images: bring them all in first, so the recording shows the page, not its loading.
  const max = await page.evaluate(async () => {
    const H = document.scrollingElement.scrollHeight;
    for (let y = 0; y < H; y += innerHeight / 2) {
      window.scrollTo(0, y);
      await new Promise((ok) => setTimeout(ok, 60));
    }
    window.scrollTo(0, 0);
    await Promise.all([...document.images].map((i) => (i.complete ? null : i.decode().catch(() => null))));
    return document.scrollingElement.scrollHeight - innerHeight;
  });
  const ffmpeg = spawn('node_modules/playwright-core/.local-browsers/ffmpeg-1011/ffmpeg-linux', [
    '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-c:v', 'vp8', '-b:v', '4M', '-qmin', '0', '-qmax', '40', '-crf', '10', '-deadline', 'good', '-cpu-used', '2', file,
  ]);
  const done = new Promise((ok) => ffmpeg.on('close', ok));
  const total = Math.round(seconds * FPS);
  let time = -1;
  for (let i = 0; i < total; i++) {
    const s = i / FPS;
    const k = Math.min(1, Math.max(0, (s - HOLD.start) / (seconds - HOLD.start - HOLD.end)));
    const y = Math.round(max * (k * k * (3 - 2 * k)));
    const shot = await page.evaluate(
      ([y, live, time, dt]) => {
        window.scrollTo(0, y);
        if (!live) return time;
        const a = window.__alt;
        const want = a.want(1e9);
        // The live page's easing of the drawing's clock (src/altitude/work.ts).
        let t = time < 0 ? want.t : time;
        const step = want.t - t;
        t += Math.sign(step) * Math.min(Math.abs(step), Math.max(Math.abs(step) * (1 - Math.exp(-dt * 5)), dt * 0.4), dt * 3);
        a.goto(want.p, t, 1);
        const gl = a.engine.renderer.getContext();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
        return t;
      },
      [y, live, time, 1 / FPS],
    );
    time = shot;
    const jpg = await page.screenshot({ type: 'jpeg', quality: 85 });
    if (!ffmpeg.stdin.write(jpg)) await new Promise((ok) => ffmpeg.stdin.once('drain', ok));
    if (i % 50 === 0) console.log(`${file}: frame ${i}/${total}`);
  }
  ffmpeg.stdin.end();
  await done;
  console.log(file);
} finally {
  await browser.close();
  server.close();
}
