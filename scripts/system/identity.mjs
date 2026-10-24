/**
 * Builds the identity files from one definition of the monogram and the wordmark.
 *
 *   node scripts/system/identity.mjs
 *
 * Writes:
 *   public/favicon.svg, public/favicon.ico (16, 32, 48), public/apple-touch-icon.png (180),
 *   public/icon-512.png
 *   brand/altitude/monogram.svg        linework only, currentColor, for small sizes (16 px up)
 *   brand/altitude/monogram-fine.svg   the same geometry with a finer stroke, for 120 px up
 *   brand/altitude/wordmark.svg        "Yash Verma" in Archivo Expanded Light, outlined
 *   brand/altitude/lockup.svg          monogram and wordmark on one line
 *
 * The monogram: a Y inside a V (Yash inside Verma), drawn as linework. Read top down, the V is
 * a descent chevron, the Altitude idea in one stroke.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { colour } from '../../src/system/tokens.mjs';
import { MONOGRAM, monogramPaths } from '../../src/system/monogram.mjs';
import { loadFont, shape } from './sfnt.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function monogramSvg({ color = 'currentColor', stroke = MONOGRAM.stroke, ground = null, inset = 0, title = 'Yash Verma' } = {}) {
  const g = MONOGRAM.grid;
  // `inset` shrinks the mark inside its square, for icons whose corners get rounded off.
  const scale = 1 - inset * 2;
  const mark = `<g transform="translate(${g * inset} ${g * inset}) scale(${scale})">${monogramPaths(color, stroke)}</g>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g} ${g}" width="${g}" height="${g}">` +
    `<title>${title}</title>` +
    (ground ? `<rect width="${g}" height="${g}" fill="${ground}"/>` : '') +
    (inset ? mark : monogramPaths(color, stroke)) +
    `</svg>\n`
  );
}

/** Rasterises an SVG string to a square PNG. */
async function png(svg, size) {
  return sharp(Buffer.from(svg), { density: Math.max(72, (72 * size) / 32) * 2 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** A .ico holding PNG images (supported by every browser that reads .ico). */
function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const at = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, at);
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt8(0, at + 2);
    header.writeUInt8(0, at + 3);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

/**
 * "Yash Verma" as outlines: Archivo at width 125, weight 300, the hero's setting, with its
 * -0.03em tracking. Returns the path data in font units (y down) and the box.
 */
export async function wordmarkPath(text = 'Yash Verma') {
  const font = await loadFont(fileURLToPath(new URL('../../src/system/fonts/archivo-expanded-300.woff', import.meta.url)));
  const upm = font.metrics.unitsPerEm;
  const track = -0.03 * upm;
  const glyphs = shape(font, text);
  let x = 0;
  const parts = [];
  glyphs.forEach((g, i) => {
    const d = font.font.glyphToPath(g.id);
    if (d) parts.push(`<path transform="translate(${x + g.dx} ${-g.dy}) scale(1 -1)" d="${d}"/>`);
    x += g.advance + (i < glyphs.length - 1 ? track : 0);
  });
  return { parts: parts.join(''), width: x, ascent: font.metrics.capHeight, descent: -font.metrics.descender, upm };
}

async function main() {
  const out = (p) => fileURLToPath(new URL(p, `file://${ROOT}`));
  await mkdir(out('brand/altitude/'), { recursive: true });

  // Favicon: the mark on the night ground, so it reads on light and dark tab strips alike.
  const favicon = monogramSvg({ color: colour.ink, ground: colour.night });
  await writeFile(out('public/favicon.svg'), favicon);
  const sizes = [16, 32, 48];
  const images = await Promise.all(sizes.map(async (size) => ({ size, data: await png(favicon, size) })));
  await writeFile(out('public/favicon.ico'), ico(images));
  // Home-screen icons get their corners rounded by the platform: the mark keeps a margin.
  const app = monogramSvg({ color: colour.ink, ground: colour.night, inset: 0.18, stroke: 2.3 });
  await writeFile(out('public/apple-touch-icon.png'), await png(app, 180));
  await writeFile(out('public/icon-512.png'), await png(monogramSvg({ color: colour.ink, ground: colour.night, inset: 0.2, stroke: 1.9 }), 512));

  await writeFile(out('brand/altitude/monogram.svg'), monogramSvg());
  await writeFile(out('brand/altitude/monogram-fine.svg'), monogramSvg({ stroke: MONOGRAM.fine }));

  const wm = await wordmarkPath();
  const pad = 0;
  const h = wm.ascent + wm.descent;
  const wordmark =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-wm.ascent} ${wm.width + pad * 2} ${h}" width="${Math.round(wm.width / 10)}" height="${Math.round(h / 10)}">` +
    `<title>Yash Verma</title><g fill="currentColor">${wm.parts}</g></svg>\n`;
  await writeFile(out('brand/altitude/wordmark.svg'), wordmark);

  // Lockup: the monogram as tall as the capitals, then the name, one cap height apart.
  const cap = wm.ascent;
  const markScale = cap / 23.5; // the mark's linework spans y 5 to 28.5 on its grid
  const markW = 32 * markScale;
  const gap = cap * 0.62;
  const lockup =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${-cap} ${markW + gap + wm.width} ${h}" width="${Math.round((markW + gap + wm.width) / 10)}" height="${Math.round(h / 10)}">` +
    `<title>Yash Verma</title>` +
    `<g transform="translate(0 ${-cap - 5 * markScale}) scale(${markScale})">${monogramPaths('currentColor', MONOGRAM.stroke * 0.82)}</g>` +
    `<g transform="translate(${markW + gap} 0)" fill="currentColor">${wm.parts}</g></svg>\n`;
  await writeFile(out('brand/altitude/lockup.svg'), lockup);

  console.log('public/favicon.svg, favicon.ico, apple-touch-icon.png, icon-512.png');
  console.log('brand/altitude/monogram.svg, monogram-fine.svg, wordmark.svg, lockup.svg');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
