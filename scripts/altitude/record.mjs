/**
 * A screen recording of the home descent: the real page in capture mode, stepped frame by frame
 * through the flight (software rendering is too slow to record in real time), encoded to WebM.
 *
 *   npm run build:fast && PLAYWRIGHT_BROWSERS_PATH=0 node scripts/altitude/record.mjs [--size=1280x720] [--part=descent|approach] [--q=high]
 *
 * descent: the flight, from the hero to the last drawing (30 s). approach: from the last drawing
 * on under the ground sections to the sunrise at contact and the touchdown (28 s).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { serveDist } from '../lab/serve.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
const [w, h] = arg('size', '1280x720').split('x').map(Number);
const part = arg('part', 'descent');
const tier = arg('q', 'high');
const FPS = 25;
// Seconds of video against flight progress. Descent: the hero, the proof, then a dwell on each
// drawing's hold (HOLDS in src/altitude/flights/home.ts). Approach: the turn off the last
// drawing, the glide under the sections, a slower flare into the sunrise, the touchdown
// (APPROACH in the same file).
const KEYS = {
  descent: [
    [0, 0], [2.5, 0.003], [6, 0.12], [8.5, 0.2], [10.5, 0.27], [13, 0.4], [14.5, 0.47], [17, 0.59],
    [18.5, 0.66], [21, 0.78], [22.5, 0.85], [25.5, 0.97], [27, 0.99], [30, 1],
  ],
  approach: [
    [0, 0.95], [2.5, 1], [6, 1.14], [12, 1.5], [17, 1.8], [18.5, 1.85], [23.5, 2], [26, 2.1], [28, 2.1],
  ],
}[part];
// The descent eases in and out of every key (a dwell on each hold); the approach keeps moving
// through its keys on a monotone curve, slowing only where the keys are further apart in time.
const dwell = (t) => {
  for (let i = 1; i < KEYS.length; i++) {
    const [t1, p1] = KEYS[i];
    const [t0, p0] = KEYS[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return p0 + (p1 - p0) * (k * k * (3 - 2 * k));
    }
  }
  return KEYS.at(-1)[1];
};
const glide = (t) => {
  const n = KEYS.length;
  if (t <= KEYS[0][0]) return KEYS[0][1];
  if (t >= KEYS[n - 1][0]) return KEYS[n - 1][1];
  let i = 0;
  while (t > KEYS[i + 1][0]) i++;
  const slope = (k) => (KEYS[k + 1][1] - KEYS[k][1]) / (KEYS[k + 1][0] - KEYS[k][0]);
  const tangent = (k) => {
    if (k === 0) return slope(0);
    if (k === n - 1) return slope(n - 2);
    const a = slope(k - 1);
    const b = slope(k);
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  };
  const [t0, p0] = KEYS[i];
  const [t1, p1] = KEYS[i + 1];
  const hh = t1 - t0;
  const u = (t - t0) / hh;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * hh * tangent(i) + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * hh * tangent(i + 1);
};
const at = part === 'approach' ? glide : dwell;
const OUT = arg('out', '.screenshots/web-06');
await mkdir(OUT, { recursive: true });
const file = `${OUT}/home-${part}-${w}x${h}.webm`;
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
  await page.goto(`http://127.0.0.1:4322/?capture=1&q=${tier}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__altReady, null, { timeout: 300000 });
  const total = Math.round(KEYS.at(-1)[0] * FPS);
  // Past the canvas's fade-in, then warm the temporal history at the first frame so the opening is converged.
  await page.waitForTimeout(1200);
  await page.evaluate((p) => window.__alt.goto(p, 8, 0), KEYS[0][1]);
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
