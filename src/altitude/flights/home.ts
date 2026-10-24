/**
 * The home page's descent. Above the sea of cloud with the name on the horizon; a dive through
 * the sea; the gap between the layers at dawn, where the proof condenses; then down through a
 * break in the deck to the first case study, and low over the survey sheet from one drawing to
 * the next, the wisps clearing around the camera, the light warming to sunrise.
 *
 * Plain data and maths (no three.js), so the copy, the readout and the hero's horizon run
 * before the scene loads.
 */
import type { Director, Weather } from '../engine/scene';
import { VIEWS } from '../scenes/catalogue';
import { FEATURED, type Featured } from './featured';
import { aim, Flight, heroPitch, piecewise, type CameraState, type FlightKey, type Orientation, type Vec3 } from '../world';

/** Where each featured drawing stands on the sheet, in the order the descent visits them. */
export const SITES: Record<Featured['slug'], Vec3> = {
  'cloud-cost-optimisation': [0, 0, 1600],
  'live-migration-to-kubernetes': [480, 0, 500],
  'alert-payload-reduction': [-420, 0, -500],
  'karpenter-autoscaling': [0, 0, -1600],
};

export interface SceneWindow {
  slug: Featured['slug'];
  site: Vec3;
  /** Progress at which the camera has arrived over the drawing, and at which it leaves. */
  arrive: number;
  leave: number;
  /** Progress over which the drawing's clock runs from 0 to its end. */
  clock: [number, number];
}

/** Stretches of the descent, as progress through the flight (0 to 1). */
export const PARTS = {
  hero: [0, 0.04],
  descent: [0.04, 0.12],
  proof: [0.12, 0.2],
} as const;

const HOLDS: [number, number][] = [
  [0.27, 0.42],
  [0.47, 0.61],
  [0.66, 0.8],
  [0.85, 0.99],
];

export const WINDOWS: SceneWindow[] = FEATURED.map((f, i) => ({
  slug: f.slug,
  site: SITES[f.slug],
  arrive: HOLDS[i][0],
  leave: HOLDS[i][1],
  clock: [HOLDS[i][0] - 0.04, HOLDS[i][1] - 0.02],
}));

/** Screens of scroll the flight takes. */
export const FLIGHT_SCREENS = 18;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** The viewing position over a site, and the point the camera looks at (moved left of the drawing on wide screens). */
function framing(w: SceneWindow, orientation: Orientation, closer = 1): { pos: Vec3; look: Vec3 } {
  const v = VIEWS[w.slug];
  const target = add(w.site, v.target);
  const back = (orientation === 'portrait' ? 1.6 : 1) * closer;
  const pos: Vec3 = [
    target[0] + (v.to[0] - v.target[0]) * back,
    target[1] + (v.to[1] - v.target[1]) * back,
    target[2] + (v.to[2] - v.target[2]) * back,
  ];
  const dx = target[0] - pos[0];
  const dz = target[2] - pos[2];
  const d = Math.hypot(dx, dz) || 1;
  const shift = orientation === 'landscape' ? 0.1 : 0;
  return { pos, look: [target[0] + (dz / d) * shift * d, target[1], target[2] - (dx / d) * shift * d] };
}

function look(p: number, pos: Vec3, at: Vec3, dawn: number): FlightKey {
  return { p, pos, ...aim(pos, at), dawn };
}

function keys(orientation: Orientation): FlightKey[] {
  const first = WINDOWS[0];
  const f1 = framing(first, orientation);
  const out: FlightKey[] = [
    { p: 0, pos: [0, 4100, 9400], yaw: 0, pitch: null, dawn: 0 },
    { p: 0.04, pos: [0, 4040, 8800], yaw: 0, pitch: null, dawn: 0.04 },
    { p: 0.09, pos: [0, 3150, 7300], yaw: -2, pitch: -16, dawn: 0.18 },
    { p: 0.13, pos: [0, 2250, 6000], yaw: -2, pitch: -5, dawn: 0.36 },
    { p: 0.17, pos: [0, 1760, 4700], yaw: 5, pitch: -1.5, dawn: 0.5 },
    { p: 0.2, pos: [0, 1700, 3700], yaw: 4, pitch: -6, dawn: 0.56 },
    // Tip toward the break, then down through it to the first drawing.
    look(0.225, [0, 1720, 2900], first.site, 0.6),
    look(0.25, add(first.site, [30, 700, 760]), add(first.site, [0, 0, 60]), 0.65),
  ];
  WINDOWS.forEach((w, i) => {
    const a = framing(w, orientation);
    const b = framing(w, orientation, 0.88);
    const dawn = 0.7 + i * 0.08;
    out.push(look(w.arrive, i === 0 ? f1.pos : a.pos, a.look, dawn));
    out.push(look(w.leave, b.pos, b.look, dawn + 0.04));
  });
  out.push({ ...out[out.length - 1], p: 1, dawn: 1 });
  return out;
}

const FLIGHTS: Record<Orientation, Flight> = { landscape: new Flight(keys('landscape')), portrait: new Flight(keys('portrait')) };

/** The scene window the camera is in or nearest to at progress `p`. */
export function windowAt(p: number): SceneWindow {
  let current = WINDOWS[0];
  for (const w of WINDOWS) if (p >= w.clock[0] - 0.02) current = w;
  return current;
}

/** A drawing's clock at progress `p`, in its own scene seconds (0 to `duration`). */
export function clockOf(w: SceneWindow, p: number, duration: number): number {
  return piecewise(
    [
      [w.clock[0], 0],
      [w.clock[1], duration],
    ],
    p,
  );
}

export const homeFlight: Director = {
  clouds: true,
  camera: (p: number, orientation: Orientation): CameraState => FLIGHTS[orientation].at(p, orientation),
  // The composition (scenes/descent.ts) turns progress into each drawing's clock.
  clock: (p: number) => p,
  weather(p: number): Weather {
    const w = windowAt(p);
    const c = FLIGHTS.landscape.at(p, 'landscape').pos;
    const first = WINDOWS[0].site;
    return {
      // The one break in the deck: over the dive to the first drawing.
      deck: [first[0] + 30, first[2] + 520, 820, 600],
      // The low wisps always part around the camera, so they never stand between it and a drawing.
      wisps: [c[0], c[2] - 120, 420, 420],
      site: [w.site[0] - 175, w.site[2] - 115, w.site[0] + 175, w.site[2] + 115],
    };
  },
  groundVisible: (c) => c.pos[1] < 1950,
  drift: (p) => 1 - Math.min(1, p / 0.2) * 0.7,
};

/** The hero's camera pitch (the name stands on the horizon). */
export const HERO_PITCH = { landscape: heroPitch('landscape'), portrait: heroPitch('portrait') };
