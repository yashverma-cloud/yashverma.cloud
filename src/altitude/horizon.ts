/**
 * The hero's name stands on the rendered horizon. CSS lays the hero out once, on the poster's
 * horizon (a fixed fraction of the stage, Hero.astro); the live horizon moves with the camera's
 * pitch and idle sway, and the difference is applied as a transform (`--horizon-shift`), so the
 * hero follows the scene without ever moving the layout.
 *
 * Everything is measured on the stage, the large viewport the scene renders into. On a phone,
 * window.innerHeight is the small viewport while the URL bar shows, which is not where the
 * scene's horizon is.
 */
import { FOV, HERO_HORIZON, type Orientation } from './world';

export class HorizonRig {
  private w = 1;
  private h = 1;
  private base = 0;
  private last = Number.NaN;

  constructor(
    private readonly stage: HTMLElement,
    private readonly copy: HTMLElement,
  ) {
    this.measure();
  }

  /** Layout reads, on resize only. */
  measure(): void {
    this.w = this.stage.clientWidth || window.innerWidth;
    this.h = this.stage.clientHeight || window.innerHeight;
    // The poster's horizon, from the same media query the hero's CSS uses.
    const tall = matchMedia('(max-aspect-ratio: 1/1)').matches;
    this.base = (tall ? HERO_HORIZON.portrait : HERO_HORIZON.landscape) * this.h;
    this.last = Number.NaN;
  }

  /** The scene's orientation (engine.ts decides it from the canvas, which fills the stage). */
  get orientation(): Orientation {
    return this.w / this.h < 1 ? 'portrait' : 'landscape';
  }

  /** The horizon's height in CSS px from the top of the stage, for a camera pitch in degrees. */
  forPitch(pitchDeg: number): number {
    const half = (FOV[this.orientation] / 2) * (Math.PI / 180);
    const ndc = Math.tan((-pitchDeg * Math.PI) / 180) / Math.tan(half);
    return ((1 - ndc) / 2) * this.h;
  }

  /** Stands the name on a horizon `y` CSS px from the top of the stage. */
  set(y: number): void {
    const shift = Math.round((y - this.base) * 4) / 4;
    if (shift !== this.last) {
      this.copy.style.setProperty('--horizon-shift', `${shift}px`);
      this.last = shift;
    }
  }
}
