/**
 * Keyboard check: tabs through each page and reports every stop, with the focus ring the browser
 * actually drew (outline style and width). Fails on a stop with no visible ring.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=0 node scripts/system/focus.mjs <path>[,<path>...] [--tabs=30]
 */
import { chromium } from 'playwright';
import { serveDist } from '../lab/serve.mjs';

const [list] = process.argv.slice(2);
const tabs = Number((process.argv.find((a) => a.startsWith('--tabs=')) || '--tabs=30').split('=')[1]);
const server = await serveDist(4327);
const browser = await chromium.launch();
let bad = 0;
try {
  for (const path of list.split(',')) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`http://127.0.0.1:4327${path}`, { waitUntil: 'load' });
    const seen = new Set();
    for (let i = 0; i < tabs; i++) {
      await page.keyboard.press('Tab');
      const s = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return { id: `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`, style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), visible: r.width > 0 && r.height > 0 };
      });
      if (!s || seen.has(s.id)) continue;
      seen.add(s.id);
      const ok = s.style !== 'none' && s.width >= 2 && s.visible;
      if (!ok) bad++;
      console.log(`${path}  ${ok ? 'ok  ' : 'FAIL'}  ${s.style} ${s.width}px  ${s.id}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(bad ? 1 : 0);
