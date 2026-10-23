import type { APIRoute } from 'astro';
import { homeCard, renderCard } from '../../og/altitude';

/** The site-wide Open Graph image: the hero at one size. Rendered once at build time. */
export const GET: APIRoute = async () =>
  new Response(new Uint8Array(await renderCard(await homeCard())), {
    headers: { 'Content-Type': 'image/png' },
  });
