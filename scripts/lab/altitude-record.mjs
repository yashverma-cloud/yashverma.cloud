/**
 * A screen recording of the Altitude prototype: the real page, stepped frame by frame through
 * the flight (software rendering is too slow to record in real time), encoded to WebM.
 *
 *   npm run build:fast && PLAYWRIGHT_BROWSERS_PATH=0 node scripts/lab/altitude-record.mjs [--method=raymarch] [--size=1280x720]
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { serveDist } from './serve.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
const method = arg('method', 'raymarch');
const [w, h] = arg('size', '1280x720').split('x').map(Number);
const FPS = 25;
// Seconds of video against flight progress: dwell on the hero, the proof and each beat.
const KEYS = [
  [0, 0], [2.2, 0.003], [6, 0.12], [9, 0.3], [11.5, 0.42], [13.5, 0.47], [15.5, 0.58],
  [18.5, 0.72], [20, 0.775], [23, 0.835], [24.5, 0.85], [27.5, 0.93], [29.5, 0.965], [31, 1],
];
const at = (t) => {
  for (let i = 1; i < KEYS.length; i++) {
    const [t1, p1] = KEYS[i];
    const [t0, p0] = KEYS[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return p0 + (p1 - p0) * (k * k * (3 - 2 * k));
    }
  }
  return 1;
};
const OUT = '.screenshots/web-04';
await mkdir(OUT, { recursive: true });
const file = `${OUT}/altitude-${method}-${w}x${h}.webm`;
const ffmpeg = spawn('node_modules/playwright-core/.local-browsers/ffmpeg-1011/ffmpeg-linux', [
  '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
  '-c:v', 'vp8', '-b:v', '5M', '-qmin', '0', '-qmax', '40', '-crf', '8', '-deadline', 'good', '-cpu-used', '2', file,
]);
// Fail loudly if the encoder dies, instead of waiting forever for its pipe to drain.
let ffmpegDone = false;
ffmpeg.stderr.on('data', (d) => process.stderr.write(d));
ffmpeg.on('close', (code) => {
  ffmpegDone = true;
  if (code) {
    console.error(`ffmpeg exited with ${code}`);
    process.exit(1);
  }
});
const server = await serveDist(4322);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`http://127.0.0.1:4322/lab/altitude/?capture=1&q=high&clouds=${method}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__altReady, null, { timeout: 300000 });
  const total = Math.round(KEYS.at(-1)[0] * FPS);
  // Warm the temporal history at the first frame so the opening is converged.
  await page.evaluate(() => window.__alt.goto(0, 8, 0));
  const t0 = Date.now();
  for (let f = 0; f <= total; f++) {
    const t = f / FPS;
    await page.evaluate(([p, t]) => window.__alt.goto(p, 1, t), [at(t), t]);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ffmpeg.stdin.write(jpg)) await new Promise((ok) => ffmpeg.stdin.once('drain', ok));
    if (f % 25 === 0) console.log(`frame ${f}/${total}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
} finally {
  ffmpeg.stdin.end();
  if (!ffmpegDone) await new Promise((ok) => ffmpeg.on('close', ok));
  await browser.close();
  server.close();
}
console.log(file);
