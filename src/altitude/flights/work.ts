/**
 * A case-study page's flight. Progress 0 to 1 is the opening: the camera eases from `from` to
 * `to` while the drawing plays, then holds with a slight drift. On wide screens it looks a little
 * left of the drawing, so the drawing sits right of centre, clear of the copy on the left. No
 * clouds: the scene is on the survey sheet at dawn.
 *
 * Wide screens read on into the case study (src/altitude/work.ts): from 1 to READ.start the camera
 * moves to the reading view, the drawing fitted into the right half beside the text; from there
 * to 2 the three sections pass (READ.span each), the drawing's clock runs through each section's
 * stretch (STATES in scenes/catalogue.ts) and the camera turns slowly round it, pulling back as
 * the system grows. Nothing sways while reading, so the scene can stop rendering when the reader
 * stops.
 */
import type { ReadingState, SceneView } from '../scenes/catalogue';
import type { Director, Weather } from '../engine/scene';
import { aim, FOV, PORTRAIT_BACK, type CameraState, type Orientation, type Vec3 } from '../world';

/** Where reading starts on the progress scale, and how much of it each section takes. */
export const READ = { start: 1.1, span: 0.3 } as const;

/** Progress at fraction `u` through reading section `k`. */
export function stateProgress(k: number, u = 1): number {
  return READ.start + READ.span * (k + Math.min(1, Math.max(0, u)));
}

export interface WorkDirector extends Director {
  /** The screen's width over its height: the reading view fits the drawing beside the text. */
  aspect: number;
  /** Capture only: the drawing centred and filling the frame, for the phone snapshots. */
  snapshot: boolean;
}

const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const RAD = Math.PI / 180;

export function workFlight(view: SceneView, site: [number, number, number, number] = [-170, -110, 170, 110], states: ReadingState[] = []): WorkDirector {
  const weather: Weather = { deck: [0, 0, 0, 1], wisps: [0, 0, 0, 1], site };
  // The drawing's half-width, from its survey grid.
  const half = Math.max(site[2] - site[0], site[3] - site[1]) / 2;
  const orbit = {
    // The opening's orbit around the drawing, from the view.
    dist: Math.hypot(view.to[0] - view.target[0], view.to[1] - view.target[1], view.to[2] - view.target[2]),
    el: Math.asin((view.to[1] - view.target[1]) / Math.hypot(view.to[0] - view.target[0], view.to[1] - view.target[1], view.to[2] - view.target[2])) / RAD,
    az: Math.atan2(view.to[0] - view.target[0], view.to[2] - view.target[2]) / RAD,
  };

  const opening = (p: number, orientation: Orientation): CameraState => {
    const e = 1 - (1 - Math.min(1, p)) ** 3;
    const back = orientation === 'portrait' ? PORTRAIT_BACK : 1;
    const at = (k: 0 | 1 | 2) => view.target[k] + (view.from[k] + (view.to[k] - view.from[k]) * e - view.target[k]) * back;
    const pos: Vec3 = [at(0), at(1), at(2)];
    const dx = view.target[0] - pos[0];
    const dz = view.target[2] - pos[2];
    const d = Math.hypot(dx, dz) || 1;
    const shift = orientation === 'landscape' ? 0.1 : 0;
    // Left of the line of sight, so the drawing lands right of centre.
    const look: Vec3 = [view.target[0] + (dz / d) * shift * d, view.target[1], view.target[2] - (dx / d) * shift * d];
    return { pos, ...aim(pos, look), dawn: view.dawn };
  };

  /**
   * The drawing at `back` times the distance that fits its width in `fill` of the frame's width,
   * seen from `az`/`el`, with its centre at `x` across the screen (0.5 is the middle).
   */
  const framed = (aspect: number, back: number, fill: number, x: number, az: number, el: number): CameraState => {
    const tanH = Math.tan((FOV.landscape / 2) * RAD) * aspect;
    const dist = (half / (fill * tanH)) * back;
    const pos: Vec3 = [
      view.target[0] + Math.sin(az * RAD) * Math.cos(el * RAD) * dist,
      view.target[1] + Math.sin(el * RAD) * dist,
      view.target[2] + Math.cos(az * RAD) * Math.cos(el * RAD) * dist,
    ];
    const a = aim(pos, view.target);
    // Turning left by this much puts the drawing's centre at `x` across the screen.
    const off = Math.atan((x * 2 - 1) * tanH) / RAD;
    return { pos, yaw: a.yaw - off, pitch: a.pitch, dawn: view.dawn };
  };

  /** The camera standing back for section `k` at fraction `u` through it: it eases from the last section's distance a little ahead of the drawing's growth. */
  const backAt = (k: number, u: number) => {
    const cur = states[k]?.back ?? 1;
    const prev = states[k - 1]?.back ?? cur;
    return mix(prev, cur, smooth((u - 0.05) / 0.55));
  };

  const director: WorkDirector = {
    clouds: false,
    end: 2,
    aspect: 16 / 10,
    snapshot: false,
    camera(p: number, orientation: Orientation): CameraState {
      if (director.snapshot) {
        const s = Math.min(2.999, Math.max(0, (p - READ.start) / READ.span));
        const k = Math.floor(s);
        // A little left of centre: labels mostly hang to the right of their anchors.
        const snap = states[k]?.snap;
        return framed(director.aspect, backAt(k, 1), snap?.fill ?? 0.72, snap?.x ?? 0.46, orbit.az, orbit.el);
      }
      if (p <= 1 || orientation === 'portrait' || !states.length) return opening(p, orientation);
      // Reading: the sections, then the turn round the drawing that runs through all of them.
      const s = Math.min(2.999, Math.max(0, (p - READ.start) / READ.span));
      const k = Math.floor(s);
      const u = s - k;
      const turn = Math.max(0, p - READ.start) / (2 - READ.start);
      // A slow turn, small enough that every label keeps the side of its anchor it was drawn for.
      const read = framed(director.aspect, backAt(k, u), 0.46, 0.745, orbit.az + 3 + turn * 7, orbit.el + 2 + turn * 3);
      if (p >= READ.start) return read;
      // From the opening's framing to the reading view, as the opening scrolls away.
      const open = opening(1, orientation);
      const k2 = smooth((p - 1) / (READ.start - 1));
      return {
        pos: [mix(open.pos[0], read.pos[0], k2), mix(open.pos[1], read.pos[1], k2), mix(open.pos[2], read.pos[2], k2)],
        yaw: mix(open.yaw, read.yaw, k2),
        pitch: mix(open.pitch, read.pitch, k2),
        dawn: view.dawn,
      };
    },
    /** The drawing's clock while reading; the opening's clock is the page's (work.ts). */
    clock(p: number): number {
      if (!states.length) return 0;
      if (p < READ.start) return states[0].t[0];
      const s = Math.min(2.999, (p - READ.start) / READ.span);
      const k = Math.floor(s);
      const [t0, t1] = states[k].t;
      return mix(t0, t1, s - k);
    },
    weather: () => weather,
    groundVisible: () => true,
    drift: (p: number) => (p <= 1 ? 0.12 : 0.12 * (1 - smooth((p - 1) / (READ.start - 1)))),
  };
  return director;
}
