/**
 * The monogram: a Y inside a V (Yash inside Verma), drawn as linework on a 32-unit grid. Read
 * top down, the V is a descent chevron. The one definition for the site's inline mark and for
 * every identity file (scripts/system/identity.mjs).
 */
export const MONOGRAM = {
  grid: 32,
  v: [[2.5, 5], [16, 28.5], [29.5, 5]],
  arms: [[11.2, 5], [16, 13.2], [20.8, 5]],
  stem: [[16, 13.2], [16, 19.8]],
  /** Stroke for 16 px up; the fine stroke is for 120 px up, where the heavy one looks blunt. */
  stroke: 2.75,
  fine: 1.5,
};

const points = (line) => line.map((p) => p.join(',')).join(' ');

/** The monogram's linework as SVG <polyline> elements, stroked in `color`. */
export function monogramPaths(color = 'currentColor', stroke = MONOGRAM.stroke) {
  const attrs = `fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linejoin="miter" stroke-linecap="butt" stroke-miterlimit="12"`;
  return [MONOGRAM.v, MONOGRAM.arms, MONOGRAM.stem].map((l) => `<polyline points="${points(l)}" ${attrs}/>`).join('');
}
