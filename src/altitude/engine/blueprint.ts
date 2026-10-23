/**
 * The case study, drawn: Karpenter keeping up with load, as white plotter linework on the
 * survey sheet. Structure from /work/karpenter-autoscaling; nothing here is a measurement.
 * Built from the drawing kit (kit.ts), which keeps the linework steady while the camera moves.
 *
 *   0.0–0.7  the running cluster draws itself in as the cloud breaks
 *   0.8      a pod arrives that fits no node (amber: the one warm colour, for the pending state)
 *   1.0–2.2  Karpenter provisions a node for it, edge by edge
 *   2.2–2.5  the node is ready and the pod lands on it
 *   3.0–4.8  under load the field grows past 100 nodes, from the middle out
 */
import { Group } from 'three';
import type { Vec3 } from '../world';
import { BEATS, layout, type NodeBox } from '../site';
import { FillLayer, INK, ORDER, plotBox, plotLoop, SolidLayer, StrokeLayer, WEIGHT, type Stroke } from './kit';

const POD = { w: 1.9, h: 1.3, pitch: 3.4, inset: 3.2 } as const;
const PENDING = { w: 2.1, h: 1.5 } as const;

export class Blueprint {
  readonly group = new Group();
  readonly anchors: { pending: Vec3; node: Vec3; field: Vec3; site: Vec3 };
  readonly nodeCount: number;
  readonly nodes: NodeBox[];
  private readonly strokes: StrokeLayer;
  private readonly fills: FillLayer;
  private readonly pods: SolidLayer;
  private readonly pending: SolidLayer;
  private readonly pendingStart: Vec3;
  private readonly pendingEnd: Vec3;
  private time = 0;

  constructor() {
    const { nodes, newNode, pendingPod } = layout();
    this.nodes = nodes;
    this.nodeCount = nodes.length;

    const strokes: Stroke[] = [];
    for (const n of nodes) {
      strokes.push(...plotBox(n, n.t, n.dur, n.group === 'scale' ? WEIGHT.secondary : WEIGHT.primary));
    }
    // The site boundary, dash-dot, drawn with the first nodes.
    const b = { x0: -166, x1: 166, z0: -104, z1: 104 };
    strokes.push(
      ...plotLoop(
        [
          [b.x0, 0.2, b.z0],
          [b.x1, 0.2, b.z0],
          [b.x1, 0.2, b.z1],
          [b.x0, 0.2, b.z1],
        ],
        0,
        0.48,
        { color: INK.line, width: WEIGHT.construction, dash: 'dashdot', period: 8.3 },
      ),
    );
    // Pending: a plumb line from the waiting pod down to the empty lot, lifted when it lands.
    const landed: [number, number] = [BEATS.ready, BEATS.ready + 0.3];
    strokes.push({
      a: [pendingPod[0], pendingPod[1] - 1.4, pendingPod[2]],
      b: [pendingPod[0], 0.2, pendingPod[2]],
      t0: BEATS.pending + 0.85,
      t1: BEATS.pending + 1.0,
      out: landed,
      color: INK.signal,
      width: WEIGHT.construction,
      dash: 'dash',
      period: 2.9,
    });
    // The empty lot, outlined in amber until the node's own footprint is drawn around it.
    const lx0 = newNode.x - newNode.w / 2;
    const lx1 = newNode.x + newNode.w / 2;
    const lz0 = newNode.z - newNode.d / 2;
    const lz1 = newNode.z + newNode.d / 2;
    strokes.push(
      ...plotLoop(
        [
          [lx0, 0.25, lz0],
          [lx1, 0.25, lz0],
          [lx1, 0.25, lz1],
          [lx0, 0.25, lz1],
        ],
        0.9,
        0.16,
        {
          color: INK.signal,
          width: WEIGHT.guide,
          dash: 'dash',
          period: 4.2,
          out: [newNode.t + newNode.dur * 0.3, newNode.t + newNode.dur * 0.42],
        },
      ),
    );
    this.strokes = new StrokeLayer(strokes);

    // Node faces: faint washes that arrive once the edges are closed.
    this.fills = new FillLayer(nodes.map((n) => ({ ...n, y: 0 })));

    // Pods: small solid blocks on the roofs, arriving just after their node.
    const pods: { pos: Vec3; size: Vec3; t: number }[] = [];
    for (const n of nodes) {
      const cols = Math.floor((n.w - 3) / POD.pitch);
      const rows = Math.floor((n.d - 3) / POD.pitch);
      let k = 0;
      for (let r = 0; r < rows && k < n.pods; r++) {
        for (let c = 0; c < cols && k < n.pods; c++, k++) {
          pods.push({
            pos: [n.x - n.w / 2 + POD.inset + c * POD.pitch, n.h, n.z - n.d / 2 + POD.inset + r * POD.pitch],
            size: [POD.w, POD.h, POD.w],
            t: n.t + n.dur + 0.04 + k * 0.012,
          });
        }
      }
    }
    // Back to front from where the camera watches the reveal: it stays south of the field.
    const viewpoint: Vec3 = [newNode.x + 30, 120, newNode.z + 260];
    this.pods = new SolidLayer(pods, INK.line.map((v) => v * 0.86) as Vec3, viewpoint);
    this.pods.mesh.name = 'pods';

    // The pending pod: amber while it waits, white once it has landed. Drawn last.
    this.pending = new SolidLayer([{ pos: [0, 0, 0], size: [PENDING.w, PENDING.h, PENDING.w], t: -1 }], INK.signal, viewpoint, ORDER.focus);
    this.pending.mesh.name = 'pending';
    this.pendingStart = [pendingPod[0], pendingPod[1] - PENDING.h / 2, pendingPod[2]];
    this.pendingEnd = [pendingPod[0], newNode.h + 0.05, pendingPod[2]];

    this.group.add(this.fills.mesh, this.strokes.mesh, this.pods.mesh, this.pending.mesh);
    this.anchors = {
      pending: pendingPod,
      node: [newNode.x + newNode.w / 2, newNode.h, newNode.z - newNode.d / 2],
      field: [150, 9, -96],
      site: [-166, 0, 104],
    };
    this.update(0, 0);
  }

  setViewport(w: number, h: number, dpr: number, near: number): void {
    this.strokes.setViewport(w, h, dpr, near);
  }

  /** Nodes fully drawn by scene time t: the live figure for the node counter. */
  drawnNodes(t: number): number {
    let k = 0;
    for (const n of this.nodes) if (t >= n.t + n.dur) k++;
    return k;
  }

  update(t: number, cameraY: number): void {
    this.time = t;
    this.group.visible = cameraY < 2200;
    this.strokes.setTime(t);
    this.fills.setTime(t);
    this.pods.setTime(t);
    this.pending.mesh.visible = t >= BEATS.pending + 0.75;
    // Hover while waiting, then settle onto the new node once it is ready.
    const land = Math.min(1, Math.max(0, (t - BEATS.ready) / 0.3));
    const e = land * land * (3 - 2 * land);
    const bob = land > 0 ? 0 : Math.sin(t * 9) * 0.25;
    this.pending.mesh.position.set(
      this.pendingStart[0],
      this.pendingStart[1] + (this.pendingEnd[1] - this.pendingStart[1]) * e + bob,
      this.pendingStart[2],
    );
    this.pending.setColor(land >= 1 ? INK.line : INK.signal);
  }

  get sceneTime(): number {
    return this.time;
  }

  dispose(): void {
    this.strokes.dispose();
    this.fills.dispose();
    this.pods.dispose();
    this.pending.dispose();
  }
}
