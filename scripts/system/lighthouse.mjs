/**
 * Lighthouse on the built site, locally: serves dist/ and audits each path with Playwright's
 * Chromium (mobile settings, as CI). Needs Lighthouse installed outside the project's
 * dependencies (CI runs @lhci/cli with npx), e.g. into .cache/lh:
 *
 *   npm install --no-save --prefix .cache/lh lighthouse@12
 *   node scripts/system/lighthouse.mjs <path>[,<path>...] [--out=.screenshots/lighthouse]
 *
 * Prints accessibility, best practices, SEO and performance per path, and the failing audits.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { serveDist } from '../lab/serve.mjs';

const [list] = process.argv.slice(2);
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
const out = arg('out', '.screenshots/lighthouse');
const lhRoot = resolve(arg('lh', '.cache/lh'));
const require = createRequire(join(lhRoot, 'package.json'));
const lighthouse = (await import(pathToFileURL(require.resolve('lighthouse')).href)).default;

await mkdir(out, { recursive: true });
const server = await serveDist(4326);
// Chromium on a fixed DevTools port, started directly: chrome-launcher misdetects WSL.
const profile = resolve('.cache/lh-profile');
await mkdir(profile, { recursive: true });
const PORT = 9333;
// The headless shell (Playwright's own headless build): the full binary needs a Unix socket for
// its single-instance lock, which the sandbox here refuses.
const shell = chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux64\/chrome$/, 'chromium_headless_shell-$1/chrome-headless-shell-linux64/chrome-headless-shell');
const proc = spawn(shell, ['--no-sandbox', '--enable-unsafe-swiftshader', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const chrome = { port: PORT, kill: () => proc.kill() };
for (let i = 0; i < 100; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (r.ok) break;
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 100));
}
let failed = 0;
try {
  for (const path of list.split(',')) {
    const result = await lighthouse(`http://127.0.0.1:4326${path}`, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['accessibility', 'best-practices', 'seo', 'performance'],
      blockedUrlPatterns: ['*google-analytics.com*', '*analytics.google.com*', '*google.com/g/collect*', '*googletagmanager.com*'],
    });
    const lhr = result.lhr;
    const score = (k) => Math.round((lhr.categories[k]?.score ?? 0) * 100);
    const s = { a11y: score('accessibility'), bp: score('best-practices'), seo: score('seo'), perf: score('performance') };
    const slug = path.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'home';
    await writeFile(join(out, `${slug}.json`), JSON.stringify(lhr));
    const bad = Object.values(lhr.audits).filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode === 'binary');
    console.log(`${path}  a11y ${s.a11y}  bp ${s.bp}  seo ${s.seo}  perf ${s.perf}  LCP ${Math.round(lhr.audits['largest-contentful-paint']?.numericValue ?? 0)} ms  CLS ${(lhr.audits['cumulative-layout-shift']?.numericValue ?? 0).toFixed(3)}`);
    for (const a of bad) console.log(`    - ${a.id}: ${a.title}`);
    if (s.a11y < 95 || s.bp < 95) failed++;
  }
} finally {
  chrome.kill();
  server.close();
}
process.exit(failed ? 1 : 0);
