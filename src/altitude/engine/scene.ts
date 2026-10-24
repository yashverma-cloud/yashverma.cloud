/**
 * What the engine draws and how it moves, kept apart so one engine serves every page:
 *
 *   DrawingScene  a case study's system as plotter linework (built from the drawing kit).
 *   Director      the camera and the drawing's clock at each point of the page's progress,
 *                 plus the weather: where the deck breaks open and where the wisps clear.
 *
 * The home page directs a descent through several scenes; a case-study page directs one scene
 * from a fixed vantage; the style guide directs a slow turn around the kit specimen.
 */
import type { Group } from 'three';
import type { CameraState, Orientation, Vec3 } from '../world';

/** One label on a drawing: HTML in the data face, hung on a leader from a world point. */
export interface LabelState {
  id: string;
  /** World point the leader starts from. */
  anchor: Vec3;
  /** State words only: pending, ready, a name. */
  text: string;
  /** A tabular value after the words: a clock, a counter. */
  tick?: string;
  /** 0 hidden to 1 shown. */
  show: number;
  /** A failure or waste state the case study describes. */
  amber?: boolean;
  /** Where the label sits from its anchor, in CSS px (scaled down on small screens). */
  dx: number;
  dy: number;
}

export interface DrawingScene {
  readonly group: Group;
  /** Named world points that HTML labels hang from. */
  readonly anchors: Record<string, Vec3>;
  /** The drawing's own clock runs from 0 to `duration` seconds. */
  readonly duration: number;
  setViewport(width: number, height: number, dpr: number, near: number): void;
  /** `t` is the clock the director gives for this frame; `camera` is where it looks from. */
  update(t: number, camera: CameraState): void;
  /** The drawing's labels at clock `t`. */
  labels?(t: number): LabelState[];
  /** The survey grid under the drawing, world x0, z0, x1, z1. */
  readonly site?: [number, number, number, number];
  dispose(): void;
}

/** A circular clearing in a cloud layer: centre x, z, clear radius and feathering, in metres. */
export type Clearing = [number, number, number, number];

export interface Weather {
  /** The break in the deck. */
  deck: Clearing;
  /** The clearing in the low wisps. */
  wisps: Clearing;
  /** The survey grid under the drawing: x0, z0, x1, z1. */
  site: [number, number, number, number];
}

export interface Director {
  /** The camera at progress `p` (0 to `end`) for the screen's orientation. */
  camera(p: number, orientation: Orientation): CameraState;
  /** The drawing's clock at progress `p`, in scene seconds. */
  clock(p: number): number;
  /** The weather at progress `p`. */
  weather(p: number): Weather;
  /** Whether the ground can be seen from here; when it cannot, its shading is skipped. */
  groundVisible(camera: CameraState): boolean;
  /** Whether the clouds are drawn at all (a case-study page may have none). */
  readonly clouds: boolean;
  /** Idle sway, 0 (none) to 1 (full), at progress `p`. */
  drift(p: number): number;
  /** Where progress ends: 1 unless the page flies on (the home page's approach runs to 2). */
  readonly end?: number;
}
