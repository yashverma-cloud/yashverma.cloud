import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { postCard, renderCard } from '../../../og/altitude';

/** One titled Open Graph image per published post, rendered at build time. */
export const getStaticPaths = (async () => {
  const posts = await getCollection('writing', ({ data }) => !data.draft);
  return posts.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ entry: CollectionEntry<'writing'> }> = async ({ props }) => {
  const { title, description } = props.entry.data;
  const png = await renderCard(postCard({ title, description }));
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
