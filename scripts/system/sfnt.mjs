/**
 * Font helpers for the build scripts: WOFF 1.0 to a plain sfnt, a few metric tables, and
 * HarfBuzz shaping (harfbuzzjs). Node built-ins only, plus harfbuzzjs.
 */
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Unpacks a WOFF 1.0 file into the TrueType/OpenType bytes it wraps. */
export function woffToSfnt(woff) {
  if (woff.toString('ascii', 0, 4) !== 'wOFF') return woff;
  const flavor = woff.readUInt32BE(4);
  const numTables = woff.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const at = 44 + i * 20;
    const tag = woff.toString('ascii', at, at + 4);
    const offset = woff.readUInt32BE(at + 4);
    const compLength = woff.readUInt32BE(at + 8);
    const origLength = woff.readUInt32BE(at + 12);
    const checksum = woff.readUInt32BE(at + 16);
    const raw = woff.subarray(offset, offset + compLength);
    tables.push({ tag, checksum, data: compLength < origLength ? inflateSync(raw) : raw });
  }
  const pad = (n) => (n + 3) & ~3;
  let size = 12 + numTables * 16;
  for (const t of tables) size += pad(t.data.length);
  const out = Buffer.alloc(size);
  const log2 = Math.floor(Math.log2(numTables));
  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(numTables, 4);
  out.writeUInt16BE(16 * 2 ** log2, 6);
  out.writeUInt16BE(log2, 8);
  out.writeUInt16BE(numTables * 16 - 16 * 2 ** log2, 10);
  let offset = 12 + numTables * 16;
  tables.forEach((t, i) => {
    const at = 12 + i * 16;
    out.write(t.tag, at, 'ascii');
    out.writeUInt32BE(t.checksum, at + 4);
    out.writeUInt32BE(offset, at + 8);
    out.writeUInt32BE(t.data.length, at + 12);
    t.data.copy(out, offset);
    offset += pad(t.data.length);
  });
  return out;
}

function table(sfnt, tag) {
  const n = sfnt.readUInt16BE(4);
  for (let i = 0; i < n; i++) {
    const at = 12 + i * 16;
    if (sfnt.toString('ascii', at, at + 4) === tag) {
      const offset = sfnt.readUInt32BE(at + 8);
      return sfnt.subarray(offset, offset + sfnt.readUInt32BE(at + 12));
    }
  }
  throw new Error(`no ${tag} table`);
}

/** Vertical metrics, in font units. */
export function metrics(sfnt) {
  const head = table(sfnt, 'head');
  const hhea = table(sfnt, 'hhea');
  const os2 = table(sfnt, 'OS/2');
  return {
    unitsPerEm: head.readUInt16BE(18),
    ascender: hhea.readInt16BE(4),
    descender: hhea.readInt16BE(6),
    lineGap: hhea.readInt16BE(8),
    typoAscender: os2.readInt16BE(68),
    typoDescender: os2.readInt16BE(70),
    typoLineGap: os2.readInt16BE(72),
    winAscent: os2.readUInt16BE(74),
    winDescent: os2.readUInt16BE(76),
    useTypo: (os2.readUInt16BE(62) & (1 << 7)) !== 0,
    capHeight: os2.length >= 90 ? os2.readInt16BE(88) : 0,
    xHeight: os2.length >= 88 ? os2.readInt16BE(86) : 0,
  };
}

/** The harfbuzzjs instance (WebAssembly, loaded once by the package). */
export function harfbuzz() {
  return require('harfbuzzjs');
}

/** Loads a .woff or .ttf file as a HarfBuzz font, with its sfnt bytes and metrics. */
export async function loadFont(path) {
  const hb = await harfbuzz();
  const sfnt = woffToSfnt(await readFile(path));
  const blob = hb.createBlob(sfnt);
  const face = hb.createFace(blob, 0);
  const font = hb.createFont(face);
  return { hb, font, face, blob, sfnt, metrics: metrics(sfnt) };
}

/** Shapes `text` and returns its glyphs: id, advance and offsets, in font units. */
export function shape({ hb, font }, text, features = 'kern,liga') {
  const buffer = hb.createBuffer();
  buffer.addText(text);
  buffer.guessSegmentProperties();
  hb.shape(font, buffer, features);
  const glyphs = buffer.json().map((g) => ({ id: g.g, advance: g.ax, dx: g.dx, dy: g.dy, cluster: g.cl }));
  buffer.destroy();
  return glyphs;
}
