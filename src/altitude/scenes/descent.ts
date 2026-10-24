/**
 * The home page's drawings as one scene: the four featured case studies, each standing on its
 * own site along the descent, each drawing itself while the camera holds over it and staying
 * drawn as the camera moves on. The director passes progress; each drawing gets its own clock.
 */
import { Group } from 'three';
import type { DrawingScene, LabelState } from '../engine/scene';
import { clockOf, WINDOWS, type SceneWindow } from '../flights/home';
import { SCENES } from './catalogue';
import type { CameraState, Vec3 } from '../world';

export class DescentScene implements DrawingScene {
  readonly group = new Group();
  readonly anchors: Record<string, Vec3> = {};
  readonly duration = 1;
  private constructor(private readonly parts: { w: SceneWindow; scene: DrawingScene }[]) {
    for (const { scene } of parts) this.group.add(scene.group);
  }

  static async create(): Promise<DescentScene> {
    const parts = await Promise.all(
      WINDOWS.map(async (w) => {
        const mod = await SCENES[w.slug].load();
        return { w, scene: mod.create(w.site) };
      }),
    );
    return new DescentScene(parts);
  }

  setViewport(w: number, h: number, dpr: number, near: number): void {
    for (const { scene } of this.parts) scene.setViewport(w, h, dpr, near);
  }

  update(p: number, camera: CameraState): void {
    for (const { w, scene } of this.parts) scene.update(clockOf(w, p, scene.duration), camera);
  }

  /** Only the drawing the camera is over carries labels. */
  labels(p: number): LabelState[] {
    const out: LabelState[] = [];
    for (const { w, scene } of this.parts) {
      if (!scene.labels) continue;
      const inside = Math.min(1, Math.max(0, (p - (w.arrive - 0.03)) / 0.02)) * Math.min(1, Math.max(0, (w.leave + 0.01 - p) / 0.02));
      for (const l of scene.labels(clockOf(w, p, scene.duration))) out.push({ ...l, id: `${w.slug}-${l.id}`, show: l.show * inside });
    }
    return out;
  }

  dispose(): void {
    for (const { scene } of this.parts) scene.dispose();
  }
}
