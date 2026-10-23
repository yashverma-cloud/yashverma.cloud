/**
 * Build-time helper: the AVIF and WebP sizes of a rendered poster pair. A poster is two files
 * in src/assets, `<name>-landscape.webp` (2560 wide) and `<name>-portrait.webp` (1200 wide),
 * rendered from the live scene by scripts/altitude/posters.mjs. Astro makes the sizes.
 */
import { getImage } from 'astro:assets';

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
