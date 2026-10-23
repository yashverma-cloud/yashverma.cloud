/**
 * The world of the Altitude prototype, shared by the live scene, the poster capture and the
 * page layout: the camera's descent, the cloud layers and the dawn palette.
 *
 * Units are metres; y is up. The ground is y = 0 and the Karpenter scene stands on it at the
 * origin. Every value here is art direction, not data.
 */

import { BEATS, layout } from './site';

export type Vec3 = [number, number, number];
export { BEATS };

/** Vertical field of view per orientation. Portrait screens get a taller view of the sky. */
export const FOV = { landscape: 40, portrait: 60 } as const;

/**
 * Where the horizon sits in the hero, as a fraction of the viewport height from the top.
 * The page lays the name on this line, so the HTML and the render agree at every width.
 * Its screen height depends only on pitch and vertical field of view, never on aspect.
 */
export const HERO_HORIZON = { landscape: 0.5, portrait: 0.46 } as const;

export function heroPitch(orientation: 'landscape' | 'portrait'): number {
  const half = (FOV[orientation] / 2) * (Math.PI / 180);
  const ndc = 1 - 2 * HERO_HORIZON[orientation];
  return -Math.atan(ndc * Math.tan(half)) * (180 / Math.PI);
}

/** One camera key on the descent. `p` is scroll progress through the whole page, 0 to 1. */
export interface FlightKey {
  p: number;
  pos: Vec3;
  /** Degrees. 0 looks along -z; positive turns right. */
  yaw: number;
  /** Degrees. Negative looks down. `null` takes the hero pitch for the orientation. */
  pitch: number | null;
  /** 0 is pre-dawn, 1 is sunrise. */
  dawn: number;
}

/**
 * The descent. Sections of the page map onto these progress values (see SECTIONS).
 * Hero above the cloud sea, a dive through it, the gap between layers at dawn, then a break
 * in the lower layer and down to the drawing on the ground.
 */
/** The lot the pending pod waits over, and the camera's aim on it during the close beats. */
const SITE_PLAN = layout();
const LOT = SITE_PLAN.newNode;

function aim(from: Vec3, to: Vec3): { yaw: number; pitch: number } {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  return {
    yaw: (Math.atan2(dx, -dz) * 180) / Math.PI,
    pitch: (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI,
  };
}

function key(p: number, pos: Vec3, target: Vec3, dawn: number): FlightKey {
  return { p, pos, ...aim(pos, target), dawn };
}

const LOT_AIM: Vec3 = [LOT.x - 6, 11, LOT.z - 10];
const FIELD_AIM: Vec3 = [0, 0, -30];

export const FLIGHT: FlightKey[] = [
  { p: 0.0, pos: [0, 4100, 9400], yaw: 0, pitch: null, dawn: 0.0 },
  { p: 0.07, pos: [0, 4040, 8800], yaw: 0, pitch: null, dawn: 0.04 },
  { p: 0.17, pos: [0, 3230, 7300], yaw: -2, pitch: -16, dawn: 0.16 },
  { p: 0.25, pos: [0, 2760, 6200], yaw: -3, pitch: -14, dawn: 0.3 },
  { p: 0.31, pos: [0, 2150, 5300], yaw: -2, pitch: -6, dawn: 0.42 },
  { p: 0.37, pos: [0, 1780, 4500], yaw: 4, pitch: -1.5, dawn: 0.52 },
  { p: 0.46, pos: [0, 1690, 3300], yaw: 9, pitch: -2.5, dawn: 0.62 },
  { p: 0.54, pos: [0, 1720, 2050], yaw: 3, pitch: -18, dawn: 0.7 },
  key(0.6, [0, 1760, 1150], [0, 0, 40], 0.76),
  key(0.66, [0, 1060, 760], [0, 0, 0], 0.82),
  key(0.72, [0, 210, 430], FIELD_AIM, 0.88),
  key(0.775, [LOT.x + 58, 70, LOT.z + 156], LOT_AIM, 0.91),
  key(0.85, [LOT.x + 46, 60, LOT.z + 132], LOT_AIM, 0.94),
  key(0.885, [20, 120, 330], [0, 0, -20], 0.96),
  key(0.94, [0, 190, 400], FIELD_AIM, 0.99),
  key(1.0, [0, 200, 420], FIELD_AIM, 1.0),
];

/** Page sections and the stretch of the flight each one owns. */
export const SECTIONS = {
  hero: [0, 0.1],
  descent: [0.1, 0.36],
  between: [0.36, 0.56],
  approach: [0.56, 0.6],
  reveal: [0.6, 0.97],
  end: [0.97, 1],
} as const;

/**
 * The drawing's clock against flight progress. It starts as the camera looks down through
 * the break, so the running cluster materialises below while the deck still frames it.
 */
export function sceneClockAt(p: number): number {
  const keys: [number, number][] = [
    [0.6, 0.0],
    [0.7, 0.6],
    [0.765, 0.86],
    [0.835, BEATS.ready],
    [0.85, BEATS.ready + 0.4],
    [0.87, BEATS.scale],
    [0.94, BEATS.end],
  ];
  if (p <= keys[0][0]) return 0;
  for (let i = 1; i < keys.length; i++) {
    const [x1, y1] = keys[i];
    const [x0, y0] = keys[i - 1];
    if (p <= x1) return y0 + ((p - x0) / (x1 - x0)) * (y1 - y0);
  }
  return BEATS.end;
}

/** A cloud layer. Shape and detail scales are noise periods in metres. */
export interface CloudLayer {
  name: string;
  bottom: number;
  top: number;
  /** 0 to 1. How much of the sky the layer covers. */
  coverage: number;
  /** Extinction per metre at full density. */
  density: number;
  shapePeriod: number;
  detailPeriod: number;
  /** 0 flat stratus to 1 towering cumulus. */
  type: number;
  /** Period of the coverage map in metres. */
  weatherPeriod: number;
}

export const LAYERS: CloudLayer[] = [
  {
    name: 'sea',
    bottom: 1900,
    top: 2950,
    coverage: 0.78,
    density: 0.05,
    shapePeriod: 2600,
    detailPeriod: 700,
    type: 0.82,
    weatherPeriod: 19000,
  },
  {
    name: 'deck',
    bottom: 950,
    top: 1380,
    coverage: 0.58,
    density: 0.04,
    shapePeriod: 2600,
    detailPeriod: 560,
    type: 0.45,
    weatherPeriod: 15000,
  },
  {
    name: 'wisps',
    bottom: 360,
    top: 640,
    coverage: 0.42,
    density: 0.022,
    shapePeriod: 1400,
    detailPeriod: 300,
    type: 0.25,
    weatherPeriod: 7000,
  },
];

/** The break in the deck above the drawing: centre (x, z), clear radius, feathering. */
export const BREAK = { x: 0, z: 260, radius: 820, feather: 600 } as const;

/** Wisps stay clear of the drawing and the camera's line to it. */
export const WISP_CLEAR = { x: 0, z: 120, radius: 380, feather: 420 } as const;

/** Sun azimuth in degrees from -z toward +x. The dawn glows ahead and to the right. */
export const SUN_AZIMUTH = 38;

/** Elevation of the light used for shading, in degrees, by dawn. The disc itself rises later. */
export function keyElevation(dawn: number): number {
  return 3 + dawn * 6;
}

/** Elevation of the visible sun disc, in degrees. Below the horizon until late in the descent. */
export function sunElevation(dawn: number): number {
  return -7 + dawn * 9.5;
}

/** sRGB hex to linear RGB. */
export function lin(hex: string): Vec3 {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return [c[0], c[1], c[2]];
}

/** The dawn palette: each entry is keyed at dawn 0, 0.55 and 1. */
const PALETTE = {
  zenith: ['#040c1f', '#0c2148', '#183a6b'],
  sky: ['#0b1d3e', '#1d3a6b', '#3c6296'],
  horizon: ['#21455e', '#5f809e', '#98aec6'],
  sunward: ['#7a4b3c', '#e29060', '#ffc27c'],
  glow: ['#8a5030', '#f2a35e', '#ffb75c'],
  key: ['#9aa7cc', '#f3b88a', '#ffd3a3'],
  ambTop: ['#3a5788', '#58709e', '#7392bf'],
  ambBottom: ['#141f3a', '#28365a', '#3a4868'],
  haze: ['#21365a', '#6c84a8', '#a0b1ca'],
  ground: ['#0a1b36', '#11294c', '#18335a'],
} as const;

/** Light intensities by dawn (key light, ambient, sun glow). */
const INTENSITY = {
  keyI: [1.15, 1.7, 2.4],
  ambI: [0.72, 0.9, 1.0],
  glowI: [0.5, 1.0, 1.25],
  starsI: [1, 0.12, 0],
} as const;

export type Palette = Record<keyof typeof PALETTE, Vec3> & Record<keyof typeof INTENSITY, number>;

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Interpolates the palette at a dawn value. */
export function palette(dawn: number): Palette {
  const d = Math.min(1, Math.max(0, dawn));
  const seg = d < 0.55 ? 0 : 1;
  const t = smooth(seg === 0 ? d / 0.55 : (d - 0.55) / 0.45);
  const out = {} as Palette;
  for (const [k, hexes] of Object.entries(PALETTE) as [keyof typeof PALETTE, readonly string[]][]) {
    const a = lin(hexes[seg]);
    const b = lin(hexes[seg + 1]);
    (out as Record<string, Vec3>)[k] = [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
  }
  for (const [k, v] of Object.entries(INTENSITY) as [keyof typeof INTENSITY, readonly number[]][]) {
    (out as Record<string, number>)[k] = v[seg] + (v[seg + 1] - v[seg]) * t;
  }
  return out;
}

/** Converts metres to the feet an altimeter would show, rounded to the nearest 10. */
export function feet(metres: number): number {
  return Math.round((metres * 3.28084) / 10) * 10;
}

/** Monotone cubic interpolation of one channel across the flight keys. */
function monotone(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let i = 0;
  while (x > xs[i + 1]) i++;
  const h = xs[i + 1] - xs[i];
  const d = (k: number) => (ys[k + 1] - ys[k]) / (xs[k + 1] - xs[k]);
  // Brodlie's weighted harmonic mean: no overshoot between keys, so the camera never
  // dips below a layer it is meant to stay above.
  const tangent = (k: number) => {
    if (k === 0) return d(0);
    if (k === n - 1) return d(n - 2);
    const d0 = d(k - 1);
    const d1 = d(k);
    if (d0 * d1 <= 0) return 0;
    const h0 = xs[k] - xs[k - 1];
    const h1 = xs[k + 1] - xs[k];
    return (3 * (h0 + h1)) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
  };
  const m0 = tangent(i) * h;
  const m1 = tangent(i + 1) * h;
  const t = (x - xs[i]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * ys[i] +
    (t3 - 2 * t2 + t) * m0 +
    (-2 * t3 + 3 * t2) * ys[i + 1] +
    (t3 - t2) * m1
  );
}

export interface CameraState {
  pos: Vec3;
  yaw: number;
  pitch: number;
  dawn: number;
}

/** The camera at a point of the descent. */
const XS = FLIGHT.map((k) => k.p);
const CHANNELS = {
  x: FLIGHT.map((k) => k.pos[0]),
  y: FLIGHT.map((k) => k.pos[1]),
  z: FLIGHT.map((k) => k.pos[2]),
  yaw: FLIGHT.map((k) => k.yaw),
  dawn: FLIGHT.map((k) => k.dawn),
};
const PITCH = {
  landscape: FLIGHT.map((k) => k.pitch ?? heroPitch('landscape')),
  portrait: FLIGHT.map((k) => k.pitch ?? heroPitch('portrait')),
};

export function cameraAt(p: number, orientation: 'landscape' | 'portrait'): CameraState {
  const ch = (ys: number[]) => monotone(XS, ys, p);
  // From the arrival under the deck to the end, the copy owns the left third on wide
  // screens and the bottom third on tall ones; turn the camera so the drawing sits clear.
  const frame = smoothstepRange(0.68, 0.73, p);
  // Less turn for the wide shot at the end: the whole field has to stay in frame.
  const yawShift = orientation === 'landscape' ? -(14 - 4 * smoothstepRange(0.87, 0.94, p)) * frame : 0;
  const pitchShift = orientation === 'portrait' ? -7 * frame : 0;
  // A tall screen sees a narrow slice; for the wide shot it backs away until the field fits.
  const dolly = 1 + (orientation === 'portrait' ? 0.55 : 0.34) * smoothstepRange(0.87, 0.94, p);
  const px = ch(CHANNELS.x);
  const py = ch(CHANNELS.y);
  const pz = ch(CHANNELS.z);
  return {
    pos:
      dolly === 1
        ? [px, py, pz]
        : [
            FIELD_AIM[0] + (px - FIELD_AIM[0]) * dolly,
            FIELD_AIM[1] + (py - FIELD_AIM[1]) * dolly,
            FIELD_AIM[2] + (pz - FIELD_AIM[2]) * dolly,
          ],
    yaw: ch(CHANNELS.yaw) + yawShift,
    pitch: ch(PITCH[orientation]) + pitchShift,
    dawn: ch(CHANNELS.dawn),
  };
}

function smoothstepRange(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
