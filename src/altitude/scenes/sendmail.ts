/**
 * Case-study scene: replacing sendmail without touching a single job (/work/sendmail-ses-cli/).
 * Facts from the page only: jobs pipe a message into sendmail on stdin; the replacement reads
 * the same thing and sends through SES; no job changed. So the new CLI drops into the old tool's
 * place with the same footprint, and the jobs and their pipes are never redrawn.
 *
 *   0.0-0.5  the site
 *   0.2-1.2  the jobs, their pipes into one socket, the old tool in it
 *   1.2-2.2  mail on stdin into the old tool
 *   2.4-3.0  the old tool lifts out; the new CLI, the same shape, is drawn in its place
 *   3.0-3.6  out to AWS SES and on to the mailbox
 *   3.6-5.4  the same jobs, the same pipes, mail out through SES
 */
import type { LabelState } from '../engine/scene';
import { orbit, type SceneView } from './catalogue';
import { BUILD, FIELD, GUIDE, LINE, PlotScene, win } from './plot';
import type { Vec3 } from '../world';

export const BEATS = { pipes: 0.6, mail: 1.2, swap: 2.4, ses: 3.0, flow: 3.6, end: 5.6 } as const;

const JOBS = [-60, -36, -12, 12, 36, 60];
const SOCKET = { x: -6, z: 0, w: 20, d: 20, h: 10 };

export class SendmailScene extends PlotScene {
  readonly duration = BEATS.end;

  constructor(origin: Vec3 = [0, 0, 0]) {
    super(origin, [150, 92]);
    this.boundary();

    // The jobs, in a column, each piping into the same place.
    JOBS.forEach((z, i) => {
      this.box({ x: -122, z, w: 18, d: 14, h: 6 }, 0.2 + i * 0.07, 0.35, FIELD);
      this.path(
        [
          [-113, 2.5, z],
          [-60, 2.5, z],
          [-28, 2.5, 0],
          [SOCKET.x - SOCKET.w / 2 - 1, 2.5, 0],
        ],
        BEATS.pipes + i * 0.05,
        BEATS.pipes + 0.4 + i * 0.05,
        BUILD,
      );
    });
    // The socket: the place in the pipeline the tool sits in.
    const s = SOCKET;
    this.loop(
      [
        [s.x - s.w / 2 - 3, 0.3, s.z - s.d / 2 - 3],
        [s.x + s.w / 2 + 3, 0.3, s.z - s.d / 2 - 3],
        [s.x + s.w / 2 + 3, 0.3, s.z + s.d / 2 + 3],
        [s.x - s.w / 2 - 3, 0.3, s.z + s.d / 2 + 3],
      ],
      0.5,
      0.3,
      GUIDE,
    );
    // The old tool in it, then lifted; the new CLI drawn into exactly its footprint.
    this.box(s, 0.6, 0.45, { ...FIELD, out: [BEATS.swap, BEATS.swap + 0.3] });
    this.box(s, BEATS.swap + 0.25, 0.45, LINE);
    // Mail on stdin into the old tool.
    JOBS.forEach((z, i) => {
      if (i % 2) return;
      this.stream([-112, 4, z], [-60, 4, z], [2.4, 1.8, 2.4], BEATS.mail + i * 0.05, BEATS.mail + 0.8, { count: 4, gap: 0.09, stay: 0.12 });
    });
    // Out to SES, and on to the mailbox.
    this.box({ x: 72, z: 0, w: 24, d: 20, h: 9 }, BEATS.ses, 0.4, LINE);
    this.box({ x: 128, z: 0, w: 16, d: 24, h: 3 }, BEATS.ses + 0.25, 0.35, FIELD);
    this.line([s.x + s.w / 2, 3, 0], [60, 3, 0], BEATS.ses + 0.1, BEATS.ses + 0.3, BUILD);
    this.line([84, 3, 0], [120, 3, 0], BEATS.ses + 0.4, BEATS.ses + 0.55, BUILD);
    // The same jobs, unchanged, now sending through SES.
    JOBS.forEach((z, i) => {
      if (i % 2 === 0) return;
      this.stream([-112, 4, z], [-60, 4, z], [2.4, 1.8, 2.4], BEATS.flow + i * 0.05, BEATS.flow + 0.9, { count: 4, gap: 0.09, stay: 0.12 });
    });
    this.stream([s.x + s.w / 2 + 2, 4, 0], [59, 4, 0], [2.4, 1.8, 2.4], BEATS.flow + 0.4, BEATS.end - 0.4, { count: 5, gap: 0.1, stay: 0.14 });
    this.stream([85, 4, 0], [119, 4, 0], [2.4, 1.8, 2.4], BEATS.flow + 0.6, BEATS.end - 0.3, { count: 4, gap: 0.1, stay: 0.14 });
    this.build([0, 150, 320]);
  }

  labels(t: number): LabelState[] {
    return [
      this.label('jobs', [-122, 6, -67], 'jobs', win(t, 0.6, BEATS.end + 2), -40, -30),
      this.label('stdin', [-60, 2.5, 60], 'stdin', win(t, BEATS.pipes + 0.4, BEATS.end + 2), -20, 34),
      this.label('old', [SOCKET.x, 10, -10], 'sendmail', win(t, 0.9, BEATS.swap + 0.15), 20, -46),
      this.label('new', [SOCKET.x, 10, -10], 'new CLI', win(t, BEATS.swap + 0.6, BEATS.end + 2), 20, -46, { tick: 'same interface' }),
      this.label('ses', [72, 9, -10], 'AWS SES', win(t, BEATS.ses + 0.3, BEATS.end + 2), 26, -40),
      this.label('mailbox', [128, 3, 12], 'mailbox', win(t, BEATS.ses + 0.5, BEATS.end + 2), 30, 26),
    ];
  }
}

export const view: SceneView = orbit([2, 6, 0], 330);
export const create = (origin?: Vec3) => new SendmailScene(origin);
