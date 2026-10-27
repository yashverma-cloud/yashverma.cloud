/**
 * Build-time helper: the AVIF and WebP sizes of a rendered poster pair. A poster is two files
 * in src/assets, `<name>-landscape.webp` (2560 wide) and `<name>-portrait.webp` (1200 wide),
 * rendered from the live scene by scripts/altitude/posters.mjs. Astro makes the sizes.
 */
import { getImage } from 'astro:assets';
import { join } from 'node:path';
import sharp from 'sharp';

const files = import.meta.glob<{ default: ImageMetadata }>('../assets/**/*-{landscape,portrait}.webp', { eager: true });

export interface PosterSet {
  landAvif: string;
  landWebp: string;
  portAvif: string;
  portWebp: string;
  fallback: string;
}

/** `name` is the poster's path under src/assets without the suffix, e.g. "scenes/karpenter". */
export async function poster(name: string): Promise<PosterSet | null> {
  const find = (o: string) => Object.entries(files).find(([k]) => k.endsWith(`/assets/${name}-${o}.webp`))?.[1].default;
  const land = find('landscape');
  const port = find('portrait');
  if (!land || !port) return null;
  const make = async (src: ImageMetadata, ws: number[], format: 'avif' | 'webp') =>
    (
      await Promise.all(
        ws.map(async (w) => {
          const width = Math.min(w, src.width);
          const img = await getImage({ src, width, format, quality: format === 'avif' ? 62 : 74 });
          return `${img.src} ${width}w`;
        }),
      )
    ).join(', ');
  const fallback = await getImage({ src: land, width: 1600, format: 'webp', quality: 74 });
  return {
    landAvif: await make(land, [1280, 1920, 2560], 'avif'),
    landWebp: await make(land, [1280, 1920, 2560], 'webp'),
    portAvif: await make(port, [640, 960, 1280], 'avif'),
    portWebp: await make(port, [640, 960, 1280], 'webp'),
    fallback: fallback.src,
  };
}

const singles = import.meta.glob<{ default: ImageMetadata }>('../assets/reading/*.webp', { eager: true });

export interface FigureSet {
  avif: string;
  webp: string;
  fallback: string;
  width: number;
  height: number;
}

/**
 * One rendered image in src/assets/reading (a case study's state: `<slug>-<state>-wide` behind a
 * section on wide screens, `<slug>-<state>-snap` under its heading on phones), at `widths`.
 */
export async function figure(name: string, widths: number[]): Promise<FigureSet | null> {
  const src = Object.entries(singles).find(([k]) => k.endsWith(`/assets/${name}.webp`))?.[1].default;
  if (!src) return null;
  const sizes = [...new Set(widths.map((w) => Math.min(w, src.width)))];
  const make = async (format: 'avif' | 'webp') =>
    (
      await Promise.all(
        sizes.map(async (width) => {
          const img = await getImage({ src, width, format, quality: format === 'avif' ? 62 : 74 });
          return `${img.src} ${width}w`;
        }),
      )
    ).join(', ');
  const fallback = await getImage({ src, width: sizes[0], format: 'webp', quality: 74 });
  return { avif: await make('avif'), webp: await make('webp'), fallback: fallback.src, width: src.width, height: src.height };
}

/**
 * A poster's tiny, soft copy as data URIs, a few hundred bytes each, inlined in the page so the
 * first paint already shows the sky; the poster sharpens over it once it has arrived and decoded.
 */
export async function placeholder(name: string): Promise<{ land: string; port: string } | null> {
  const one = async (orientation: 'landscape' | 'portrait', width: number) => {
    const file = join(process.cwd(), 'src/assets', `${name}-${orientation}.webp`);
    const buf = await sharp(file).resize({ width }).blur(0.6).webp({ quality: 55 }).toBuffer();
    return `data:image/webp;base64,${buf.toString('base64')}`;
  };
  try {
    return { land: await one('landscape', 48), port: await one('portrait', 30) };
  } catch {
    return null;
  }
}
