import type { APIRoute } from 'astro';
import { posterSvg } from '../../og/poster';

/**
 * The cluster drawing as a standalone SVG. The brand kit (brand/render.mjs) builds its
 * covers and cards from this file, so they share the hero's geometry without the script
 * having to import TypeScript.
 */
export const GET: APIRoute = () =>
  new Response(posterSvg({ labels: true }), {
    headers: { 'Content-Type': 'image/svg+xml' },
  });
