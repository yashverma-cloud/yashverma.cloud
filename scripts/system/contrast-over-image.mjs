/**
 * WCAG contrast of text set over imagery (posters, the live scene), which the token check
 * cannot see: for every text element in the given selectors, the page is shot with all text
 * hidden, and the element's colour is compared against the brightest and the median pixel
 * behind its box.
 *
 *   npm run build:fast && PLAYWRIGHT_BROWSERS_PATH=0 node scripts/system/contrast-over-image.mjs <path> <selector>[,<selector>...] [--sizes=1440x900,390x844] [--scroll=<y>]
 *
 * Reports the worst pixel (strict) and the median (typical); AA is 4.5 for body text and 3 for
 * large text (24 px, or 18.66 px bold). Exits 1 if any median falls under its minimum.
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import { serveDist } from '../lab/serve.mjs';

const [path, selectors] = process.argv.slice(2);
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
const sizes = arg('sizes', '1440x900,390x844').split(',').map((s) => s.split('x').map(Number));
const scrollY = Number(arg('scroll', '0'));

const lum = ([r, g, b]) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const server = await serveDist(4325);
const browser = await chromium.launch();
let failed = 0;
try {
  for (const [w, h] of sizes) {
    const phone = w < 600;
    // The page's CSP forbids injected styles; this test context may add one.
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone, bypassCSP: true });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:4325${path}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    if (scrollY) await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await page.waitForTimeout(400);
    const items = await page.evaluate((sel) => {
      const out = [];
      for (const s of sel.split(',')) {
        for (const el of document.querySelectorAll(s)) {
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
          const cs = getComputedStyle(el);
          const m = cs.color.match(/\d+(\.\d+)?/g).map(Number);
          const size = parseFloat(cs.fontSize);
          const bold = Number(cs.fontWeight) >= 700;
          out.push({ sel: s, text: el.textContent.trim().slice(0, 40), x: r.x, y: r.y, w: r.width, h: r.height, color: m.slice(0, 3), large: size >= 24 || (bold && size >= 18.66) });
        }
      }
      return out;
    }, selectors);
    // Everything that carries text goes transparent; the imagery stays.
    await page.addStyleTag({ content: '*{color:transparent!important;text-shadow:none!important;-webkit-text-stroke:0!important} svg text{fill:transparent!important}' });
    await page.waitForTimeout(100);
    const shot = await page.screenshot();
    const img = sharp(shot);
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    for (const it of items) {
      const lums = [];
      const x0 = Math.max(0, Math.floor(it.x));
      const y0 = Math.max(0, Math.floor(it.y));
      const x1 = Math.min(info.width, Math.ceil(it.x + it.w));
      const y1 = Math.min(info.height, Math.ceil(it.y + it.h));
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * info.width + x) * info.channels;
          lums.push(lum([data[i], data[i + 1], data[i + 2]]));
        }
      }
      if (!lums.length) continue;
      lums.sort((a, b) => a - b);
      const fg = lum(it.color);
      const worst = ratio(fg, lums[lums.length - 1]);
      const median = ratio(fg, lums[Math.floor(lums.length / 2)]);
      const min = it.large ? 3 : 4.5;
      const ok = median >= min;
      if (!ok) failed++;
      console.log(`${w}x${h}  ${ok ? 'ok  ' : 'FAIL'}  median ${median.toFixed(1)}  worst ${worst.toFixed(1)}  (min ${min})  ${it.sel}  "${it.text}"`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
