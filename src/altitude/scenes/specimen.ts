/**
 * The drawing kit's specimen, for the style guide: every primitive the case-study scenes are
 * drawn with, in the order a plotter draws them. Boxes in the four weights, a dash-dot
 * boundary, a dashed guide for something that does not exist yet, faint washes, solid pods,
 * and the one amber state: a pod that cannot be placed, on its plumb line.
 *
 *   0.0-0.5  the boundary
 *   0.3-2.0  the boxes, primary first, round the footprint, up the corners, across the roof
 *   2.0-2.6  pods land on the roofs
 *   2.6-3.2  the guide for the box that does not exist yet; the amber pod waits over it
 */
import { Group } from 'three';
import type { DrawingScene } from '../engine/scene';
import { FillLayer, INK, ORDER, plotBox, plotLoop, SolidLayer, StrokeLayer, WEIGHT, type Stroke } from '../engine/kit';
import type { CameraState, Vec3 } from '../world';

export const SPECIMEN_END = 4;

export class SpecimenScene implements DrawingScene {
  readonly group = new Group();
  readonly anchors: Record<string, Vec3>;
  readonly duration = SPECIMEN_END;
  private readonly strokes: StrokeLayer;
  private readonly fills: FillLayer;
  private readonly pods: SolidLayer;
  private readonly pending: SolidLayer;

  constructor() {
    const boxes = [
      { x: -27, z: -4, w: 18, d: 12, h: 8, weight: WEIGHT.primary, t: 0.3 },
      { x: -4, z: -4, w: 14, d: 12, h: 6, weight: WEIGHT.secondary, t: 0.75 },
      { x: 16, z: -4, w: 12, d: 12, h: 5, weight: WEIGHT.construction, t: 1.2 },
    ];
    const strokes: Stroke[] = [];
    // The boundary first: dash-dot, as on a site plan.
    strokes.push(
      ...plotLoop(
        [
          [-42, 0.2, -18],
          [42, 0.2, -18],
          [42, 0.2, 18],
          [-42, 0.2, 18],
        ],
        0,
        0.5,
        { color: INK.line, width: WEIGHT.construction, dash: 'dashdot', period: 6 },
      ),
    );
    for (const b of boxes) strokes.push(...plotBox(b, b.t, 0.6, b.weight));
    // A thing that does not exist yet: its footprint as a dashed guide.
    const g = { x: 34, z: -4, w: 8, d: 8 };
    strokes.push(
      ...plotLoop(
        [
          [g.x - g.w / 2, 0.25, g.z - g.d / 2],
          [g.x + g.w / 2, 0.25, g.z - g.d / 2],
          [g.x + g.w / 2, 0.25, g.z + g.d / 2],
          [g.x - g.w / 2, 0.25, g.z + g.d / 2],
        ],
        2.6,
        0.3,
        { color: INK.signal, width: WEIGHT.guide, dash: 'dash', period: 2.2 },
      ),
    );
    const pod: Vec3 = [g.x, 9, g.z];
    strokes.push({ a: [pod[0], pod[1] - 1, pod[2]], b: [pod[0], 0.25, pod[2]], t0: 2.9, t1: 3.15, color: INK.signal, width: WEIGHT.construction, dash: 'dash', period: 1.6 });
    // A leader from the primary box's roof, where its label hangs.
    strokes.push({ a: [-27, 8.2, -10], b: [-27, 14, -10], t0: 1.0, t1: 1.15, color: INK.line, width: WEIGHT.guide });
    this.strokes = new StrokeLayer(strokes);
    this.fills = new FillLayer(boxes.map((b) => ({ ...b, y: 0, t: b.t, dur: 0.6 })));

    const pods: { pos: Vec3; size: Vec3; t: number }[] = [];
    boxes.forEach((b, i) => {
      for (let k = 0; k < 3 - i; k++) pods.push({ pos: [b.x - b.w / 2 + 3 + k * 3.6, b.h, b.z], size: [2, 1.4, 2], t: 2.0 + i * 0.12 + k * 0.05 });
    });
    const viewpoint: Vec3 = [0, 60, 120];
    this.pods = new SolidLayer(pods, INK.line.map((v) => v * 0.86) as Vec3, viewpoint);
    this.pending = new SolidLayer([{ pos: [pod[0], pod[1] - 0.8, pod[2]], size: [2.2, 1.6, 2.2], t: 2.85 }], INK.signal, viewpoint, ORDER.focus);
    this.group.add(this.fills.mesh, this.strokes.mesh, this.pods.mesh, this.pending.mesh);
    this.anchors = { primary: [-27, 14, -10], pending: pod, guide: [g.x + g.w / 2, 0.3, g.z + g.d / 2] };
  }

  setViewport(w: number, h: number, dpr: number, near: number): void {
    this.strokes.setViewport(w, h, dpr, near);
  }

  update(t: number, _camera?: CameraState): void {
    this.strokes.setTime(t);
    this.fills.setTime(t);
    this.pods.setTime(t);
    this.pending.setTime(t);
  }

  dispose(): void {
    this.strokes.dispose();
    this.fills.dispose();
    this.pods.dispose();
    this.pending.dispose();
  }
}
