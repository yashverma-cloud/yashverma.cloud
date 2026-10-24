/**
 * Plotter linework as SVG for build-time images: axonometric boxes on a sheet, in the drawing
 * kit's weights and colours, so a post image speaks the same language as the scenes.
 */
import { colour, weight } from '../tokens.mjs';

export interface IsoBox {
  /** Grid position and size, in plan units. */
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  kind?: 'system' | 'field' | 'guide';
}

/** Plan (x right, y back, z up) to the page: a 30° axonometric. */
function project(x: number, y: number, z: number, s: number): [number, number] {
  const c = Math.cos(Math.PI / 6);
  return [(x - y) * c * s, ((x + y) * 0.5 - z) * s];
}

/**
 * Boxes, an optional pending pod over a dashed lot, and the plumb line between them.
 * `scale` is page pixels per plan unit, offset by (cx, cy). Returns the SVG elements and their
 * bounding box, for the viewBox.
 */
export function isoDrawing({
  boxes,
  pending,
  scale = 14,
  cx = 0,
  cy = 0,
  stroke = 2.2,
}: {
  boxes: IsoBox[];
  pending?: { x: number; y: number; lift: number };
  scale?: number;
  cx?: number;
  cy?: number;
  stroke?: number;
}): { svg: string; box: [number, number, number, number] } {
  const out: string[] = [];
  let x0b = Infinity;
  let y0b = Infinity;
  let x1b = -Infinity;
  let y1b = -Infinity;
  const p = (x: number, y: number, z: number) => {
    const [a, b] = project(x, y, z, scale);
    const px = a + cx;
    const py = b + cy;
    x0b = Math.min(x0b, px);
    y0b = Math.min(y0b, py);
    x1b = Math.max(x1b, px);
    y1b = Math.max(y1b, py);
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  };
  // Back to front, so nearer boxes draw over farther ones (painter's order).
  const sorted = [...boxes].sort((a, b) => a.x + a.y - (b.x + b.y));
  for (const b of sorted) {
    const x0 = b.x;
    const x1 = b.x + b.w;
    const y0 = b.y;
    const y1 = b.y + b.d;
    const ink = b.kind === 'guide' ? colour.sun : colour.line;
    const w = (b.kind === 'field' ? weight.secondary / weight.primary : b.kind === 'guide' ? weight.guide / weight.primary : 1) * stroke;
    const dash = b.kind === 'guide' ? ` stroke-dasharray="${stroke * 4} ${stroke * 3}"` : '';
    if (b.kind === 'guide') {
      out.push(`<polygon points="${p(x0, y0, 0)} ${p(x1, y0, 0)} ${p(x1, y1, 0)} ${p(x0, y1, 0)}" fill="none" stroke="${ink}" stroke-width="${w}"${dash}/>`);
      continue;
    }
    // A faint wash on the roof and the two visible sides, then the outline.
    out.push(`<polygon points="${p(x0, y1, b.h)} ${p(x1, y1, b.h)} ${p(x1, y0, b.h)} ${p(x0, y0, b.h)}" fill="${colour.line}" fill-opacity="0.07"/>`);
    out.push(`<polygon points="${p(x0, y1, 0)} ${p(x1, y1, 0)} ${p(x1, y1, b.h)} ${p(x0, y1, b.h)}" fill="${colour.line}" fill-opacity="0.04"/>`);
    out.push(`<polygon points="${p(x1, y0, 0)} ${p(x1, y1, 0)} ${p(x1, y1, b.h)} ${p(x1, y0, b.h)}" fill="${colour.line}" fill-opacity="0.05"/>`);
    const edges = [
      [p(x0, y1, 0), p(x1, y1, 0)],
      [p(x1, y1, 0), p(x1, y0, 0)],
      [p(x0, y1, 0), p(x0, y1, b.h)],
      [p(x1, y1, 0), p(x1, y1, b.h)],
      [p(x1, y0, 0), p(x1, y0, b.h)],
      [p(x0, y0, b.h), p(x1, y0, b.h)],
      [p(x1, y0, b.h), p(x1, y1, b.h)],
      [p(x1, y1, b.h), p(x0, y1, b.h)],
      [p(x0, y1, b.h), p(x0, y0, b.h)],
    ];
    for (const [a, c] of edges) out.push(`<line x1="${a.split(',')[0]}" y1="${a.split(',')[1]}" x2="${c.split(',')[0]}" y2="${c.split(',')[1]}" stroke="${ink}" stroke-width="${w}" stroke-linecap="round"/>`);
  }
  if (pending) {
    const top = pending.lift;
    const [px, py] = p(pending.x, pending.y, top).split(',').map(Number);
    const [gx, gy] = p(pending.x, pending.y, 0).split(',').map(Number);
    out.push(`<line x1="${px}" y1="${py + scale * 0.6}" x2="${gx}" y2="${gy}" stroke="${colour.sun}" stroke-width="${stroke * 0.63}" stroke-dasharray="${stroke * 3} ${stroke * 2.5}"/>`);
    const s = 0.7;
    out.push(`<polygon points="${p(pending.x - s, pending.y + s, top + s)} ${p(pending.x + s, pending.y + s, top + s)} ${p(pending.x + s, pending.y - s, top + s)} ${p(pending.x - s, pending.y - s, top + s)}" fill="${colour.sun}"/>`);
    out.push(`<polygon points="${p(pending.x - s, pending.y + s, top - s)} ${p(pending.x + s, pending.y + s, top - s)} ${p(pending.x + s, pending.y + s, top + s)} ${p(pending.x - s, pending.y + s, top + s)}" fill="${colour.sun}" fill-opacity="0.78"/>`);
    out.push(`<polygon points="${p(pending.x + s, pending.y - s, top - s)} ${p(pending.x + s, pending.y + s, top - s)} ${p(pending.x + s, pending.y + s, top + s)} ${p(pending.x + s, pending.y - s, top + s)}" fill="${colour.sun}" fill-opacity="0.6"/>`);
  }
  // The drawing's extent, padded by a stroke so no line is clipped: x, y, width, height.
  const pad = stroke * 2;
  return { svg: out.join(''), box: [x0b - pad, y0b - pad, x1b - x0b + pad * 2, y1b - y0b + pad * 2] };
}

/** The Karpenter idea, drawn: the running nodes, the lot a pod is waiting for, the pod. */
export const KARPENTER_SKETCH: { boxes: IsoBox[]; pending: { x: number; y: number; lift: number } } = {
  boxes: [
    { x: 0, y: 0, w: 6, d: 4, h: 2.4 },
    { x: 7, y: 0, w: 5, d: 4, h: 2 },
    { x: 0, y: 5, w: 5, d: 4, h: 2 },
    { x: 6, y: 5, w: 6, d: 4, h: 2.6 },
    { x: 13, y: 0, w: 4, d: 4, h: 1.8, kind: 'field' },
    { x: 18.5, y: 0.5, w: 4, d: 4, h: 0, kind: 'guide' },
  ],
  pending: { x: 20.5, y: 2.5, lift: 5.2 },
};
