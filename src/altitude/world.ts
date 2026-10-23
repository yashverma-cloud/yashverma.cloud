/**
 * The world every Altitude scene shares: units, the cloud layers, the sun, the dawn palette,
 * and a flight path made of camera keys. Pages direct their own flights through it (flights/).
 *
 * Units are metres; y is up and the ground is y = 0. Every value here is art direction.
 */
import { light, sky } from '../system/tokens.mjs';

export type Vec3 = [number, number, number];
export type Orientation = 'landscape' | 'portrait';

/** Vertical field of view per orientation. Portrait screens get a taller view of the sky. */
export const FOV = { landscape: 40, portrait: 60 } as const;

/**
 * Where the horizon sits in the hero, as a fraction of the viewport height from the top. The
 * page lays the name on this line, so the HTML and the render agree at every width: its screen
 * height depends only on pitch and vertical field of view, never on aspect.
 */
export const HERO_HORIZON = { landscape: 0.5, portrait: 0.46 } as const;

export function heroPitch(orientation: Orientation): number {
  const half = (FOV[orientation] / 2) * (Math.PI / 180);
  const ndc = 1 - 2 * HERO_HORIZON[orientation];
  return -Math.atan(ndc * Math.tan(half)) * (180 / Math.PI);
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

/** The three layers of the descent: the sea above, the broken deck, the low wisps. */
export const LAYERS: CloudLayer[] = [
  { name: 'sea', bottom: 1900, top: 2950, coverage: 0.78, density: 0.05, shapePeriod: 2600, detailPeriod: 700, type: 0.82, weatherPeriod: 19000 },
  { name: 'deck', bottom: 950, top: 1380, coverage: 0.58, density: 0.04, shapePeriod: 2600, detailPeriod: 560, type: 0.45, weatherPeriod: 15000 },
  { name: 'wisps', bottom: 360, top: 640, coverage: 0.42, density: 0.022, shapePeriod: 1400, detailPeriod: 300, type: 0.25, weatherPeriod: 7000 },
];

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

/** The dawn palette and light intensities, keyed at dawn 0, 0.55 and 1 (src/system/tokens.mjs). */
const PALETTE = sky;
const INTENSITY = light;

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
    (out as Record<string, Vec3>)[k] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
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

export function smoothstepRange(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Monotone cubic interpolation (Brodlie's weighted harmonic tangents): no overshoot between keys. */
export function monotone(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let i = 0;
  while (x > xs[i + 1]) i++;
  const h = xs[i + 1] - xs[i];
  const d = (k: number) => (ys[k + 1] - ys[k]) / (xs[k + 1] - xs[k]);
  // No overshoot, so the camera never dips below a layer it is meant to stay above.
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
  return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * m1;
}

/** Piecewise-linear lookup through (x, y) keys, held flat beyond the ends. */
export function piecewise(keys: [number, number][], x: number): number {
  if (x <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [x1, y1] = keys[i];
    const [x0, y0] = keys[i - 1];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return keys[keys.length - 1][1];
}

export interface CameraState {
  pos: Vec3;
  /** Degrees. 0 looks along -z; positive turns right. */
  yaw: number;
  /** Degrees. Negative looks down. */
  pitch: number;
  /** 0 is pre-dawn, 1 is sunrise. */
  dawn: number;
}

/** One camera key on a flight. `p` is progress through the page, 0 to 1. */
export interface FlightKey {
  p: number;
  pos: Vec3;
  yaw: number;
  /** `null` takes the hero pitch for the orientation, so the horizon sits under the name. */
  pitch: number | null;
  dawn: number;
}

/** Yaw and pitch, in degrees, that look from one point at another. */
export function aim(from: Vec3, to: Vec3): { yaw: number; pitch: number } {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  return {
    yaw: (Math.atan2(dx, -dz) * 180) / Math.PI,
    pitch: (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI,
  };
}

/** A camera key that looks at `target`. */
export function lookKey(p: number, pos: Vec3, target: Vec3, dawn: number): FlightKey {
  return { p, pos, ...aim(pos, target), dawn };
}

/** A smooth camera path through keys: every channel interpolated without overshoot. */
export class Flight {
  private readonly xs: number[];
  private readonly ch: Record<'x' | 'y' | 'z' | 'yaw' | 'dawn', number[]>;
  private readonly pitch: Record<Orientation, number[]>;

  constructor(readonly keys: FlightKey[]) {
    this.xs = keys.map((k) => k.p);
    this.ch = {
      x: keys.map((k) => k.pos[0]),
      y: keys.map((k) => k.pos[1]),
      z: keys.map((k) => k.pos[2]),
      yaw: keys.map((k) => k.yaw),
      dawn: keys.map((k) => k.dawn),
    };
    this.pitch = {
      landscape: keys.map((k) => k.pitch ?? heroPitch('landscape')),
      portrait: keys.map((k) => k.pitch ?? heroPitch('portrait')),
    };
  }

  at(p: number, orientation: Orientation): CameraState {
    const f = (ys: number[]) => monotone(this.xs, ys, p);
    return {
      pos: [f(this.ch.x), f(this.ch.y), f(this.ch.z)],
      yaw: f(this.ch.yaw),
      pitch: f(this.pitch[orientation]),
      dawn: f(this.ch.dawn),
    };
  }
}
