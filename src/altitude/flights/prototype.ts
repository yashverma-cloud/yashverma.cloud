/**
 * The /lab/altitude/ prototype's flight: the hero above the cloud sea, a dive through it, the
 * gap between layers at dawn, then a break in the deck and down to the Karpenter drawing.
 */
import type { Director, Weather } from '../engine/scene';
import { BEATS, layout } from '../scenes/karpenter-plan';
import { Flight, lookKey, piecewise, smoothstepRange, type CameraState, type Orientation, type Vec3 } from '../world';

const LOT = layout().newNode;
const LOT_AIM: Vec3 = [LOT.x - 6, 11, LOT.z - 10];
const FIELD_AIM: Vec3 = [0, 0, -30];

const FLIGHT = new Flight([
  { p: 0.0, pos: [0, 4100, 9400], yaw: 0, pitch: null, dawn: 0.0 },
  { p: 0.07, pos: [0, 4040, 8800], yaw: 0, pitch: null, dawn: 0.04 },
  { p: 0.17, pos: [0, 3230, 7300], yaw: -2, pitch: -16, dawn: 0.16 },
  { p: 0.25, pos: [0, 2760, 6200], yaw: -3, pitch: -14, dawn: 0.3 },
  { p: 0.31, pos: [0, 2150, 5300], yaw: -2, pitch: -6, dawn: 0.42 },
  { p: 0.37, pos: [0, 1780, 4500], yaw: 4, pitch: -1.5, dawn: 0.52 },
  { p: 0.46, pos: [0, 1690, 3300], yaw: 9, pitch: -2.5, dawn: 0.62 },
  { p: 0.54, pos: [0, 1720, 2050], yaw: 3, pitch: -18, dawn: 0.7 },
  lookKey(0.6, [0, 1760, 1150], [0, 0, 40], 0.76),
  lookKey(0.66, [0, 1060, 760], [0, 0, 0], 0.82),
  lookKey(0.72, [0, 210, 430], FIELD_AIM, 0.88),
  lookKey(0.775, [LOT.x + 58, 70, LOT.z + 156], LOT_AIM, 0.91),
  lookKey(0.85, [LOT.x + 46, 60, LOT.z + 132], LOT_AIM, 0.94),
  lookKey(0.885, [20, 120, 330], [0, 0, -20], 0.96),
  lookKey(0.94, [0, 190, 400], FIELD_AIM, 0.99),
  lookKey(1.0, [0, 200, 420], FIELD_AIM, 1.0),
]);

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
 * The drawing's clock against flight progress. It starts as the camera looks down through the
 * break, so the running cluster materialises below while the deck still frames it.
 */
const CLOCK: [number, number][] = [
  [0.6, 0.0],
  [0.7, 0.6],
  [0.765, 0.86],
  [0.835, BEATS.ready],
  [0.85, BEATS.ready + 0.4],
  [0.87, BEATS.scale],
  [0.94, BEATS.end],
];

const WEATHER: Weather = {
  deck: [0, 260, 820, 600],
  wisps: [0, 120, 380, 420],
  site: [-170, -110, 170, 110],
};

export const prototypeFlight: Director = {
  clouds: true,
  camera(p: number, orientation: Orientation): CameraState {
    const c = FLIGHT.at(p, orientation);
    // From the arrival under the deck to the end, the copy owns the left third on wide screens
    // and the bottom third on tall ones; turn the camera so the drawing sits clear of it.
    const frame = smoothstepRange(0.68, 0.73, p);
    // Less turn for the wide shot at the end: the whole field has to stay in frame.
    const yawShift = orientation === 'landscape' ? -(14 - 4 * smoothstepRange(0.87, 0.94, p)) * frame : 0;
    const pitchShift = orientation === 'portrait' ? -7 * frame : 0;
    // A tall screen sees a narrow slice; for the wide shot it backs away until the field fits.
    const dolly = 1 + (orientation === 'portrait' ? 0.55 : 0.34) * smoothstepRange(0.87, 0.94, p);
    const pos: Vec3 =
      dolly === 1
        ? c.pos
        : [
            FIELD_AIM[0] + (c.pos[0] - FIELD_AIM[0]) * dolly,
            FIELD_AIM[1] + (c.pos[1] - FIELD_AIM[1]) * dolly,
            FIELD_AIM[2] + (c.pos[2] - FIELD_AIM[2]) * dolly,
          ];
    return { pos, yaw: c.yaw + yawShift, pitch: c.pitch + pitchShift, dawn: c.dawn };
  },
  clock: (p) => (p <= CLOCK[0][0] ? 0 : piecewise(CLOCK, p)),
  weather: () => WEATHER,
  groundVisible: (c) => c.pos[1] < 1950,
  drift: (p) => 1 - Math.min(1, p / 0.5) * 0.6,
};
