/**
 * A slow turn around a drawing on the sheet, under a clear morning sky: for the style guide's
 * kit specimen, where the point is to watch linework stay steady while the camera moves.
 * Progress is the turn (0 to 1 is once round); the page drives it from its own clock.
 */
import type { Director, Weather } from '../engine/scene';
import { aim, type CameraState, type Vec3 } from '../world';

export function turntable({ radius = 78, height = 34, target = [0, 2, 0] as Vec3, span = 0.6, dawn = 0.9 } = {}): Director {
  const weather: Weather = { deck: [0, 0, 0, 1], wisps: [0, 0, 0, 1], site: [target[0] - 46, target[2] - 22, target[0] + 46, target[2] + 22] };
  return {
    clouds: false,
    camera(p: number): CameraState {
      // A back-and-forth arc rather than a full circle: the drawing reads from the south.
      const a = Math.sin(p * Math.PI * 2) * span;
      const pos: Vec3 = [target[0] + Math.sin(a) * radius, height, target[2] + Math.cos(a) * radius];
      return { pos, ...aim(pos, target), dawn };
    },
    clock: () => 0,
    weather: () => weather,
    groundVisible: () => true,
    drift: () => 0,
  };
}
