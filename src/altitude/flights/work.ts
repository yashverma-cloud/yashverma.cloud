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
      // A tall screen sees a narrow slice: it stands further back until the drawing fits.
      const back = orientation === 'portrait' ? 1.6 : 1;
      const at = (k: 0 | 1 | 2) => view.target[k] + (view.from[k] + (view.to[k] - view.from[k]) * e - view.target[k]) * back;
      const pos: Vec3 = [at(0), at(1), at(2)];
      const dx = view.target[0] - pos[0];
      const dz = view.target[2] - pos[2];
      const d = Math.hypot(dx, dz) || 1;
      const shift = orientation === 'landscape' ? 0.1 : 0;
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
