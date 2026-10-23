/**
 * Renders the raster icons from public/favicon.svg, so the monogram has exactly one
 * source. Re-run after editing the SVG:  node scripts/make-icons.mjs
 *
 * Uses the sharp that Astro already depends on — no extra dependency.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const svg = readFileSync('public/favicon.svg');

const targets = [
  { file: 'public/apple-touch-icon.png', size: 180 },
  { file: 'public/icon-512.png', size: 512 },
];

for (const { file, size } of targets) {
  const png = await sharp(svg, { density: 640 }).resize(size, size).png().toBuffer();
  writeFileSync(file, png);
  console.log(`${file}  ${size}x${size}  ${png.length} bytes`);
}
