/**
 * The cluster's geometry and at-rest state — one source of truth.
 *
 * The static poster (ClusterPoster.astro), the hero HUD and, in Phase 3, the Three.js
 * scene all read from here. If the WebGL camera does not match `project()` exactly, the
 * poster-to-canvas crossfade will visibly jump, so this file is the contract between them.
 */

// --- Axonometric projection --------------------------------------------------
export const SCALE = 38; // world unit -> px
const KX = 0.866 * SCALE;
const KY = 0.5 * SCALE;

export type Point = { x: number; y: number };

/** Rounded to 0.1px: sub-tenth precision is invisible and only bloats attributes. */
const r = (n: number): number => Math.round(n * 10) / 10;

export function project(x: number, y: number, z = 0): Point {
  return { x: r((x - y) * KX), y: r((x + y) * KY - z * SCALE) };
}

const fmt = (ps: Point[]): string => ps.map((p) => `${p.x},${p.y}`).join(' ');

/** Flat tile in the ground plane, centred on (cx, cy) with half-extent h. */
function tilePoints(cx: number, cy: number, h: number, z = 0): Point[] {
  return [
    project(cx - h, cy - h, z),
    project(cx + h, cy - h, z),
    project(cx + h, cy + h, z),
    project(cx - h, cy + h, z),
  ];
}

/** A box as its three visible faces. */
function boxFaces(cx: number, cy: number, h: number, height: number) {
  return {
    top: tilePoints(cx, cy, h, height),
    left: [
      project(cx - h, cy - h, height),
      project(cx - h, cy + h, height),
      project(cx - h, cy + h, 0),
      project(cx - h, cy - h, 0),
    ],
    right: [
      project(cx - h, cy + h, height),
      project(cx + h, cy + h, height),
      project(cx + h, cy + h, 0),
      project(cx - h, cy + h, 0),
    ],
  };
}

// --- Layout ------------------------------------------------------------------
// Zones sit on the (x, -y) diagonal so they read as a horizontal row on screen.
export const ZONES = [
  { id: 'a', d: -2.25, pods: [3, 3, 3] },
  { id: 'b', d: 0, pods: [3, 3, 3] },
  { id: 'c', d: 2.25, pods: [2, 2, 2] },
] as const;

export const NODE_OFFSETS = [-0.52, 0, 0.52] as const;
const PLATE_H = 1;
const NODE_H = 0.26;
const NODE_Z = 0.34;
const POD_H = 0.062;
const POD_Z = 0.1;

/** Four capacity slots per node, as a 2x2 on the node's top face. Spaced so adjacent
 *  pods stay visually separate rather than merging into one block. */
export const POD_SLOT_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-0.12, -0.12],
  [0.12, -0.12],
  [-0.12, 0.12],
  [0.12, 0.12],
];
export const POD_CAPACITY = POD_SLOT_OFFSETS.length;
export const INGRESS = { cx: -0.35, cy: -3.4, h: 0.62 } as const;

// --- Scene -------------------------------------------------------------------
const track: Point[] = [];
const keep = (ps: Point[]): Point[] => {
  track.push(...ps);
  return ps;
};

export const scene = {
  ingress: (() => {
    const tile = keep(tilePoints(INGRESS.cx, INGRESS.cy, INGRESS.h));
    return {
      tile: fmt(tile),
      out: project(INGRESS.cx, INGRESS.cy + INGRESS.h),
      label: project(INGRESS.cx, INGRESS.cy - INGRESS.h),
    };
  })(),

  zones: ZONES.map((zone) => {
    const cx = zone.d;
    const cy = -zone.d;
    const plate = keep(tilePoints(cx, cy, PLATE_H));

    const nodes = NODE_OFFSETS.map((offset, slot) => {
      const nx = cx + offset;
      const ny = cy - offset;
      const faces = boxFaces(nx, ny, NODE_H, NODE_Z);
      keep(faces.top);
      keep(faces.left);
      keep(faces.right);
      // Fixed capacity slots rather than positions derived from the current count:
      // filled slots read as running pods, empty ones as spare capacity, and the
      // renderers only have to toggle visibility when pods move.
      const podSlots = POD_SLOT_OFFSETS.map(([dx, dy]) =>
        fmt(tilePoints(nx + dx, ny + dy, POD_H, NODE_Z + POD_Z)),
      );
      // Invisible tap target: the node's own column of its plate. Nodes sit edge to edge,
      // so the width cannot pass the node pitch without overlapping a neighbour, but the
      // height can run the full plate — on a phone, ~58px instead of the box's ~25px.
      const ground = project(nx, ny);
      const pitch = 2 * (NODE_OFFSETS[1] - NODE_OFFSETS[0]) * KX;
      const reach = 2 * PLATE_H * KY;
      return {
        /** Matches the simulation's node ids. */
        id: `${zone.id}-${slot}`,
        top: fmt(faces.top),
        left: fmt(faces.left),
        right: fmt(faces.right),
        hit: { x: r(ground.x - pitch / 2), y: r(ground.y - reach), w: r(pitch), h: r(2 * reach) },
        podSlots,
        podsAtRest: zone.pods[slot] ?? 0,
      };
    });

    return {
      id: zone.id,
      plate: fmt(plate),
      /** Bottom vertex of the plate — labels hang below it, centred. */
      label: project(cx + PLATE_H, cy + PLATE_H),
      /** Top vertex — where the ingress link lands. */
      top: project(cx, cy - PLATE_H),
      nodes,
    };
  }),
};

// --- View box ----------------------------------------------------------------
// Computed from what is actually drawn, so the artwork fills its column instead of
// floating inside a box of guessed padding. PAD leaves room for the text labels.
const PAD = { x: 14, top: 22, bottom: 26 };
const xs = track.map((p) => p.x);
const ys = track.map((p) => p.y);
const minX = Math.min(...xs) - PAD.x;
const minY = Math.min(...ys) - PAD.top;
const width = Math.max(...xs) + PAD.x - minX;
const height = Math.max(...ys) + PAD.bottom - minY;

export const VIEWBOX = {
  x: r(minX),
  y: r(minY),
  w: r(width),
  h: r(height),
} as const;

export const VIEWBOX_ATTR = `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`;

// --- At-rest state -----------------------------------------------------------
// The HUD renders these, so its figures can never drift from what is drawn.
export const NODE_COUNT = ZONES.length * NODE_OFFSETS.length;
export const POD_COUNT = ZONES.reduce(
  (total, zone) => total + zone.pods.reduce((a, b) => a + b, 0),
  0,
);

export const SCENE_LABEL =
  `Isometric blueprint of a ${NODE_COUNT}-node Kubernetes cluster across three ` +
  `availability zones, serving traffic from an ingress.`;
