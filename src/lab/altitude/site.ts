/**
 * The site plan for the case-study drawing: rows of nodes in four sizes, the running cluster
 * in the middle, and the empty lot the pending pod is waiting for. Deterministic, so every
 * device and every poster draws the same plan. No three.js here: world.ts aims the camera
 * at the lot.
 */
import type { Vec3 } from './world';

/** The case-study timeline inside the reveal: beat boundaries in scene seconds. */
export const BEATS = {
  /** A pod arrives that fits nowhere. */
  pending: 0,
  /** Karpenter draws a node for it. */
  provision: 1,
  /** The node is ready and the pod lands. */
  ready: 2.2,
  /** Under load the field grows past 100 nodes. */
  scale: 3,
  /** Everything drawn. */
  end: 5,
} as const;


export interface NodeBox {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** When the node starts drawing, and how long it takes. */
  t: number;
  dur: number;
  pods: number;
  group: 'initial' | 'new' | 'scale';
}

/** Deterministic random, so the drawing is identical on every device and in every poster. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Lays out the site: rows of nodes in four sizes, the initial cluster in the middle. */
export function layout(): { nodes: NodeBox[]; newNode: NodeBox; pendingPod: Vec3 } {
  const rand = rng(1931);
  const sizes = [
    { w: 12, d: 9, h: 5 },
    { w: 16, d: 11, h: 6 },
    { w: 20, d: 12, h: 7 },
    { w: 26, d: 13, h: 8.5 },
  ];
  const nodes: NodeBox[] = [];
  const rows = 10;
  const pitch = 20;
  const x0 = -158;
  const x1 = 158;
  for (let r = 0; r < rows; r++) {
    const zc = -90 + r * pitch;
    let x = x0 + rand() * 6;
    while (x < x1) {
      const s = sizes[Math.floor(rand() * sizes.length)];
      if (x + s.w > x1) break;
      nodes.push({
        x: x + s.w / 2,
        z: zc,
        w: s.w,
        d: s.d,
        h: s.h,
        t: 0,
        dur: 0,
        pods: 0,
        group: 'scale',
      });
      x += s.w + 4 + rand() * 3;
    }
  }
  // The running cluster: the six nodes nearest the middle of the plateau.
  const byCentre = [...nodes].sort(
    (a, b) => Math.hypot(a.x, a.z + 10) - Math.hypot(b.x, b.z + 10),
  );
  const initial = byCentre.slice(0, 7);
  // The pending pod's node takes the lot just east of the cluster.
  const newNode = initial.reduce((best, n) => (n.x > best.x ? n : best), initial[0]);
  for (const n of initial) {
    n.group = n === newNode ? 'new' : 'initial';
  }
  initial.forEach((n, i) => {
    if (n.group === 'initial') {
      n.t = 0.05 + i * 0.07;
      n.dur = 0.45;
    }
  });
  newNode.t = BEATS.provision;
  newNode.dur = BEATS.ready - BEATS.provision;
  // The rest grow outwards from the middle, in waves, under load.
  const span = BEATS.end - 0.2 - BEATS.scale;
  const rest = nodes.filter((n) => n.group === 'scale');
  const maxDist = Math.max(...rest.map((n) => Math.hypot(n.x, n.z)));
  for (const n of rest) {
    const d = Math.hypot(n.x, n.z) / maxDist;
    n.t = BEATS.scale + d * span * 0.82 + rand() * 0.12;
    n.dur = 0.32;
  }
  for (const n of nodes) {
    const cap = Math.floor((n.w - 3) / 3.4) * Math.floor((n.d - 3) / 3.4);
    const fill = n.group === 'new' ? 0 : 0.55 + rand() * 0.4;
    n.pods = Math.max(1, Math.round(cap * fill));
  }
  const pendingPod: Vec3 = [newNode.x - newNode.w / 2 + 3.2, newNode.h + 18, newNode.z - newNode.d / 2 + 3.2];
  return { nodes, newNode, pendingPod };
}

