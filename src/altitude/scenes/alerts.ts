/**
 * Case-study scene: halving alert payloads (/work/alert-payload-reduction/). Facts from the
 * page only. The page did this twice, in two stacks ("first in Grafana, later in Coralogix"),
 * so the drawing has two lanes, one after the other; it never routes one alert through both.
 *
 * In each lane, a default payload, a tall stack of fields, reaches its platform; the template
 * cuts it to under half (the cut fields are the waste the reader paid for: amber, then
 * lifted), and what arrives in Slack is a three-part card: a title, one line, the fields.
 *
 *   0.0-0.5  the site
 *   0.3-3.0  Grafana's lane
 *   2.8-5.4  Coralogix's lane, later
 */
import type { LabelState } from '../engine/scene';
import { orbit, type SceneView } from './catalogue';
import { AMBER, BUILD, FIELD, LINE, PlotScene, win } from './plot';
import type { Vec3 } from '../world';

export const BEATS = { first: 0.3, later: 2.8, end: 5.6 } as const;

const FIELDS = 10;
const KEPT = 4;
const SLAB = 2.6;

export class AlertsScene extends PlotScene {
  readonly duration = BEATS.end;

  constructor(origin: Vec3 = [0, 0, 0]) {
    super(origin, [150, 92]);
    this.boundary();
    this.lane(-36, BEATS.first);
    this.lane(40, BEATS.later);
    this.build([0, 150, 320]);
  }

  /** One stack's lane at depth `z`, starting at scene second `t`. */
  private lane(z: number, t: number): void {
    // The default payload: every field the platform holds.
    const px = -104;
    for (let i = 0; i < FIELDS; i++) {
      const cut = i >= KEPT;
      const at = t + i * 0.05;
      // The template cuts the fields nobody needs to act: amber, then lifted.
      this.box(
        { x: px, z, w: 26, d: 16, h: SLAB - 0.5, y: i * SLAB },
        at,
        0.32,
        cut ? { ...FIELD, out: [t + 1.15, t + 1.45] } : FIELD,
        !cut,
      );
      if (cut) this.box({ x: px, z, w: 26.6, d: 16.6, h: SLAB - 0.3, y: i * SLAB - 0.1 }, t + 0.85 + (i - KEPT) * 0.03, 0.2, { ...AMBER, out: [t + 1.2, t + 1.5] }, false);
    }
    // The size meter beside the stack: before and after.
    this.line([px - 17, 0.3, z], [px - 17, FIELDS * SLAB, z], t + 0.5, t + 0.75, BUILD);
    this.line([px - 19, FIELDS * SLAB, z], [px - 15, FIELDS * SLAB, z], t + 0.75, t + 0.8, BUILD);
    this.line([px - 19, KEPT * SLAB, z], [px - 15, KEPT * SLAB, z], t + 1.3, t + 1.35, LINE);
    // The platform: the alert is templated here.
    this.box({ x: -12, z, w: 34, d: 22, h: 10 }, t + 0.2, 0.45, LINE);
    this.path(
      [
        [px + 14, 3, z],
        [-30, 3, z],
      ],
      t + 0.65,
      t + 0.85,
      BUILD,
    );
    this.stream([px + 15, 3, z], [-30, 3, z], [2.2, 1.6, 2.2], t + 0.85, t + 1.3, { count: 5, gap: 0.09 });
    // Out to Slack: a compact card standing up, three parts and nothing else.
    const cx = 100;
    this.path(
      [
        [6, 3, z],
        [cx - 22, 3, z],
      ],
      t + 1.45,
      t + 1.65,
      BUILD,
    );
    this.stream([7, 3, z], [cx - 23, 3, z], [2.2, 1.6, 2.2], t + 1.65, t + 2.1, { count: 5, gap: 0.09 });
    const top = 26;
    const card: Vec3[] = [
      [cx - 20, 1, z],
      [cx + 20, 1, z],
      [cx + 20, top, z],
      [cx - 20, top, z],
    ];
    this.loop(card, t + 1.75, 0.35, LINE);
    // A title with the severity and the fact; one line on what the alert is for; the fields.
    this.line([cx - 16, top - 5, z], [cx + 12, top - 5, z], t + 2.1, t + 2.2, LINE);
    this.line([cx - 16, top - 11, z], [cx + 16, top - 11, z], t + 2.2, t + 2.3, BUILD);
    for (let r = 0; r < 2; r++) this.line([cx - 16, top - 17 - r * 4, z], [cx + 4 - r * 8, top - 17 - r * 4, z], t + 2.3 + r * 0.05, t + 2.38 + r * 0.05, BUILD);
  }

  labels(t: number): LabelState[] {
    const lane = (id: string, z: number, at: number, name: string): LabelState[] => [
      this.label(`${id}-platform`, [-12, 10, z - 11], name, win(t, at + 0.4, BEATS.end + 2), -20, -34),
      this.label(`${id}-payload`, [-104, FIELDS * SLAB, z - 8], 'payload', win(t, at + 0.6, at + 1.4), 16, -52),
      this.label(`${id}-cut`, [-104, KEPT * SLAB, z - 8], 'payload', win(t, at + 1.4, BEATS.end + 2), 16, -52, { tick: '>50% smaller' }),
      this.label(`${id}-slack`, [120, 26, z], 'Slack', win(t, at + 1.9, BEATS.end + 2), 28, -16),
    ];
    return [...lane('a', -36, BEATS.first, 'Grafana'), ...lane('b', 40, BEATS.later, 'Coralogix')];
  }
}

export const view: SceneView = orbit([0, 8, 2], 320);
export const create = (origin?: Vec3) => new AlertsScene(origin);
