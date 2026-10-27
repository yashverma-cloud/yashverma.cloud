/**
 * A case study read top to bottom, as frames with the copy over them: the opening, the hand-over
 * to the reading view, and each section at the middle of its stretch, from the built page in
 * capture mode (the scene is rendered for each frame, since software rendering is too slow to
 * scroll in real time). Writes a contact sheet per page and size.
 *
 *   npm run build:fast && PLAYWRIGHT_BROWSERS_PATH=0 node scripts/altitude/reading-frames.mjs [slug ...] [--size=1440x900] [--mode=live|still] [--out=dir]
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { serveDist } from '../lab/serve.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
const [w, h] = arg('size', '1440x900').split('x').map(Number);
const mode = arg('mode', 'live');
const OUT = arg('out', '.screenshots/web-06-final2/reading');
const all = ['cloud-cost-optimisation', 'live-migration-to-kubernetes', 'alert-payload-reduction', 'karpenter-autoscaling', 'jarvis-slack-ops', 'sendmail-ses-cli'];
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const LINE = 0.55;

await mkdir(OUT, { recursive: true });
const server = await serveDist(4339);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const slug of only.length ? only : all) {
    const phone = w < 600;
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone });
    page.on('pageerror', (e) => console.error(slug, 'page error:', e.message));
    const query = mode === 'still' ? '?mode=still' : '?capture=1&q=high';
    await page.goto(`http://127.0.0.1:4339/work/${slug}/${query}`, { waitUntil: 'load' });
    if (mode === 'live') await page.waitForFunction(() => window.__altReady, null, { timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);
    // Where each frame scrolls to, and (live) the moment of the drawing it shows.
    const shots = await page.evaluate(
      ([LINE, live]) => {
        const tops = [...document.querySelectorAll('[data-step]')].map((s) => s.getBoundingClientRect().top + scrollY);
        const end = document.querySelector('[data-step]:last-of-type')?.getBoundingClientRect().bottom + scrollY;
        const H = innerHeight;
        const out = [{ y: 0, k: -1, u: 0, label: 'opening' }];
        out.push({ y: Math.max(0, tops[0] - H * LINE - H * 0.35), k: -1, u: 0.6, label: 'hand-over' });
        tops.forEach((top, k) => {
          const bottom = k < tops.length - 1 ? tops[k + 1] : end;
          for (const u of [0.15, 0.6]) out.push({ y: top + (bottom - top) * u - H * LINE, k, u, label: `${['problem', 'approach', 'result'][k]} ${u}` });
        });
        const next = document.querySelector('[data-next]');
        if (next) out.push({ y: next.getBoundingClientRect().top + scrollY - H * 0.3, k: 3, u: 0, label: 'next' });
        return out;
      },
      [LINE, mode === 'live'],
    );
    const tiles = [];
    for (const s of shots) {
      await page.evaluate((y) => window.scrollTo(0, y), s.y);
      await page.waitForTimeout(250);
      // Live: the scene where the page itself would have it at this scroll position, the opening's play done.
      if (mode === 'live')
        Object.assign(
          s,
          await page.evaluate(() => {
            const w = window.__alt.want(1e9);
            window.__alt.goto(w.p, w.t, 3);
            const gl = window.__alt.engine.renderer.getContext();
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
            return { p: w.p, t: w.t };
          }),
        );
      else await page.waitForTimeout(600);
      const shot = await page.screenshot();
      const label = Buffer.from(`<svg width="${w * (phone ? 2 : 1)}" height="40"><rect width="100%" height="40" fill="#000"/><text x="10" y="28" font-family="monospace" font-size="24" fill="#fff">${slug} · ${s.label}${s.t !== undefined ? ` · t ${s.t.toFixed(2)}` : ''}</text></svg>`);
      tiles.push(await sharp(shot).composite([{ input: label, top: 0, left: 0 }]).png().toBuffer());
    }
    const width = phone ? 300 : 720;
    const scaled = await Promise.all(tiles.map((t) => sharp(t).resize({ width }).png().toBuffer()));
    const m = await sharp(scaled[0]).metadata();
    const cols = phone ? 5 : 3;
    const rows = Math.ceil(scaled.length / cols);
    const file = `${OUT}/${slug}-${mode}-${w}x${h}.png`;
    await sharp({ create: { width: cols * m.width + (cols - 1) * 6, height: rows * m.height + (rows - 1) * 6, channels: 3, background: '#000' } })
      .composite(scaled.map((t, i) => ({ input: t, left: (i % cols) * (m.width + 6), top: Math.floor(i / cols) * (m.height + 6) })))
      .png()
      .toFile(file);
    console.log(file);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
