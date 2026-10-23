// Dev helper: tiles images into one contact sheet.  node scripts/lab/sheet.mjs out.png cols a.png b.png ...
import sharp from 'sharp';
const [out, colsArg, ...files] = process.argv.slice(2);
const cols = Number(colsArg);
const metas = await Promise.all(files.map((f) => sharp(f).metadata()));
const w = Math.max(...metas.map((m) => m.width));
const h = Math.max(...metas.map((m) => m.height));
const rows = Math.ceil(files.length / cols);
const gap = 4;
await sharp({ create: { width: cols * w + (cols - 1) * gap, height: rows * h + (rows - 1) * gap, channels: 3, background: '#000' } })
  .composite(files.map((f, i) => ({ input: f, left: (i % cols) * (w + gap), top: Math.floor(i / cols) * (h + gap) })))
  .png()
  .toFile(out);
console.log(out);
