import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { caseStudyCard, renderPng } from '../../../og/card';

/** One titled Open Graph image per published case study, rendered at build time. */
export const getStaticPaths = (async () => {
  const work = await getCollection('work', ({ data }) => !data.draft);
  return work.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ entry: CollectionEntry<'work'> }> = async ({ props }) => {
  const { title, mechanism } = props.entry.data;
  const png = await renderPng(caseStudyCard({ title, mechanism }));
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
