/**
 * Case-study scene: Jarvis, safe cluster access from Slack (/work/jarvis-slack-ops/). Facts
 * from the page only: requests are checked in four places before anything reaches the cluster
 * (the Slack signature, the caller, the command for that caller, the input); reads and the
 * admin commands go their own ways; the bot runs inside the cluster in its own namespace; every
 * action is echoed into its own Slack channel. Amber is a request the checks refuse, which the
 * page describes ("cannot be driven by anything else", destructive verbs "not reachable").
 *
 *   0.0-0.6  the site, Slack, the cluster with the bot's namespace
 *   0.6-1.4  the four checks
 *   1.5-2.5  a read: passes, reaches the cluster, writes its audit line
 *   2.5-3.5  an admin command: passes, reaches the cluster, writes its line
 *   3.6-4.4  a request the checks refuse: it stops, in amber
 *   4.4-5.2  another read
 */
import type { LabelState } from '../engine/scene';
import { orbit, type SceneView } from './catalogue';
import { BUILD, FIELD, GUIDE, LINE, PlotScene, win } from './plot';
import type { Vec3 } from '../world';

export const BEATS = { gate: 0.6, read: 1.5, admin: 2.5, refused: 3.6, again: 4.4, end: 5.6 } as const;

const GATES = [-62, -44, -26, -8];
const Y = 3;

export class JarvisScene extends PlotScene {
  readonly duration = BEATS.end;

  constructor(origin: Vec3 = [0, 0, 0]) {
    super(origin, [156, 96]);
    this.boundary();

    // Slack, where the requests come from.
    this.box({ x: -126, z: 0, w: 26, d: 22, h: 9 }, 0.2, 0.4, LINE);
    // The four checks, one gate each.
    GATES.forEach((x, i) => {
      this.loop(
        [
          [x, 0.3, -12],
          [x, 0.3, 12],
          [x, 16, 12],
          [x, 16, -12],
        ],
        BEATS.gate + i * 0.15,
        0.25,
        LINE,
      );
    });
    this.line([-112, Y, 0], [-66, Y, 0], BEATS.gate + 0.6, BEATS.gate + 0.75, BUILD);

    // The cluster, with the bot in its own namespace inside it.
    this.loop(
      [
        [40, 0.25, -60],
        [150, 0.25, -60],
        [150, 0.25, 44],
        [40, 0.25, 44],
      ],
      0.3,
      0.4,
      FIELD,
    );
    this.loop(
      [
        [46, 0.3, -12],
        [78, 0.3, -12],
        [78, 0.3, 12],
        [46, 0.3, 12],
      ],
      0.5,
      0.3,
      GUIDE,
    );
    this.box({ x: 62, z: 0, w: 14, d: 10, h: 6 }, 0.55, 0.35, LINE);
    // Workloads: reads look at pods and logs; admin commands restart and scale deployments.
    const pods = [
      [108, -40],
      [132, -40],
      [108, -20],
      [132, -20],
    ] as const;
    pods.forEach(([x, z], i) => this.box({ x, z, w: 16, d: 12, h: 6 }, 0.35 + i * 0.06, 0.35, FIELD));
    const deploys = [
      [108, 22],
      [132, 22],
    ] as const;
    deploys.forEach(([x, z], i) => this.box({ x, z, w: 18, d: 14, h: 7 }, 0.45 + i * 0.06, 0.35, FIELD));

    // The audit channel along the front: one line per action.
    this.box({ x: 0, z: 76, w: 280, d: 12, h: 3 }, 0.5, 0.5, BUILD, false);

    const request = (at: number, kind: 'read' | 'admin' | 'refused') => {
      const gateLimit = kind === 'refused' ? GATES[1] - 3 : GATES[3] + 4;
      this.stream([-112, Y + 2, 0], [gateLimit, Y + 2, 0], [3, 3, 3], at, at + 0.45, { count: 6, gap: 0.075, stay: 0.1 });
      if (kind === 'refused') {
        // Stopped at the caller check: it stays, in amber.
        this.solid([GATES[1] - 4, Y + 2, 0], [3.4, 3.4, 3.4], at + 0.5, undefined, true);
        return;
      }
      const end: Vec3 = kind === 'read' ? [108, Y + 2, -30] : [120, Y + 2, 22];
      this.line([GATES[3] + 4, Y, 0], [46, Y, 0], at + 0.4, at + 0.5, kind === 'read' ? BUILD : LINE);
      this.stream([GATES[3] + 6, Y + 2, 0], [46, Y + 2, 0], [3, 3, 3], at + 0.5, at + 0.75, { count: 4, gap: 0.06, stay: 0.1 });
      this.line([76, Y, 0], end, at + 0.75, at + 0.9, kind === 'read' ? BUILD : LINE);
      // Every action writes a line to the audit channel.
      const n = kind === 'read' ? (at < 3 ? 0 : 2) : 1;
      this.line([-128 + n * 30, 3.4, 76], [-108 + n * 30, 3.4, 76], at + 0.95, at + 1.05, LINE);
      this.line([62, 6, 5], [-118 + n * 30, 3.4, 70], at + 0.9, at + 1.0, GUIDE);
    };
    request(BEATS.read, 'read');
    request(BEATS.admin, 'admin');
    request(BEATS.refused, 'refused');
    request(BEATS.again, 'read');
    this.build([0, 150, 320]);
  }

  labels(t: number): LabelState[] {
    return [
      this.label('slack', [-126, 9, -11], 'Slack', win(t, 0.5, BEATS.end + 2), -30, -36),
      this.label('signature', [GATES[0], 16, -12], 'signature', win(t, BEATS.gate + 0.3, BEATS.end + 2), -70, -40),
      this.label('caller', [GATES[1], 16, -12], 'caller', win(t, BEATS.gate + 0.45, BEATS.end + 2), -20, -58),
      this.label('command', [GATES[2], 16, -12], 'command', win(t, BEATS.gate + 0.6, BEATS.end + 2), 10, -76),
      this.label('input', [GATES[3], 16, -12], 'input', win(t, BEATS.gate + 0.75, BEATS.end + 2), 40, -58),
      this.label('bot', [62, 6, -5], 'Jarvis', win(t, 0.9, BEATS.end + 2), 24, -40),
      this.label('refused', [GATES[1] - 4, Y + 4, 0], 'refused', win(t, BEATS.refused + 0.55, BEATS.end + 2), -60, 34, { amber: true }),
      this.label('audit', [140, 3, 76], 'audit channel', win(t, BEATS.read + 1.0, BEATS.end + 2), 20, 24),
    ];
  }
}

export const view: SceneView = orbit([6, 6, 12], 350);
export const create = (origin?: Vec3) => new JarvisScene(origin);
