/**
 * Renders the site's stills from the live scenes, for still mode (reduced motion, no WebGL,
 * Save-Data, JS off), the loading frame and the Open Graph cards. Writes
 * src/assets/scenes/<name>-{landscape,portrait}.webp; Astro makes the AVIF and WebP sizes.
 *
 *   <slug>          each case study's drawing, finished, as its /work/ page frames it
 *   home-hero, home-between, home-<slug>
 *                   the home descent's plates (the four featured drawings at the end of their hold)
 *   horizon         ground level at sunrise, the sun disc up (contact)
 *   in-cloud        inside the deck (the 404)
 *
 *   npm run build:fast && PLAYWRIGHT_BROWSERS_PATH=0 node scripts/altitude/posters.mjs [name ...]
 *
 * Shots are taken at half size with deviceScaleFactor 2, so the labels keep their real size.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { serveDist } from '../lab/serve.mjs';

const SIZES = { landscape: [1280, 610], portrait: [600, 800] };
const OUT = 'src/assets/scenes';
const WORK = [
  'cloud-cost-optimisation',
  'live-migration-to-kubernetes',
  'alert-payload-reduction',
  'karpenter-autoscaling',
  'jarvis-slack-ops',
  'sendmail-ses-cli',
];
// Flight progress for the home plates: HOLDS in src/altitude/flights/home.ts, just before each leave.
const HOME = {
  'home-hero': 0,
  'home-between': 0.16,
  'home-cloud-cost-optimisation': 0.39,
  'home-live-migration-to-kubernetes': 0.58,
  'home-alert-payload-reduction': 0.77,
  'home-karpenter-autoscaling': 0.96,
};
// Cameras off the flight, set on the home director for one shot each. The sun's azimuth is 38°
// (world.ts); the horizon looks a little left of it so the disc stands right of the copy.
const OFF_FLIGHT = {
  horizon: { pos: [-900, 28, 1400], yaw: 26, pitch: 2.2, dawn: 1 },
  'in-cloud': { pos: [-5200, 1160, 6400], yaw: -8, pitch: -1, dawn: 0.6 },
};

const only = process.argv.slice(2);
const want = (name) => !only.length || only.includes(name);
// Everything but the scene is hidden: the stills carry no copy, the page lays its own over them.
const BARE = (stage, labels) => `
  body * { visibility: hidden !important; }
  ${stage} canvas${labels ? `, ${stage} [data-labels], ${stage} [data-labels] *, ${stage} [data-leaders], ${stage} [data-leaders] *` : ''} { visibility: visible !important; }
  ${stage} .stage-poster { visibility: hidden !important; }`;

/** One style element per page, replaced for each shot. */
const bare = (page, css) =>
  page.evaluate((css) => {
    let el = document.getElementById('bare');
    if (!el) {
      el = document.createElement('style');
      el.id = 'bare';
      document.head.append(el);
    }
    el.textContent = css;
  }, css);

async function save(page, name, orientation) {
  const out = `${OUT}/${name}-${orientation}.webp`;
  const png = await page.screenshot({ timeout: 180000 });
  const info = await sharp(png).webp({ quality: 90, effort: 6 }).toFile(out);
  console.log(out, `${info.width}x${info.height}`, `${Math.round(info.size / 1024)} KB`);
}

async function open(browser, orientation, path) {
  const [w, h] = SIZES[orientation];
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, bypassCSP: true });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`http://127.0.0.1:4335${path}?capture=1&q=poster&dpr=2`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__altReady && window.__alt, null, { timeout: 300000 });
  return page;
}

await mkdir(OUT, { recursive: true });
const server = await serveDist(4335);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const orientation of Object.keys(SIZES).filter((o) => !process.env.ONLY_ORIENTATION || o === process.env.ONLY_ORIENTATION)) {
    for (const slug of WORK.filter(want)) {
      const page = await open(browser, orientation, `/work/${slug}/`);
      await bare(page, BARE('[data-work-stage]', true));
      await page.evaluate((f) => {
        window.__alt.goto(1, window.__alt.duration, f);
        // Read a pixel back, so the frame is finished before the screenshot.
        const gl = window.__alt.engine.renderer.getContext();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      }, 12);
      await page.waitForTimeout(200);
      await save(page, slug, orientation);
      await page.close();
    }

    const home = [...Object.keys(HOME), ...Object.keys(OFF_FLIGHT)].filter(want);
    if (!home.length) continue;
    const page = await open(browser, orientation, '/');
    for (const name of home) {
      const cam = OFF_FLIGHT[name];
      await bare(page, BARE('.stage', !cam && name !== 'home-hero'));
      await page.evaluate(
        ([p, cam, f]) => {
          const d = window.__alt.engine.director;
          d.__camera ??= d.camera;
          d.camera = cam ? () => cam : d.__camera;
          window.__alt.goto(p, f);
          const gl = window.__alt.engine.renderer.getContext();
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
        },
        [cam ? 1 : HOME[name], cam ?? null, 18],
      );
      await page.waitForTimeout(200);
      await save(page, name, orientation);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
