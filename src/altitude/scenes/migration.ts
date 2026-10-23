/**
 * Case-study scene: moving 2 TB onto Kubernetes while it stayed live
 * (/work/live-migration-to-kubernetes/). Facts from the page only: the source environment and
 * its databases (a dozen or so; the drawing shows a field of them, not a count), AWS DMS in two
 * stages, the Python automation around it, the structure check before and the row-count check
 * after, and one planned cutover. The counter stops at 2 TB, the published figure.
 *
 *   0.0-0.5  the site
 *   0.2-1.6  the source databases and the Kubernetes cluster
 *   1.3-1.7  before it starts: the target's structure is checked
 *   1.6-2.0  the DMS pipe and the Python automation that conducts it
 *   2.0-4.4  full load, then continuous replication: data streams across
 *   4.4-4.8  after it finishes: row counts compared
 *   5.0-5.8  one planned cutover moves the traffic across
 */
import type { LabelState } from '../engine/scene';
import { orbit, type SceneView } from './catalogue';
import { BUILD, FIELD, GUIDE, LINE, PlotScene, ramp, win } from './plot';
import type { Vec3 } from '../world';

export const BEATS = { structure: 1.3, pipe: 1.6, load: 2.0, replicate: 3.4, rows: 4.4, cutover: 5.0, end: 6.0 } as const;

export class MigrationScene extends PlotScene {
  readonly duration = BEATS.end;

  constructor(origin: Vec3 = [0, 0, 0]) {
    super(origin, [160, 96]);
    this.boundary();

    // The source: a field of databases on the old environment's plate.
    this.loop(
      [
        [-148, 0.25, -46],
        [-58, 0.25, -46],
        [-58, 0.25, 34],
        [-148, 0.25, 34],
      ],
      0.15,
      0.3,
      FIELD,
    );
    let k = 0;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++, k++) {
        this.box({ x: -135 + c * 21, z: -32 + r * 22, w: 13, d: 13, h: 5 + ((c + r) % 3) * 1.6 }, 0.2 + k * 0.05, 0.4, FIELD);
      }
    }

    // The target: a Kubernetes cluster, nodes with pods.
    this.loop(
      [
        [58, 0.25, -46],
        [150, 0.25, -46],
        [150, 0.25, 34],
        [58, 0.25, 34],
      ],
      0.55,
      0.3,
      FIELD,
    );
    const nodes = [
      [76, -30],
      [104, -30],
      [132, -30],
      [76, 0],
      [104, 0],
      [132, 0],
    ] as const;
    nodes.forEach(([x, z], i) => {
      this.box({ x, z, w: 22, d: 18, h: 8 }, 0.6 + i * 0.12, 0.45, LINE);
      for (let p = 0; p < 4; p++) this.solid([x - 7 + (p % 2) * 7, 8, z - 4 + Math.floor(p / 2) * 6], [2.4, 1.5, 2.4], 1.3 + i * 0.04 + p * 0.02);
    });
    // Before it starts: schemas, tables and constraints in place on the target.
    this.tick([150, 14, 22], 9, BEATS.structure, LINE);

    // AWS DMS: the pipe between them.
    const y = 6;
    this.box({ x: 0, z: -6, w: 110, d: 7, h: 7, y: y - 3.5 }, BEATS.pipe, 0.4, BUILD, false);
    // The Python automation conducting it, from one configuration.
    this.box({ x: 0, z: -40, w: 22, d: 12, h: 9 }, BEATS.pipe + 0.15, 0.35, LINE);
    this.line([-11, 9, -40], [-46, y + 3.5, -9], BEATS.pipe + 0.4, BEATS.pipe + 0.55, GUIDE);
    this.line([11, 9, -40], [46, y + 3.5, -9], BEATS.pipe + 0.45, BEATS.pipe + 0.6, GUIDE);
    // Data in transit: the full load, then the replication keeping the target in step.
    this.stream([-52, y, -6], [52, y, -6], [4.2, 3.4, 4.2], BEATS.load, BEATS.replicate, { count: 10, gap: 0.07, stay: 0.2 });
    this.stream([-52, y, -6], [52, y, -6], [2.6, 2.2, 2.6], BEATS.replicate, BEATS.cutover, { count: 10, gap: 0.12, stay: 0.16 });
    // After it finishes: row counts compared, table by table.
    this.tick([150, 14, -36], 9, BEATS.rows, LINE);

    // The traffic: to the source while it serves, then one planned cutover to the cluster.
    const users: Vec3 = [0, 0.4, 80];
    this.box({ x: 0, z: 80, w: 16, d: 10, h: 3 }, 0.4, 0.3, FIELD, false);
    this.path([users, [-60, 0.4, 80], [-103, 0.4, 34]], 0.9, 1.3, { ...LINE, out: [BEATS.cutover, BEATS.cutover + 0.3] });
    this.path([users, [60, 0.4, 80], [104, 0.4, 34]], BEATS.cutover + 0.3, BEATS.cutover + 0.7, LINE);

    this.anchors.dms = this.at([0, y + 3.5, -6]);
    this.build([0, 150, 320]);
  }

  labels(t: number): LabelState[] {
    // The counter is the drawing's own state and stops at the published figure.
    const tb = 2 * ramp(t, BEATS.load, BEATS.rows - 0.1);
    const copied = tb >= 2 ? '2 TB' : `${tb.toFixed(1)} TB`;
    return [
      this.label('source', [-148, 7, 34], 'source', win(t, 0.6, BEATS.end + 2), -40, 34),
      this.label('cluster', [150, 9, 34], 'Kubernetes', win(t, 1.0, BEATS.end + 2), 34, 30),
      this.label('structure', [150, 18, 22], 'structure', win(t, BEATS.structure + 0.15, BEATS.end + 2), 30, -10, { tick: 'checked' }),
      this.label('dms', [0, 9.5, -6], 'AWS DMS', win(t, BEATS.pipe + 0.3, BEATS.end + 2), 26, -46, { tick: copied }),
      this.label('python', [0, 9, -40], 'Python', win(t, BEATS.pipe + 0.4, BEATS.end + 2), -30, -44),
      this.label('rows', [150, 18, -36], 'row counts', win(t, BEATS.rows + 0.15, BEATS.end + 2), 30, -24, { tick: 'compared' }),
      this.label('cutover', [60, 0.4, 80], 'planned cutover', win(t, BEATS.cutover + 0.4, BEATS.end + 2), 30, 24),
    ];
  }
}

export const view: SceneView = orbit([2, 4, 14], 350);
export const create = (origin?: Vec3) => new MigrationScene(origin);
