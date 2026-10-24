/**
 * Renders the brand kit to brand/export/altitude/ (not deployed, not committed).
 *
 *   npm run build                 # once: the templates are pages in src/pages/lab/brand/
 *   npm run brand                 # avatar, covers and post templates from the built pages
 *   npm run brand -- --guides     # the same with safe-zone overlays, into export/altitude/guides/
 *
 * Templates load the site's own tokens and font files, so a re-render after a token change is
 * all it takes to keep every image in step with the site.
 */
import { access, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveDist } from '../scripts/lab/serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'brand', 'export', 'altitude');
const guides = process.argv.slice(2).includes('--guides');

/** Sizes checked against each platform's help pages in Sep 2026; see brand/README.md. */
const JOBS = [
  { name: 'avatar-1080', page: 'avatar', w: 1080, h: 1080 },
  { name: 'linkedin-profile-1584x396', page: 'linkedin-cover', w: 1584, h: 396 },
  { name: 'x-header-1500x500', page: 'x-header', w: 1500, h: 500 },
  { name: 'facebook-page-1640x924', page: 'facebook-cover', w: 1640, h: 924 },
  { name: 'post-diagram-1080x1350', page: 'post-diagram', w: 1080, h: 1350 },
  { name: 'post-insight-1080x1350', page: 'post-insight', w: 1080, h: 1350 },
  { name: 'post-snippet-1080x1350', page: 'post-snippet', w: 1080, h: 1350 },
];

try {
  await access(join(ROOT, 'dist', 'lab', 'brand', 'avatar', 'index.html'));
} catch {
  console.error('dist/lab/brand/ is missing. Run `npm run build` first.');
  process.exit(1);
}
const dir = guides ? join(OUT, 'guides') : OUT;
await mkdir(dir, { recursive: true });
const server = await serveDist(4401, join(ROOT, 'dist'));
const browser = await chromium.launch();
try {
  for (const job of JOBS) {
    const page = await browser.newPage({ viewport: { width: job.w, height: job.h }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:4401/lab/brand/${job.page}/`);
    if (guides) await page.evaluate(() => document.body.classList.add('guides'));
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    const file = join(dir, `${job.name}.png`);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: job.w, height: job.h } });
    await page.close();
    console.log(`  ${job.w}×${job.h}  ${file.slice(ROOT.length + 1)}`);
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(0);
