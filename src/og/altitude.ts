/**
 * Open Graph cards in the Altitude system, 1200×630, rendered at build time: Satori lays the
 * card out with the text as paths, resvg rasterises it, and sharp packs it into a palette PNG
 * (a photographic sky as a full-colour PNG would weigh over a megabyte).
 *
 *   home        the hero at one size: the name on the horizon of the real scene, the role below
 *   case study  that case study's scene, the title and the mechanism, the lockup
 *   writing     the post's title and description on the night ground over the dawn horizon
 *
 * Everything that matters sits inside the 1200×600 band X keeps when it crops to 2:1.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { SITE } from '../consts';
import { colour } from '../system/tokens.mjs';
import { MONOGRAM, monogramPaths } from '../system/monogram.mjs';

export const OG = { width: 1200, height: 630 } as const;

const font = (file: string) => readFileSync(join(process.cwd(), 'src/system/fonts', file));
const FONTS = [
  { name: 'Archivo Expanded', weight: 300, data: font('archivo-expanded-300.woff') },
  { name: 'Archivo Wide', weight: 400, data: font('archivo-wide-380.woff') },
  { name: 'Archivo', weight: 400, data: font('archivo-400.woff') },
  { name: 'Archivo', weight: 600, data: font('archivo-600.woff') },
] as const;

type Style = Record<string, string | number>;
type Child = El | string;
interface El {
  type: string;
  props: { style?: Style; children?: Child | Child[]; [key: string]: unknown };
}
const div = (style: Style, ...children: Child[]): El => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });
const img = (src: string, style: Style): El => ({ type: 'img', props: { src, width: style.width, height: style.height, style } });

const HOST = new URL(SITE.url).host;
const mark = (size: number) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MONOGRAM.grid} ${MONOGRAM.grid}" width="${size}" height="${size}">${monogramPaths(colour.ink, MONOGRAM.stroke)}</svg>`).toString('base64')}`;

/**
 * A scene's still, cropped to the card so its horizon (or its drawing) lands where the
 * composition needs it. `focusY` is where, from 0 (top) to 1, the crop is centred.
 */
async function backdrop(file: string, focusY: number, anchor: 'centre' | 'right' = 'centre'): Promise<string> {
  const src = sharp(join(process.cwd(), 'src/assets', file));
  const meta = await src.metadata();
  const sw = meta.width ?? OG.width;
  const sh = meta.height ?? OG.height;
  // Cover: scale until both sides fill the card, then crop.
  const scale = Math.max(OG.width / sw, OG.height / sh);
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  // A case study's drawing reaches the right edge; the left is empty grid behind the copy.
  const left = anchor === 'right' ? w - OG.width : Math.round((w - OG.width) / 2);
  const top = Math.max(0, Math.min(h - OG.height, Math.round(h * focusY - OG.height / 2)));
  const jpg = await src.resize(w, h).extract({ left, top, width: OG.width, height: OG.height }).jpeg({ quality: 88 }).toBuffer();
  return `data:image/jpeg;base64,${jpg.toString('base64')}`;
}

/** The lockup in the bottom-left corner: the monogram, the name, the host under it. */
function signature(): El {
  return div(
    { position: 'absolute', left: 64, bottom: 52, alignItems: 'center' },
    img(mark(46), { width: 46, height: 46 }),
    div(
      { flexDirection: 'column', marginLeft: 18 },
      div({ fontFamily: 'Archivo Expanded', fontSize: 26, color: colour.ink, letterSpacing: -0.3 }, SITE.name),
      div({ fontFamily: 'Archivo', fontSize: 20, color: colour.ink2, marginTop: 2 }, HOST),
    ),
  );
}

/** The home card: the hero at one size. */
export async function homeCard(): Promise<El> {
  const horizon = 352;
  return div(
    { width: OG.width, height: OG.height, position: 'relative', backgroundColor: colour.night },
    img(await backdrop('lab/altitude/hero-landscape.webp', 0.53), { position: 'absolute', left: 0, top: 0, width: OG.width, height: OG.height }),
    div(
      { position: 'absolute', left: 60, top: horizon - 120, height: 120, alignItems: 'flex-end' },
      div({ fontFamily: 'Archivo Expanded', fontSize: 128, lineHeight: 1, color: colour.ink, letterSpacing: -3.6, marginBottom: -4 }, SITE.name),
    ),
    div(
      { position: 'absolute', left: 66, top: horizon + 26, flexDirection: 'column' },
      div({ fontFamily: 'Archivo Wide', fontSize: 32, color: colour.ink }, SITE.jobTitle),
      div({ fontFamily: 'Archivo', fontSize: 28, color: colour.ink2, marginTop: 6 }, `at ${SITE.employer}, ${SITE.location.split(',')[0]} · ${HOST}`),
    ),
  );
}

export interface CaseStudyCard {
  title: string;
  mechanism: string;
  /** The scene's landscape still, under src/assets. */
  still: string;
}

/** A case study's card: its scene, with the title and the mechanism over a burn on the left. */
export async function caseStudyCard({ title, mechanism, still }: CaseStudyCard): Promise<El> {
  return div(
    { width: OG.width, height: OG.height, position: 'relative', backgroundColor: colour.sheet },
    img(await backdrop(still, 0.5, 'right'), { position: 'absolute', left: 0, top: 0, width: OG.width, height: OG.height }),
    // The burn: a soft darkening behind the words, never a panel. Deep enough under the title and
    // the mechanism that the linework recedes behind them.
    div({ position: 'absolute', left: 0, top: 0, width: 900, height: OG.height, backgroundImage: `linear-gradient(90deg, ${colour.night}f0 0%, ${colour.night}e0 58%, ${colour.night}00 100%)` }),
    div(
      { position: 'absolute', left: 64, top: 64, width: 720, flexDirection: 'column' },
      div({ fontFamily: 'Archivo', fontWeight: 600, fontSize: 22, color: colour.ink2, marginBottom: 22 }, 'Case study'),
      div({ fontFamily: 'Archivo Wide', fontSize: 58, lineHeight: 1.06, color: colour.ink, letterSpacing: -1.2, textWrap: 'balance' }, title),
      div({ fontFamily: 'Archivo', fontSize: 28, lineHeight: 1.3, color: colour.ink2, marginTop: 26 }, mechanism),
    ),
    signature(),
  );
}

export interface PostCard {
  title: string;
  description: string;
}

/** A post's card: no picture, the words on the night ground over the dawn horizon. */
export function postCard({ title, description }: PostCard): El {
  return div(
    { width: OG.width, height: OG.height, position: 'relative', backgroundColor: colour.night },
    div({ position: 'absolute', left: 0, top: 470, width: OG.width, height: 160, borderTop: `2px solid ${colour.rule}`, backgroundImage: `linear-gradient(180deg, ${colour.glow}38 0%, ${colour.glow}00 100%)` }),
    div(
      { position: 'absolute', left: 64, top: 60, width: 1000, flexDirection: 'column' },
      div({ fontFamily: 'Archivo', fontWeight: 600, fontSize: 22, color: colour.ink2, marginBottom: 22 }, 'Writing'),
      div({ fontFamily: 'Archivo Wide', fontSize: title.length > 52 ? 50 : 60, lineHeight: 1.06, color: colour.ink, letterSpacing: -1.2, textWrap: 'balance', maxWidth: 940 }, title),
      div({ fontFamily: 'Archivo', fontSize: 28, lineHeight: 1.3, color: colour.ink2, marginTop: 24, maxWidth: 900 }, description),
    ),
    signature(),
  );
}

/** Lays the card out and packs it: palette PNG, dithered so the sky keeps its gradients. */
export async function renderCard(card: El): Promise<Buffer> {
  const svg = await satori(card as never, {
    width: OG.width,
    height: OG.height,
    fonts: FONTS.map((f) => ({ ...f, style: 'normal' as const })),
  });
  const png = new Resvg(svg, { fitTo: { mode: 'original' }, font: { loadSystemFonts: false } }).render().asPng();
  // A dense drawing makes a large file: a lower quantizer quality (libimagequant's, the knob that
  // changes the size) until it fits the image budget.
  let out = Buffer.alloc(0);
  for (const quality of [100, 90, 80, 70, 60]) {
    out = await sharp(png).png({ palette: true, quality, dither: 1, effort: 10, compressionLevel: 9 }).toBuffer();
    if (out.length <= MAX_BYTES) break;
  }
  return out;
}

/** Every card stays under the site's 200 KB image budget, with a margin. */
const MAX_BYTES = 190 * 1024;
