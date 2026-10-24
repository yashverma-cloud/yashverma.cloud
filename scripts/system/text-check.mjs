/**
 * Reads every built page's text the way a crawler or a screen reader's text extraction does
 * (textContent, scripts off) and flags words glued across element boundaries: "Operationsat",
 * "40%cut". Astro's compressHTML drops whitespace between tags when it holds a line break, so two
 * elements written on separate lines touch in the output; such places need an explicit {' '}.
 *
 *   npm run build:fast && PLAYWRIGHT_BROWSERS_PATH=0 node scripts/system/text-check.mjs [--write]
 *
 * --write also saves each page's extracted text under .screenshots/text/. Exits 1 on any glue.
 */
import { chromium } from 'playwright';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { serveDist } from '../lab/serve.mjs';

const write = process.argv.includes('--write');
const pages = (await readdir('dist', { recursive: true }))
  .filter((f) => f.endsWith('.html') && !f.startsWith('lab/'))
  .map((f) => '/' + f.replace(/index\.html$/, ''));

const server = await serveDist(4322);
const browser = await chromium.launch();
const context = await browser.newContext({ javaScriptEnabled: false });
let glued = 0;
try {
  if (write) await mkdir('.screenshots/text', { recursive: true });
  for (const path of pages.sort()) {
    const page = await context.newPage();
    // Redirect stubs (the short links) refresh away at once: read them without their refresh.
    await page.route(`http://127.0.0.1:4322${path}`, async (route) => {
      const res = await route.fetch();
      const body = (await res.text()).replace(/<meta http-equiv="refresh"[^>]*>/, '');
      await route.fulfill({ response: res, body, headers: { ...res.headers(), 'content-encoding': '' } });
    });
    await page.goto(`http://127.0.0.1:4322${path}`);
    const { hits, text } = await page.evaluate(() => {
      // A plain walk: with scripts off, the page will not call a TreeWalker filter back.
      const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
      const nodes = [];
      const walk = (el) => {
        for (const n of el.childNodes) {
          if (n.nodeType === 3 && n.data.length) nodes.push(n);
          else if (n.nodeType === 1 && !skip.has(n.tagName)) walk(n);
        }
      };
      walk(document.body);
      const hits = [];
      // A boundary is glued when the left text ends in a non-space that does not open
      // something, and the right text starts with a letter or a digit.
      for (let i = 1; i < nodes.length; i++) {
        const a = nodes[i - 1].data;
        const b = nodes[i].data;
        if (/\s$/.test(a) || /^\s/.test(b)) continue;
        if (!/[^\s([{‘“'"/–—-]$/u.test(a) || !/^[\p{L}\p{N}]/u.test(b)) continue;
        const tag = (n) => n.parentElement.tagName.toLowerCase() + (n.parentElement.className ? '.' + String(n.parentElement.className).split(' ')[0] : '');
        // B: a block box starts or ends between the two (whitespace there never renders);
        // I: they share a line box, so a space would show and has to be written in the source.
        const block = (n) => {
          for (let e = n.parentElement; e; e = e.parentElement) if (!/^inline|contents/.test(getComputedStyle(e).display)) return e;
          return null;
        };
        const kind = block(nodes[i - 1]) === block(nodes[i]) ? 'I' : 'B';
        hits.push(`${kind} ${a.slice(-28).trimStart()}|${b.slice(0, 28).trimEnd()}   (${tag(nodes[i - 1])} | ${tag(nodes[i])})`);
      }
      return { hits, text: document.body.textContent.replace(/\s+/g, ' ').trim() };
    });
    await page.close();
    if (hits.length) {
      glued += hits.length;
      console.log(`${path}`);
      for (const h of hits) console.log(`  ${h}`);
    }
    if (write) await writeFile(`.screenshots/text/${path.replace(/\//g, '_') || '_'}.txt`, text + '\n');
  }
} finally {
  await browser.close();
  server.close();
}
console.log(glued ? `${glued} glued boundaries on ${pages.length} pages` : `no glued words on ${pages.length} pages`);
process.exit(glued ? 1 : 0);
