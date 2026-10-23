/**
 * The hero's cluster drawing as a standalone SVG string, at rest, for build-time images.
 *
 * Same geometry as ClusterPoster.astro (src/scene/geometry.ts is the contract), with the
 * poster's CSS resolved into attributes because these renderers have no stylesheet.
 *
 * `labels: false` is for Satori/resvg, which cannot load the web fonts for text inside an
 * embedded SVG; the card draws the labels itself from POSTER_LABELS instead.
 */
import { scene, VIEWBOX, VIEWBOX_ATTR } from '../scene/geometry';
import { NODE_TOP, T } from './tokens';

export { VIEWBOX };

/** Label anchors in viewBox units, matching the offsets ClusterPoster.astro applies. */
export const POSTER_LABELS = [
  { text: 'ingress', x: scene.ingress.label.x, y: scene.ingress.label.y - 10 },
  ...scene.zones.map((zone) => ({ text: `AZ-${zone.id}`, x: zone.label.x, y: zone.label.y + 16 })),
];

/** The poster's desktop label size, in viewBox units. */
export const POSTER_LABEL_SIZE = 12;

export function posterSvg({ labels }: { labels: boolean }): string {
  const { ingress, zones } = scene;
  const stroke = `stroke="${T.line}" stroke-width="1" stroke-linejoin="round"`;
  const parts: string[] = [];

  for (const zone of zones) {
    parts.push(
      `<path d="M ${ingress.out.x} ${ingress.out.y} L ${zone.top.x} ${zone.top.y}" fill="none" stroke="${T.rule}" stroke-width="1" stroke-dasharray="3 5"/>`,
    );
  }

  parts.push(`<polygon points="${ingress.tile}" fill="none" ${stroke}/>`);

  for (const zone of zones) {
    parts.push(
      `<polygon points="${zone.plate}" fill="none" stroke="${T.rule}" stroke-width="1" stroke-linejoin="round"/>`,
    );
    for (const node of zone.nodes) {
      parts.push(`<polygon points="${node.left}" fill="${T.deep}" ${stroke}/>`);
      parts.push(`<polygon points="${node.right}" fill="${T.deep}" ${stroke}/>`);
      parts.push(`<polygon points="${node.top}" fill="${NODE_TOP}" ${stroke}/>`);
      node.podSlots.slice(0, node.podsAtRest).forEach((pod) => {
        parts.push(`<polygon points="${pod}" fill="${T.line}"/>`);
      });
    }
  }

  if (labels) {
    for (const label of POSTER_LABELS) {
      parts.push(
        `<text x="${label.x}" y="${label.y}" text-anchor="middle" fill="${T.muted}" font-family="'Overpass Mono', monospace" font-size="${POSTER_LABEL_SIZE}" letter-spacing="0.24">${label.text}</text>`,
      );
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX_ATTR}" ` +
    `width="${VIEWBOX.w}" height="${VIEWBOX.h}">${parts.join('')}</svg>`
  );
}
