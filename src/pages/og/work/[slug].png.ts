import type { APIRoute, GetStaticPaths } from 'astro';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getCollection, type CollectionEntry } from 'astro:content';
import { caseStudyCard, renderCard } from '../../../og/altitude';

/** One Open Graph image per published case study, over its own scene, rendered at build time. */
export const getStaticPaths = (async () => {
  const work = await getCollection('work', ({ data }) => !data.draft);
  return work.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ entry: CollectionEntry<'work'> }> = async ({ props }) => {
  const { title, mechanism } = props.entry.data;
  const own = `scenes/${props.entry.id}-landscape.webp`;
  const still = existsSync(join(process.cwd(), 'src/assets', own)) ? own : 'lab/altitude/close-landscape.webp';
  const png = await renderCard(await caseStudyCard({ title, mechanism, still }));
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
