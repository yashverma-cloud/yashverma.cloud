/**
 * A case-study page's flight: the camera eases from `from` to `to` while the drawing plays,
 * then holds with a slight drift. On wide screens it looks a little left of the drawing, so
 * the drawing sits right of centre, clear of the copy on the left. No clouds: the scene is on
 * the survey sheet at dawn.
 */
import type { SceneView } from '../scenes/catalogue';
import type { Director, Weather } from '../engine/scene';
import { aim, type CameraState, type Orientation, type Vec3 } from '../world';

export function workFlight(view: SceneView, site: [number, number, number, number] = [-170, -110, 170, 110]): Director {
  const weather: Weather = { deck: [0, 0, 0, 1], wisps: [0, 0, 0, 1], site };
  return {
    clouds: false,
    camera(p: number, orientation: Orientation): CameraState {
      const e = 1 - (1 - p) ** 3;
      const pos: Vec3 = [
        view.from[0] + (view.to[0] - view.from[0]) * e,
        view.from[1] + (view.to[1] - view.from[1]) * e,
        view.from[2] + (view.to[2] - view.from[2]) * e,
      ];
      const dx = view.target[0] - pos[0];
      const dz = view.target[2] - pos[2];
      const d = Math.hypot(dx, dz) || 1;
      const shift = orientation === 'landscape' ? 0.24 : 0;
      // Left of the line of sight, so the drawing lands right of centre.
      const look: Vec3 = [view.target[0] + (dz / d) * shift * d, view.target[1], view.target[2] - (dx / d) * shift * d];
      return { pos, ...aim(pos, look), dawn: view.dawn };
    },
    clock: () => 0,
    weather: () => weather,
    groundVisible: () => true,
    drift: () => 0.12,
  };
}
