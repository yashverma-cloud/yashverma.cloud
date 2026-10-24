import type { APIRoute, GetStaticPaths } from 'astro';
import { getEntry } from 'astro:content';
import { caseStudyCard, homeCard, postCard, renderCard } from '../../../og/altitude';

/** Previews of the Altitude Open Graph cards for the style guide; web-06 moves /og/ onto them. */
export const getStaticPaths = (() => ['home', 'case-study', 'post'].map((card) => ({ params: { card } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  let el;
  if (params.card === 'home') el = await homeCard();
  else if (params.card === 'case-study') {
    const k = await getEntry('work', 'karpenter-autoscaling');
    el = await caseStudyCard({ title: k?.data.title ?? '', mechanism: k?.data.mechanism ?? '', still: 'lab/altitude/close-landscape.webp' });
  } else {
    const d = await getEntry('writing', 'tuning-karpenter-disruption');
    el = postCard({ title: d?.data.title ?? '', description: d?.data.description ?? '' });
  }
  return new Response(new Uint8Array(await renderCard(el)), { headers: { 'Content-Type': 'image/png' } });
};
