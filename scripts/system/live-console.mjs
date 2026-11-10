// Loads live pages and fails on any console error or page error, except the CSP block of the
// inline script Cloudflare injects for bot detection (the site's CSP is meant to block it).
// Usage: node scripts/system/live-console.mjs <url>...   (CHROME_CHANNEL=chrome uses system Chrome)
import { chromium } from 'playwright';

const urls = process.argv.slice(2);
if (!urls.length) {
  console.error('usage: live-console.mjs <url>...');
  process.exit(2);
}

const browser = await chromium.launch(
  process.env.CHROME_CHANNEL ? { channel: process.env.CHROME_CHANNEL } : {},
);
let failed = 0;
for (const url of urls) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  const res = await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(5000);
  // Hash every inline script and compare with the hashes the CSP allows. A blocked inline script
  // is expected only when it is Cloudflare's (it loads /cdn-cgi/challenge-platform/); any other
  // unhashed inline script is the site's own and fails the check.
  const inline = await page.evaluate(async () => {
    const csp = document.querySelector('meta[http-equiv="content-security-policy" i]')?.content ?? '';
    const allowed = new Set([...csp.matchAll(/'sha256-([^']+)'/g)].map((m) => m[1]));
    const out = { cloudflare: 0, own: 0 };
    for (const s of document.querySelectorAll('script:not([src])')) {
      if (s.type && !/javascript|module/.test(s.type)) continue; // JSON-LD and other data blocks
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s.textContent));
      const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
      if (allowed.has(hash)) continue;
      if (s.textContent.includes('/cdn-cgi/challenge-platform/')) out.cloudflare++;
      else out.own++;
    }
    return out;
  });
  const injected = inline.cloudflare;
  const cspErrors = errors.filter((t) => t.includes('Content Security Policy')).length;
  const own = errors.length - Math.min(cspErrors, injected) + inline.own;
  const status = res ? res.status() : 0;
  if (status !== 200 || own > 0) {
    failed++;
    console.log(`::error::${url}: status ${status}, ${own} console error(s) from the site`);
    errors.forEach((t) => console.log(`    ${t.slice(0, 300)}`));
  } else {
    console.log(`ok    ${url}: status 200, no console errors from the site` +
      (injected ? ` (${injected} Cloudflare bot-detection script blocked by the CSP, expected)` : ''));
  }
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
