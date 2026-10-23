/**
 * Renders the brand kit to brand/export/ (not deployed, not committed).
 *
 *   npm run build                # once: writes dist/og/cluster.svg, which the covers use
 *   npm run brand                # every cover and every card in cards.json
 *   npm run brand -- --guides    # the same with safe-zone overlays, into export/guides/
 *   npm run brand -- --serve     # serve the templates on :4400 to edit them in a browser
 *
 * Templates load the site's own tokens.css and font files, so a re-render after a token
 * change is all it takes to keep every image in step with the site.
 */
import { createServer } from 'node:http';
import { access, mkdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'brand', 'export');
const args = new Set(process.argv.slice(2));
const guides = args.has('--guides');
const serveOnly = args.has('--serve');

/** Sizes checked against each platform's help pages in Sep 2026; see brand/README.md. */
const COVERS = [
  { name: 'linkedin-profile-1584x396', page: 'covers/linkedin-profile.html', w: 1584, h: 396 },
  { name: 'facebook-page-1640x924', page: 'covers/facebook-page.html', w: 1640, h: 924 },
  { name: 'x-header-1500x500', page: 'covers/x-header.html', w: 1500, h: 500 },
];
const CARD = { w: 1080, h: 1350, templates: ['diagram', 'insight', 'snippet'] };

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

// Over http rather than file://, because Chromium will not load web fonts into a page
// opened from disk. Bound to loopback, and confined to the repository.
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
  const file = join(ROOT, path);
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});

try {
  await access(join(ROOT, 'dist', 'og', 'cluster.svg'));
} catch {
  console.error('dist/og/cluster.svg is missing. Run `npm run build` first.');
  process.exit(1);
}

await new Promise((done) => server.listen(serveOnly ? 4400 : 0, '127.0.0.1', done));
const address = server.address();
const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

const cards = JSON.parse(await readFile(join(ROOT, 'brand', 'cards.json'), 'utf8'));
const jobs = [
  ...COVERS.map((c) => ({ name: c.name, url: `/brand/${c.page}`, w: c.w, h: c.h })),
  ...cards.map((card) => {
    if (!CARD.templates.includes(card.template)) {
      throw new Error(`cards.json: "${card.id}" has unknown template "${card.template}"`);
    }
    return {
      name: `card-${card.id}`,
      url: `/brand/cards/${card.template}.html?card=${encodeURIComponent(card.id)}`,
      w: CARD.w,
      h: CARD.h,
    };
  }),
];

if (serveOnly) {
  console.log('Serving the brand templates. Ctrl+C to stop.');
  for (const job of jobs) console.log(`  ${base}${job.url}`);
} else {
  const dir = guides ? join(OUT, 'guides') : OUT;
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const job of jobs) {
      const page = await browser.newPage({
        viewport: { width: job.w, height: job.h },
        deviceScaleFactor: 1,
      });
      const url = `${base}${job.url}${guides ? (job.url.includes('?') ? '&' : '?') + 'guides' : ''}`;
      await page.goto(url);
      await page.waitForFunction(() => document.documentElement.dataset.ready);
      const [ready, error] = await page.evaluate(() => [
        document.documentElement.dataset.ready,
        document.documentElement.dataset.error,
      ]);
      if (ready !== 'true') throw new Error(`${job.name}: ${error}`);
      const file = join(dir, `${job.name}.png`);
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: job.w, height: job.h } });
      await page.close();
      console.log(`  ${job.w}×${job.h}  ${file.slice(ROOT.length + 1)}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}
