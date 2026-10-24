/**
 * The home page's descent. Above the sea of cloud with the name on the horizon; a dive through
 * the sea; the gap between the layers at dawn, where the proof condenses; then down through a
 * break in the deck to the first case study, and low over the survey sheet from one drawing to
 * the next, the wisps clearing around the camera, the light warming to sunrise. Then the
 * approach (progress 1 to 2, under the ground sections): out over the sheet toward the sunrise,
 * down to eye height, where the sun breaks the horizon behind contact.
 *
 * Plain data and maths (no three.js), so the copy, the readout and the hero's horizon run
 * before the scene loads.
 */
import type { Director, Weather } from '../engine/scene';
import { VIEWS } from '../scenes/catalogue';
import { FEATURED, type Featured } from './featured';
import { aim, Flight, FOV, heroPitch, piecewise, PORTRAIT_BACK, smoothstepRange, SUN_AZIMUTH, type CameraState, type FlightKey, type Orientation, type Vec3 } from '../world';

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

/**
 * The approach, after the flight: progress 1 to glideEnd runs while the ground sections scroll
 * past (src/altitude/home.ts maps it), glideEnd to land while contact comes to fill the screen,
 * and land to end over the footer, the touchdown.
 */
export const APPROACH = { glideEnd: 1.85, land: 2, end: 2.1 } as const;

/**
 * Where the horizon settles when the approach lands and at touchdown, as a fraction of the screen
 * from the top: just above contact's heading, which the page measures (settle()), and never lower
 * than 40% wide or 30% tall, so the sun has the sky above the words.
 */
const SETTLE: Record<Orientation, { land: number; end: number }> = {
  landscape: { land: 0.4, end: 0.4 },
  portrait: { land: 0.28, end: 0.2 },
};

/** The camera pitch that puts the horizon a fraction `h` of the way down the screen. */
function pitchFor(h: number, orientation: Orientation): number {
  const half = (FOV[orientation] / 2) * (Math.PI / 180);
  return -Math.atan((1 - 2 * h) * Math.tan(half)) * (180 / Math.PI);
}

/** The sun's heading across the sheet, x and z (world.ts: 38° from -z toward +x). */
const SUNWARD: [number, number] = [Math.sin((SUN_AZIMUTH * Math.PI) / 180), -Math.cos((SUN_AZIMUTH * Math.PI) / 180)];

/**
 * From the last drawing the camera banks toward the sunrise, passes over the field's corner and
 * glides out across the survey sheet below the cloud base, pitched so the horizon stays above
 * the frame (half the vertical field is 20° wide, 30° tall) and every section reads over the
 * dark sheet. As contact fills the screen it flares and levels a few metres up, low enough to
 * feel landed and high enough that the contours still run out to the horizon: the horizon comes
 * down into the frame above contact's words, and the sun disc rises through it, a little right
 * of the copy. Over the footer it touches down to eye height, so the readout ends at 0 ft. The
 * disc has its own elevation here (the dawn palette is already at sunrise), so it can rise in
 * view: it sinks out of sight during the glide and breaks the horizon at the end.
 */
function approach(orientation: Orientation, from: FlightKey): FlightKey[] {
  const tall = orientation === 'portrait';
  const { land, end } = SETTLE[orientation];
  const y0 = from.pos[1];
  const along = (d: number, y: number): Vec3 => [from.pos[0] + SUNWARD[0] * d, y, from.pos[2] + SUNWARD[1] * d];
  const glide = tall ? -34 : -25;
  return [
    { p: 1.05, pos: along(130, y0 * 0.86), yaw: 6, pitch: tall ? -40 : -33, dawn: 0.98, sun: 1.4 },
    { p: 1.14, pos: along(420, y0 * 0.7), yaw: 26, pitch: glide - 4, dawn: 0.985, sun: 0.4 },
    { p: 1.5, pos: along(1500, Math.min(95, y0 * 0.45)), yaw: 29, pitch: glide - 1, dawn: 0.99, sun: -1.2 },
    { p: APPROACH.glideEnd, pos: along(2600, 22), yaw: 30, pitch: glide, dawn: 0.995, sun: -2 },
    // The sky arrives as soon as the last section has gone, and the horizon comes down to settle
    // above contact's words (SETTLE), never behind them.
    { p: 1.9, pos: along(2780, 12), yaw: tall ? 31 : 29.5, pitch: pitchFor(land - 0.13, orientation), dawn: 1, sun: -1.5 },
    { p: 1.95, pos: along(2880, 7.5), yaw: tall ? 32 : 28.5, pitch: pitchFor(land - 0.035, orientation), dawn: 1, sun: -0.5 },
    { p: APPROACH.land, pos: along(2940, 6), yaw: tall ? 32 : 28, pitch: pitchFor(land, orientation), dawn: 1, sun: 0.8 },
    { p: APPROACH.end, pos: along(2975, 1.2), yaw: tall ? 32 : 28, pitch: pitchFor(end, orientation), dawn: 1, sun: 1.3 },
  ];
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** The viewing position over a site, and the point the camera looks at (moved left of the drawing on wide screens). */
function framing(w: SceneWindow, orientation: Orientation, closer = 1): { pos: Vec3; look: Vec3 } {
  const v = VIEWS[w.slug];
  const target = add(w.site, v.target);
  const back = (orientation === 'portrait' ? PORTRAIT_BACK : 1) * closer;
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
  const last = { ...out[out.length - 1], p: 1 };
  out.push(last, ...approach(orientation, last));
  return out;
}

const FLIGHTS: Record<Orientation, Flight> = { landscape: new Flight(keys('landscape')), portrait: new Flight(keys('portrait')) };

/**
 * Lays the horizon just above contact's heading: `landTop` and `endTop` are where the heading's
 * top stands on screen when the approach lands and at touchdown, as fractions from the top.
 * Where the words leave no room (a short landscape screen), the horizon stays above the frame:
 * no sunrise rather than a sunrise behind text. Returns where the horizon lands, for the burn
 * under the words (home.css).
 */
export function settle(orientation: Orientation, landTop: number, endTop: number): number {
  const most = orientation === 'portrait' ? 0.3 : 0.4;
  const round = (x: number) => Math.round(x * 200) / 200;
  const land = round(Math.min(most, Math.max(-0.1, landTop - 0.07)));
  const end = round(Math.min(land, Math.max(-0.1, endTop - 0.07)));
  const was = SETTLE[orientation];
  if (land !== was.land || end !== was.end) {
    SETTLE[orientation] = { land, end };
    FLIGHTS[orientation] = new Flight(keys(orientation));
  }
  return land;
}

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
    const site: [number, number, number, number] = [w.site[0] - 175, w.site[2] - 115, w.site[0] + 175, w.site[2] + 115];
    // On the approach the survey grid runs on under the sections: it grows out of the last
    // drawing's site into a square riding ahead of the camera, so the sheet streams past beneath
    // the words, and fades as the camera flares, so contact stands on the open sheet.
    if (p > 1) {
      const ahead = [c[0] + SUNWARD[0] * 450, c[2] + SUNWARD[1] * 450];
      const roam = [ahead[0] - 800, ahead[1] - 800, ahead[0] + 800, ahead[1] + 800];
      const k = smoothstepRange(1, 1.08, p);
      for (let i = 0; i < 4; i++) site[i] += (roam[i] - site[i]) * k;
    }
    return {
      // The one break in the deck: over the dive to the first drawing.
      deck: [first[0] + 30, first[2] + 520, 820, 600],
      // The low wisps always part around the camera, so they never stand between it and a drawing.
      wisps: [c[0], c[2] - 120, 420, 420],
      site,
      grid: 1 - smoothstepRange(APPROACH.glideEnd, 1.93, p),
    };
  },
  groundVisible: (c) => c.pos[1] < 1950,
  // Calm after the hero; nearly still at eye height, where the sway would take the camera through the ground.
  drift: (p) => (p <= 1 ? 1 - Math.min(1, p / 0.2) * 0.7 : 0.3 - 0.29 * smoothstepRange(1.6, 1.92, p)),
  end: APPROACH.end,
};

/** The hero's camera pitch (the name stands on the horizon). */
export const HERO_PITCH = { landscape: heroPitch('landscape'), portrait: heroPitch('portrait') };
