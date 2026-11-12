/**
 * Case-study scene: scaling on sessions when average utilisation lies (/work/scaling-on-sessions/).
 * Facts from the page only: each session stays on one pod, so load gathers on a few pods while
 * the average stays comfortable; VPA sizes the pods with headroom; a per-pod session cap bounds
 * them; KEDA scales on active sessions with its target below the cap, so a new pod arrives
 * before the others fill. No values: the cap and the target are lines, not numbers. The page
 * describes no failure, so the drawing has no amber; a pod that is not there yet is dashed.
 *
 *   0.0-0.8  the site and the pods
 *   0.8-1.6  uneven load: one pod carries most of it; the average line sits low
 *   2.2-2.9  VPA redraws the pods taller; the busiest pod has headroom
 *   2.9-3.5  the session cap round every pod; load grows toward KEDA's target
 *   3.9-4.8  a new pod starts (dashed) and is ready before the others reach the cap
 *   4.8-6.0  load spread under the target; the next pod arrives early again
 */
import type { LabelState } from '../engine/scene';
import { BUILD, FIELD, GUIDE, LINE, PlotScene, win, type StrokeStyle } from './plot';
import type { Vec3 } from '../world';

export const BEATS = {
  load: 0.8,
  vpa: 2.2,
  cap: 2.9,
  grow: 3.3,
  keda: 3.6,
  ready: 4.4,
  result: 4.8,
  more: 5.1,
  ready2: 5.5,
  end: 6.0,
} as const;

/** The deployment's pods, and the two KEDA adds, along x. */
const PODS = [-96, -50, -4, 42];
const NEW = [88, 134];
const BUSY = 1;
const POD = { w: 28, d: 28 };
const FILL = { w: 19, d: 19 };
/** Heights: the pod before and after VPA, the session cap, KEDA's target. Drawing only. */
const H0 = 22;
const H1 = 34;
const CAP = 27;
const TARGET = 18;
/** Where sessions come in from. */
const ENTRY: [Vec3, Vec3] = [
  [-158, 4, 0],
  [-114, 4, 0],
];

export class SessionsScene extends PlotScene {
  readonly duration = BEATS.end;

  constructor(origin: Vec3 = [0, 0, 0]) {
    super(origin, [172, 56]);
    this.boundary();

    // The pods, at their first size, until VPA redraws them taller.
    PODS.forEach((x, i) => this.box({ x, z: 0, ...POD, h: H0 }, 0.2 + i * 0.08, 0.4, { ...LINE, out: [BEATS.vpa + i * 0.06, BEATS.vpa + i * 0.06 + 0.25] }));

    // Uneven load: each pod's sessions as a fill; the busiest one close to its roof.
    [6, 19, 5, 8].forEach((h, i) => this.fill(PODS[i], h, BEATS.load + i * 0.06, [BEATS.grow + i * 0.05, BEATS.grow + i * 0.05 + 0.15]));
    // The average across the deployment, low on the front faces.
    this.line([PODS[0] - POD.w / 2 - 6, 8, POD.d / 2 + 0.6], [PODS[3] + POD.w / 2 + 6, 8, POD.d / 2 + 0.6], BEATS.load + 0.35, BEATS.load + 0.55, {
      ...BUILD,
      out: [BEATS.vpa, BEATS.vpa + 0.2],
    });

    // VPA: the pods redrawn taller, so the busiest one has headroom.
    PODS.forEach((x, i) => this.box({ x, z: 0, ...POD, h: H1 }, BEATS.vpa + 0.1 + i * 0.06, 0.4, LINE));

    // The session cap round every pod, then KEDA's target under it; load grows toward the target.
    PODS.forEach((x, i) => this.ring(x, CAP, BEATS.cap + i * 0.05));
    [16, 17, 15, 16].forEach((h, i) => this.fill(PODS[i], h, BEATS.grow + 0.1 + i * 0.05, [BEATS.result, BEATS.result + 0.15]));
    PODS.forEach((x, i) => this.ring(x, TARGET, BEATS.keda + i * 0.05, GUIDE));

    // A pod that is not there yet, then ready, with its own lines, before the others reach the cap.
    this.newPod(NEW[0], BEATS.keda + 0.3, BEATS.ready);
    this.fill(NEW[0], 7, BEATS.ready + 0.35, [BEATS.result, BEATS.result + 0.15]);

    // Load spread under the target; as it nears the target, the next pod is already on its way.
    [14, 13, 14, 12].forEach((h, i) => this.fill(PODS[i], h, BEATS.result + 0.15 + i * 0.05));
    this.fill(NEW[0], 12, BEATS.result + 0.35);
    this.newPod(NEW[1], BEATS.more, BEATS.ready2);
    this.fill(NEW[1], 6, BEATS.ready2 + 0.35);

    // Sessions coming in throughout.
    this.stream(ENTRY[0], ENTRY[1], [3, 2.2, 3], BEATS.load - 0.1, BEATS.end - 0.2, { count: 4, gap: 0.1, stay: 0.14 });

    this.build([0, 150, 320]);
  }

  /** A pod's sessions: a box inside its footprint, as tall as its load. */
  private fill(x: number, h: number, t: number, out?: [number, number], style: StrokeStyle = FIELD): void {
    this.box({ x, z: 0, ...FILL, h }, t, 0.28, { ...style, out });
  }

  /** A line round a pod at height `y`: the cap, or KEDA's target. */
  private ring(x: number, y: number, t: number, style: StrokeStyle = BUILD): void {
    const hx = POD.w / 2 + 1.2;
    const hz = POD.d / 2 + 1.2;
    this.loop(
      [
        [x - hx, y, -hz],
        [x + hx, y, -hz],
        [x + hx, y, hz],
        [x - hx, y, hz],
      ],
      t,
      0.25,
      style,
    );
  }

  /** A pod KEDA adds: dashed while it starts, then drawn in, with the cap and the target round it. */
  private newPod(x: number, start: number, ready: number): void {
    this.box({ x, z: 0, ...POD, h: H1 }, start, 0.35, { ...GUIDE, out: [ready, ready + 0.15] }, false);
    this.box({ x, z: 0, ...POD, h: H1 }, ready, 0.35, LINE);
    this.ring(x, CAP, ready + 0.3);
    this.ring(x, TARGET, ready + 0.35, GUIDE);
  }

  labels(t: number): LabelState[] {
    const busy = PODS[BUSY];
    const top = (x: number): Vec3 => [x, H1, -POD.d / 2];
    return [
      this.label('average', [PODS[3] + POD.w / 2 + 6, 8, POD.d / 2 + 0.6], 'average', win(t, BEATS.load + 0.5, BEATS.vpa), 34, 22),
      this.label('busy', [busy, 19, -FILL.d / 2], 'busiest pod', win(t, BEATS.load + 0.4, BEATS.vpa), -24, -48),
      this.label('vpa', top(busy), 'VPA', win(t, BEATS.vpa + 0.35, BEATS.cap + 0.1), 22, -40, { tick: 'resized' }),
      this.label('cap', [PODS[0] - POD.w / 2 - 1.2, CAP, POD.d / 2 + 1.2], 'session cap', win(t, BEATS.cap + 0.2, BEATS.end + 2), -30, 80),
      this.label('target', [PODS[3] + POD.w / 2 + 1.2, TARGET, POD.d / 2 + 1.2], 'KEDA target', win(t, BEATS.keda + 0.2, BEATS.end + 2), -20, 52),
      this.label('starting', top(NEW[0]), 'pod: starting', win(t, BEATS.keda + 0.45, BEATS.ready), 22, -40),
      this.label('ready', top(NEW[0]), 'pod: ready', win(t, BEATS.ready + 0.1, BEATS.result + 0.2), 22, -40),
      this.label('starting2', top(NEW[1]), 'pod: starting', win(t, BEATS.more + 0.15, BEATS.ready2), 22, -40),
      this.label('ready2', top(NEW[1]), 'pod: ready', win(t, BEATS.ready2 + 0.1, BEATS.end + 2), 22, -40),
    ];
  }
}

export const create = (origin?: Vec3) => new SessionsScene(origin);
