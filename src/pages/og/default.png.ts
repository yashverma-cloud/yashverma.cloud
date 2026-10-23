import type { APIRoute } from 'astro';
import { defaultCard, renderPng } from '../../og/card';

/** The site-wide Open Graph image, rendered once at build time. */
export const GET: APIRoute = async () =>
  new Response(new Uint8Array(await renderPng(defaultCard())), {
    headers: { 'Content-Type': 'image/png' },
  });
