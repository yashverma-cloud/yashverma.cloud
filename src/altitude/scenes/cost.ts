/**
 * Case-study scene: cutting 40% off the monthly cloud bill (/work/cloud-cost-optimisation/).
 * Facts from the page only: rightsizing, HPA (the mechanism line), the 40% figure. Amber is
 * the idle capacity the oversized nodes carried before rightsizing.
 *
 *   0.0-0.5  the site
 *   0.2-1.4  oversized nodes draw; pods fill part of each
 *   1.6-2.2  their idle capacity shows, in amber
 *   2.4-3.2  rightsizing: each node is redrawn to fit its pods; the amber lifts
 *   3.2-4.6  HPA: replicas follow a load curve up and down
 *   4.6-5.6  the bill meter falls by 40%
 */
import type { LabelState } from '../engine/scene';
import type { SceneView } from './catalogue';
import { AMBER, BUILD, FIELD, GUIDE, LINE, PlotScene, win } from './plot';
import type { Vec3 } from '../world';

export const BEATS = { idle: 1.6, rightsize: 2.4, hpa: 3.2, bill: 4.6, end: 5.8 } as const;

const NODES = [-96, -48, 0, 48, 96];
const BIG = { w: 34, d: 20, h: 11 };
const FIT = { w: 17, d: 20, h: 11 };
const POD = 2.6;

export class CostScene extends PlotScene {
  readonly duration = BEATS.end;
  private readonly curve: Vec3[] = [];

  constructor(origin: Vec3 = [0, 0, 0]) {
    super(origin, [150, 92]);
    this.boundary();
    // Oversized nodes, their pods packed into the left half of each roof.
    NODES.forEach((x, i) => {
      const t = 0.2 + i * 0.18;
      const left = x - BIG.w / 2;
      this.box({ x, z: -12, w: BIG.w, d: BIG.d, h: BIG.h }, t, 0.55, { ...LINE, out: [BEATS.rightsize, BEATS.rightsize + 0.35] });
      // The idle half: what the node is paid for and nothing runs on.
      this.box(
        { x: left + FIT.w + (BIG.w - FIT.w) / 2, z: -12, w: BIG.w - FIT.w - 1.2, d: BIG.d - 1.2, h: BIG.h - 0.6 },
        BEATS.idle + i * 0.06,
        0.35,
        { ...AMBER, out: [BEATS.rightsize, BEATS.rightsize + 0.3] },
      );
      // Rightsized: the same pods, a node that fits them.
      this.box({ x: left + FIT.w / 2, z: -12, w: FIT.w, d: FIT.d, h: FIT.h }, BEATS.rightsize + 0.1 + i * 0.1, 0.45, LINE);
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 3; c++) {
          if ((r * 3 + c) % 5 === 4) continue;
          this.solid([left + 3.4 + c * 4.6, BIG.h, -12 - BIG.d / 2 + 3.6 + r * 4.4], [POD, 1.6, POD], t + 0.6 + (r * 3 + c) * 0.025);
        }
      }
    });

    // HPA: a load curve drawn on a board behind the nodes, replicas in front following it.
    const board = { x0: -120, x1: 72, y0: 3, y1: 34, z: -62 };
    this.loop(
      [
        [board.x0, board.y0, board.z],
        [board.x1, board.y0, board.z],
        [board.x1, board.y1, board.z],
        [board.x0, board.y1, board.z],
      ],
      BEATS.hpa - 0.2,
      0.3,
      { ...GUIDE, dash: 'solid' },
    );
    const load = (f: number) => 0.18 + 0.72 * Math.sin(Math.PI * Math.min(1, Math.max(0, (f - 0.08) / 0.84))) ** 1.4;
    for (let i = 0; i <= 40; i++) {
      const f = i / 40;
      this.curve.push([board.x0 + 4 + f * (board.x1 - board.x0 - 8), board.y0 + 2 + load(f) * (board.y1 - board.y0 - 6), board.z + 0.3]);
    }
    this.path(this.curve, BEATS.hpa, BEATS.hpa + 1.3, LINE);
    // Eight replica slots: slot k runs while the load is above k/8.
    for (let k = 0; k < 8; k++) {
      const level = (k + 0.5) / 8;
      let on = -1;
      let off = -1;
      for (let i = 0; i <= 200; i++) {
        const f = i / 200;
        const l = load(f);
        const time = BEATS.hpa + f * 1.3;
        if (on < 0 && l >= level * 0.9 + 0.08) on = time;
        if (on >= 0 && off < 0 && l < level * 0.9 + 0.08 && f > 0.5) off = time;
      }
      if (on < 0) continue;
      this.solid([-118 + k * 6.2, 1.2, 38], [3.4, 2.4, 3.4], on, off > 0 ? off : undefined);
    }
    this.loop(
      [
        [-123, 0.25, 33],
        [-70, 0.25, 33],
        [-70, 0.25, 43],
        [-123, 0.25, 43],
      ],
      BEATS.hpa - 0.1,
      0.3,
      FIELD,
    );

    // The bill meter: a column that is lifted and redrawn at 60% of its height.
    const meter = { x: 122, z: 30, w: 12, d: 12 };
    this.box({ ...meter, h: 46 }, 0.9, 0.5, { ...BUILD, out: [BEATS.bill, BEATS.bill + 0.3] }, true);
    this.box({ ...meter, h: 46 * 0.6 }, BEATS.bill + 0.2, 0.5, LINE, true);
    this.line([meter.x + 9, 46, meter.z], [meter.x + 9, 46 * 0.6, meter.z], BEATS.bill + 0.6, BEATS.bill + 0.85, BUILD);

    this.anchors.idle = this.at([NODES[4] + 8, BIG.h, -12 - BIG.d / 2]);
    this.anchors.fit = this.at([NODES[0] - BIG.w / 2, FIT.h, -12 + BIG.d / 2]);
    this.anchors.hpa = this.at([board.x1, board.y1, board.z]);
    this.anchors.bill = this.at([meter.x + meter.w / 2, 46 * 0.6, meter.z]);
    this.build([0, 160, 320]);
  }

  labels(t: number): LabelState[] {
    // State words only: the replica count is the drawing's, not a published figure, so no counter.
    return [
      this.label('idle', [NODES[4] + 8, BIG.h, -12 - BIG.d / 2], 'idle capacity', win(t, BEATS.idle + 0.2, BEATS.rightsize + 0.2), 40, -28, { amber: true }),
      this.label('fit', [NODES[0] - BIG.w / 2, FIT.h, -12 + BIG.d / 2], 'rightsized', win(t, BEATS.rightsize + 0.5, BEATS.end + 2), -150, 26),
      this.label('hpa', [-72, 26, -62], 'HPA replicas', win(t, BEATS.hpa + 0.3, BEATS.end + 2), 30, -30),
      this.label('bill', [128, 27.6, 30], 'monthly bill', win(t, BEATS.bill + 0.5, BEATS.end + 2), 38, -18, { tick: '−40%' }),
    ];
  }
}

export const view: SceneView = { target: [0, 6, -4], from: [70, 150, 300], to: [60, 112, 238], dawn: 0.92 };
export const create = (origin?: Vec3) => new CostScene(origin);
