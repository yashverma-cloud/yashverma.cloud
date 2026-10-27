/**
 * Measures Archivo's width at each type role's width and weight against Arial's metrics
 * (Liberation Sans, metric-compatible), so each role can have a fallback face whose
 * size-adjust makes the swap to Archivo move nothing. Prints the descriptors for fonts.css.
 *
 *   npm run build:fast && PLAYWRIGHT_BROWSERS_PATH=0 node scripts/system/fallback-metrics.mjs
 *
 * The Android faces (Roboto) scale the Arial value by the base faces' ratio, 98.69 / 99.46:
 * both were matched to Archivo at width 100, weight 400 by shaping the same English text.
 */
import { chromium } from 'playwright';
import { serveDist } from '../lab/serve.mjs';

// Archivo's vertical metrics (OS/2), in em.
const ASCENT = 0.878;
const DESCENT = 0.21;
const ROBOTO_PER_ARIAL = 98.69 / 99.46;

const SAMPLE =
  'I keep production Kubernetes running when nodes die. Infrastructure Engineer, Cloud Operations at Copado. ' +
  'Work Experience Contact Scroll to descend. Autoscaling, cost and observability across multi-region production ' +
  'infrastructure. Five years on AWS and GCP, before that at BLG and Treebo. The quick brown fox jumps over the lazy dog. ' +
  'Yash Verma. Cut cloud spend by rightsizing nodes and tuning the horizontal pod autoscaler against real load curves.';

const ROLES = [
  { id: 'base', wdth: 100, wght: 400 },
  { id: 'name', wdth: 125, wght: 300, text: 'Yash Verma' },
  { id: 'display', wdth: 112, wght: 340 },
  { id: 'role', wdth: 108, wght: 380 },
  { id: 'small', wdth: 100, wght: 420, text: 'Scroll to descend' },
  { id: 'nav', wdth: 100, wght: 480, text: 'Work Experience Contact' },
];
const NAV_LABELS = ['Work', 'Experience', 'Writing', 'Contact'];

const server = await serveDist(4322);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4322/404.html');
  const out = await page.evaluate(
    async ({ roles, sample, navLabels }) => {
      const face = new FontFace('ArchivoM', "url('/fonts/archivo-latin-var.woff2') format('woff2-variations')", {
        weight: '200 700',
        stretch: '100% 125%',
      });
      await face.load();
      document.fonts.add(face);
      const width = (family, wdth, wght, text) => {
        const s = document.createElement('span');
        s.textContent = text;
        s.style.cssText = `position:absolute;white-space:nowrap;font-size:100px;letter-spacing:0;word-spacing:0;font-kerning:normal;font-family:${family};font-stretch:${wdth}%;font-weight:${wght}`;
        document.body.appendChild(s);
        const w = s.getBoundingClientRect().width;
        s.remove();
        return w;
      };
      const measured = roles.map((r) => {
        const texts = r.text ? [sample, r.text] : [sample];
        return {
          ...r,
          ratios: texts.map((t) => width('ArchivoM', r.wdth, r.wght, t) / width("'Liberation Sans'", 100, 400, t)),
        };
      });
      // The nav's labels in Archivo, in em: each link's box is held at this width (Nav.astro).
      const labels = Object.fromEntries(navLabels.map((l) => [l, width('ArchivoM', 100, 480, l) / 100]));
      return { measured, labels };
    },
    { roles: ROLES, sample: SAMPLE, navLabels: NAV_LABELS },
  );
  console.log('nav labels (em):', Object.entries(out.labels).map(([l, w]) => `${l} ${Math.ceil(w * 100) / 100}`).join(', '));
  const pct = (x) => `${(x * 100).toFixed(2)}%`;
  for (const r of out.measured) {
    // The role's own words weigh as much as the general sample: they are what must not move.
    const ratio = r.ratios.reduce((a, b) => a + b, 0) / r.ratios.length;
    const arial = ratio;
    const roboto = ratio * ROBOTO_PER_ARIAL;
    console.log(
      `${r.id.padEnd(8)} wdth ${r.wdth} wght ${r.wght}: ratios ${r.ratios.map((x) => x.toFixed(4)).join(' / ')}` +
        `\n  Arial  size-adjust ${pct(arial)}; ascent-override ${pct(ASCENT / arial)}; descent-override ${pct(DESCENT / arial)}` +
        `\n  Roboto size-adjust ${pct(roboto)}; ascent-override ${pct(ASCENT / roboto)}; descent-override ${pct(DESCENT / roboto)}`,
    );
  }
} finally {
  await browser.close();
  server.close();
}
