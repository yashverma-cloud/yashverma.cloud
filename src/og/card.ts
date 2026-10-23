/**
 * Open Graph cards, 1200×630, rendered at build time: Satori lays the card out as SVG with
 * the text converted to paths, and resvg rasterises it. No runtime service, no fonts
 * fetched — the woff files come from the Fontsource packages already in node_modules
 * (Satori reads woff, not woff2, so these are the static-weight packages).
 *
 * The cards are drawing sheets, like the case-study figures: a --rule-faint border and a
 * title block in the bottom-right corner. Everything important sits well inside the
 * 1200×600 band that X keeps when it crops to 2:1.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { SITE } from '../consts';
import { POSTER_LABELS, POSTER_LABEL_SIZE, VIEWBOX, posterSvg } from './poster';
import { RULE_FAINT, T } from './tokens';

export const OG = { width: 1200, height: 630 } as const;

// --- Fonts -------------------------------------------------------------------

const font = (pkg: string, file: string) =>
  readFileSync(join(process.cwd(), 'node_modules', pkg, 'files', file));

const FONTS = [
  { name: 'Overpass', weight: 400, data: font('@fontsource/overpass', 'overpass-latin-400-normal.woff') },
  { name: 'Overpass', weight: 600, data: font('@fontsource/overpass', 'overpass-latin-600-normal.woff') },
  { name: 'Overpass', weight: 700, data: font('@fontsource/overpass', 'overpass-latin-700-normal.woff') },
  {
    name: 'Overpass Mono',
    weight: 400,
    data: font('@fontsource/overpass-mono', 'overpass-mono-latin-400-normal.woff'),
  },
] as const;

// --- A tiny element helper, so Satori needs no JSX runtime ----------------------

type Style = Record<string, string | number>;
type Child = El | string;
interface El {
  type: string;
  props: { style?: Style; children?: Child | Child[]; [key: string]: unknown };
}

const div = (style: Style, ...children: Child[]): El => ({
  type: 'div',
  props: { style: { display: 'flex', ...style }, children },
});

// --- Shared parts ----------------------------------------------------------------

const HOST = new URL(SITE.url).host;
const PAD = 32;

/** The bottom-right title block, as on every figure on the site. */
function titleBlock(): El {
  return div(
    {
      position: 'absolute',
      right: 0,
      bottom: 0,
      flexDirection: 'column',
      padding: '14px 26px 16px',
      borderTop: `1px solid ${RULE_FAINT}`,
      borderLeft: `1px solid ${RULE_FAINT}`,
    },
    div({ fontSize: 24, fontWeight: 600, color: T.line }, SITE.name),
    div({ fontSize: 20, fontWeight: 400, color: T.muted, marginTop: 2 }, HOST),
  );
}

function sheet(...children: Child[]): El {
  return div(
    {
      width: OG.width,
      height: OG.height,
      padding: PAD,
      backgroundColor: T.blueprint,
      fontFamily: 'Overpass',
    },
    div({ flex: 1, position: 'relative', border: `1px solid ${RULE_FAINT}` }, ...children),
  );
}

/** The cluster drawing at a given width, with its labels set by Satori. */
function poster(width: number): El {
  const scale = width / VIEWBOX.w;
  const height = Math.round(VIEWBOX.h * scale);
  const src = `data:image/svg+xml;base64,${Buffer.from(posterSvg({ labels: false })).toString('base64')}`;
  const size = POSTER_LABEL_SIZE * scale;
  const labelWidth = 120;

  return div(
    { position: 'relative', width, height },
    { type: 'img', props: { src, width, height, style: { width, height } } },
    ...POSTER_LABELS.map((label) =>
      div(
        {
          position: 'absolute',
          left: (label.x - VIEWBOX.x) * scale - labelWidth / 2,
          // SVG text sits on its baseline; Satori positions the box. With a line height of
          // 1 the baseline is the ascent below the top, about 0.85em in Overpass Mono.
          top: (label.y - VIEWBOX.y) * scale - size * 0.85,
          width: labelWidth,
          justifyContent: 'center',
          fontFamily: 'Overpass Mono',
          fontSize: size,
          lineHeight: 1,
          letterSpacing: size * 0.02,
          color: T.muted,
        },
        label.text,
      ),
    ),
  );
}

// --- Cards -------------------------------------------------------------------------

const POSTER_W = 600;

export function defaultCard(): El {
  const posterH = Math.round(VIEWBOX.h * (POSTER_W / VIEWBOX.w));
  const sheetH = OG.height - PAD * 2;
  return sheet(
    div(
      {
        position: 'absolute',
        left: 56,
        top: 0,
        bottom: 0,
        width: 480,
        flexDirection: 'column',
        justifyContent: 'center',
      },
      div({ fontSize: 22, fontWeight: 600, color: T.muted, marginBottom: 22 }, SITE.jobTitle),
      div(
        { fontSize: 58, fontWeight: 700, lineHeight: 1.06, letterSpacing: -1.16, color: T.line },
        'I keep production Kubernetes running when nodes die.',
      ),
    ),
    // Centred on the sheet's height, level with the headline block.
    div(
      { position: 'absolute', right: 36, top: Math.round((sheetH - posterH) / 2) - 14 },
      poster(POSTER_W),
    ),
    titleBlock(),
  );
}

export interface CaseStudyCard {
  title: string;
  mechanism: string;
}

/**
 * Title, then the mechanism: how it was done. The proof row (figure + result) was tried
 * as the second line and dropped — most titles already carry their figure, so it read
 * "Cutting 40% off the monthly cloud bill / 40% cut off the monthly cloud bill".
 */
export function caseStudyCard({ title, mechanism }: CaseStudyCard): El {
  return sheet(
    div(
      {
        position: 'absolute',
        left: 56,
        right: 56,
        top: 56,
        bottom: 120,
        flexDirection: 'column',
        justifyContent: 'center',
      },
      div(
        {
          fontSize: 22,
          fontWeight: 600,
          color: T.muted,
          paddingBottom: 12,
          marginBottom: 30,
          borderBottom: `1px solid ${RULE_FAINT}`,
          width: 220,
        },
        'Case study',
      ),
      div(
        {
          fontSize: 62,
          fontWeight: 700,
          lineHeight: 1.08,
          letterSpacing: -0.93,
          color: T.line,
          maxWidth: 940,
          textWrap: 'balance',
        },
        title,
      ),
      div(
        { marginTop: 34, fontSize: 30, color: T.muted, maxWidth: 940, textWrap: 'balance' },
        mechanism,
      ),
    ),
    titleBlock(),
  );
}

export interface PostCard {
  title: string;
  description: string;
}

/**
 * The writing card: the case-study card's composition with its own eyebrow, so the two read
 * as one family. The rule under the eyebrow keeps the case study's 220px width even though
 * "Writing" is a shorter word — the length of that line is the family resemblance.
 *
 * The title size steps down for long titles. Case-study titles were written in this repo and
 * curated to fit; post titles arrive from outside it, and Satori does not shrink text to fit,
 * so an unclamped 62px title would run out of the sheet instead of wrapping inside it.
 */
export function postCard({ title, description }: PostCard): El {
  return sheet(
    div(
      {
        position: 'absolute',
        left: 56,
        right: 56,
        top: 56,
        bottom: 120,
        flexDirection: 'column',
        justifyContent: 'center',
      },
      div(
        {
          fontSize: 22,
          fontWeight: 600,
          color: T.muted,
          paddingBottom: 12,
          marginBottom: 30,
          borderBottom: `1px solid ${RULE_FAINT}`,
          width: 220,
        },
        'Writing',
      ),
      div(
        {
          fontSize: title.length > 52 ? 52 : 62,
          fontWeight: 700,
          lineHeight: 1.08,
          letterSpacing: -0.93,
          color: T.line,
          maxWidth: 940,
          textWrap: 'balance',
        },
        title,
      ),
      div(
        { marginTop: 34, fontSize: 30, color: T.muted, maxWidth: 940, textWrap: 'balance' },
        description,
      ),
    ),
    titleBlock(),
  );
}

// --- Render ------------------------------------------------------------------------

export async function renderPng(card: El): Promise<Buffer> {
  // Satori's element type is React's; this plain object tree is the same shape.
  const svg = await satori(card as never, {
    width: OG.width,
    height: OG.height,
    fonts: FONTS.map((f) => ({ ...f, style: 'normal' as const })),
  });
  return new Resvg(svg, { fitTo: { mode: 'original' }, font: { loadSystemFonts: false } })
    .render()
    .asPng();
}
