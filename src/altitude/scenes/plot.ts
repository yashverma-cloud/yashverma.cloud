/**
 * The base for a case-study scene drawn with the kit: a scene declares strokes, washes and
 * solids in its own coordinates (metres, around its origin) with the scene seconds at which the
 * plotter draws them, then calls `build()`, which makes one instanced layer of each.
 *
 * The plotter only draws and lifts: a box that "shrinks" is lifted while a smaller one is drawn,
 * a block that "moves" is a row of blocks shown one after another. That keeps every primitive
 * static, and so steady under a moving camera (kit.ts).
 */
import { Group } from 'three';
import type { DrawingScene, LabelState } from '../engine/scene';
import { FillLayer, INK, ORDER, plotBox, plotLoop, SolidLayer, StrokeLayer, WEIGHT, type BoxSpec, type Stroke } from '../engine/kit';
import type { CameraState, Vec3 } from '../world';

export type StrokeStyle = Pick<Stroke, 'color' | 'width' | 'dash' | 'period' | 'out'>;

export const LINE: StrokeStyle = { color: INK.line, width: WEIGHT.primary };
export const FIELD: StrokeStyle = { color: INK.line, width: WEIGHT.secondary };
export const BUILD: StrokeStyle = { color: INK.line, width: WEIGHT.construction };
export const GUIDE: StrokeStyle = { color: INK.line, width: WEIGHT.guide, dash: 'dash', period: 2.4 };
export const AMBER: StrokeStyle = { color: INK.signal, width: WEIGHT.construction, dash: 'dash', period: 2.4 };
export const BOUNDARY: StrokeStyle = { color: INK.line, width: WEIGHT.construction, dash: 'dashdot', period: 8.3 };

/** 0 outside [a, b], 1 inside, with `fade` seconds of ramp at each end. */
export function win(t: number, a: number, b: number, fade = 0.12): number {
  return Math.min(Math.max((t - a) / fade, 0), 1) * Math.min(Math.max((b - t) / fade, 0), 1);
}

/** Smooth 0 to 1 across [a, b]. */
export function ramp(t: number, a: number, b: number): number {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

interface SolidSpec {
  pos: Vec3;
  size: Vec3;
  t: number;
  out?: number;
}

export abstract class PlotScene implements DrawingScene {
  readonly group = new Group();
  readonly anchors: Record<string, Vec3> = {};
  readonly site: [number, number, number, number];
  abstract readonly duration: number;
  protected readonly strokes: Stroke[] = [];
  protected readonly washes: (BoxSpec & { t: number; dur: number; out?: number })[] = [];
  protected readonly amberWashes: (BoxSpec & { t: number; dur: number; out?: number })[] = [];
  protected readonly solids: SolidSpec[] = [];
  protected readonly amberSolids: SolidSpec[] = [];
  private layers: { setTime(t: number): void; dispose(): void }[] = [];
  private strokeLayer: StrokeLayer | null = null;

  /** `half`: half the site's extent (x, z), for the survey grid and the boundary. */
  constructor(
    readonly origin: Vec3,
    readonly half: [number, number],
  ) {
    this.group.position.set(...origin);
    this.site = [origin[0] - half[0] - 4, origin[2] - half[1] - 4, origin[0] + half[0] + 4, origin[2] + half[1] + 4];
  }

  /** A world point from a point in the scene's own coordinates. */
  at(p: Vec3): Vec3 {
    return [p[0] + this.origin[0], p[1] + this.origin[1], p[2] + this.origin[2]];
  }

  /** The site boundary, dash-dot, drawn first. */
  protected boundary(t = 0, dur = 0.5): void {
    const [hx, hz] = this.half;
    this.loop(
      [
        [-hx, 0.2, -hz],
        [hx, 0.2, -hz],
        [hx, 0.2, hz],
        [-hx, 0.2, hz],
      ],
      t,
      dur,
      BOUNDARY,
    );
  }

  /** A box in the plotter's order; with `wash`, its faces get a faint wash once it closes. */
  protected box(b: BoxSpec, t: number, dur: number, style: StrokeStyle = LINE, wash = true): void {
    const out = style.out;
    for (const s of plotBox(b, t, dur, style.width, style.color)) this.strokes.push({ ...s, out, dash: style.dash, period: style.period });
    if (wash) (style.color === INK.signal ? this.amberWashes : this.washes).push({ ...b, y: b.y ?? 0, t, dur, out: out?.[0] });
  }

  /** A closed outline. */
  protected loop(corners: Vec3[], t: number, dur: number, style: StrokeStyle): void {
    this.strokes.push(...plotLoop(corners, t, dur, style));
  }

  /** One straight stroke. */
  protected line(a: Vec3, b: Vec3, t0: number, t1: number, style: StrokeStyle = BUILD): void {
    this.strokes.push({ a, b, t0, t1, ...style });
  }

  /** A polyline, its time shared out by length, so the pen moves at one speed. */
  protected path(points: Vec3[], t0: number, t1: number, style: StrokeStyle = BUILD): void {
    const lens = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1], p[2] - points[i][2]));
    const total = lens.reduce((a, b) => a + b, 0) || 1;
    let at = t0;
    lens.forEach((len, i) => {
      const dt = ((t1 - t0) * len) / total;
      this.strokes.push({ a: points[i], b: points[i + 1], t0: at, t1: at + dt, ...style });
      at += dt;
    });
  }

  /** A tick mark standing upright at `p`, facing +z, `size` metres tall. */
  protected tick(p: Vec3, size: number, t: number, style: StrokeStyle = LINE): void {
    const [x, y, z] = p;
    this.path(
      [
        [x - size * 0.45, y + size * 0.45, z],
        [x - size * 0.1, y + size * 0.1, z],
        [x + size * 0.55, y + size * 0.95, z],
      ],
      t,
      t + 0.22,
      style,
    );
  }

  /** A solid block (pods, data). Amber for the one warm state. */
  protected solid(pos: Vec3, size: Vec3, t: number, out?: number, amber = false): void {
    (amber ? this.amberSolids : this.solids).push({ pos, size, t, out });
  }

  /**
   * Blocks travelling along a line: `count` positions, each showing a block for `stay` seconds
   * in turn, cycle after cycle from t0 to t1.
   */
  protected stream(a: Vec3, b: Vec3, size: Vec3, t0: number, t1: number, { count = 8, gap = 0.09, stay = 0.18, amberAt = -1 } = {}): void {
    const period = count * gap;
    for (let start = t0; start < t1 - 1e-6; start += period) {
      for (let i = 0; i < count; i++) {
        const on = start + i * gap;
        if (on > t1) break;
        const f = (i + 0.5) / count;
        const pos: Vec3 = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
        this.solid(pos, size, on, on + stay, i === amberAt);
      }
    }
  }

  /** Builds the layers. `viewpoint` orders the solids back to front. */
  protected build(viewpoint: Vec3): void {
    const fills = new FillLayer(this.washes);
    this.group.add(fills.mesh);
    this.layers.push(fills);
    if (this.amberWashes.length) {
      const amber = new FillLayer(this.amberWashes, 0.12, INK.signal);
      this.group.add(amber.mesh);
      this.layers.push(amber);
    }
    this.strokeLayer = new StrokeLayer(this.strokes);
    this.group.add(this.strokeLayer.mesh);
    this.layers.push(this.strokeLayer);
    if (this.solids.length) {
      const s = new SolidLayer(this.solids, INK.line.map((v) => v * 0.86) as Vec3, viewpoint);
      this.group.add(s.mesh);
      this.layers.push(s);
    }
    if (this.amberSolids.length) {
      const s = new SolidLayer(this.amberSolids, INK.signal, viewpoint, ORDER.focus);
      this.group.add(s.mesh);
      this.layers.push(s);
    }
    this.update(0);
  }

  setViewport(w: number, h: number, dpr: number, near: number): void {
    this.strokeLayer?.setViewport(w, h, dpr, near);
  }

  update(t: number, camera?: CameraState): void {
    for (const l of this.layers) l.setTime(t);
    this.group.visible = !camera || camera.pos[1] < 2200;
  }

  /** A label hung from a point in the scene's own coordinates. */
  protected label(id: string, local: Vec3, text: string, show: number, dx: number, dy: number, more: Partial<LabelState> = {}): LabelState {
    return { id, anchor: this.at(local), text, show, dx, dy, ...more };
  }

  abstract labels(t: number): LabelState[];

  dispose(): void {
    for (const l of this.layers) l.dispose();
  }
}
