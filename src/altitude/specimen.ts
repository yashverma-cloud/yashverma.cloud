/**
 * Mounts the drawing kit's specimen on a canvas (style guide). Turns slowly and redraws every
 * eight seconds; under reduced motion it shows the finished drawing, still.
 */
import type { AltitudeEngine } from './engine/engine';

export async function mountSpecimen(canvas: HTMLCanvasElement): Promise<void> {
  if (!('WebGL2RenderingContext' in window)) return;
  const [{ AltitudeEngine, guessTier }, { SpecimenScene, SPECIMEN_END }, { turntable }] = await Promise.all([
    import('./engine/engine'),
    import('./scenes/specimen'),
    import('./flights/turntable'),
  ]);
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) return;
  const tier = guessTier(probe);
  probe.getExtension('WEBGL_lose_context')?.loseContext();
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const engine: AltitudeEngine = new AltitudeEngine({ canvas, tier, scene: new SpecimenScene(), director: turntable() });
  await engine.init();
  canvas.dataset.on = 'true';
  new ResizeObserver(() => engine.resize()).observe(canvas);
  if (still) {
    engine.setProgress(0.12, true);
    engine.setSceneTime(SPECIMEN_END);
    engine.renderNow();
    return;
  }
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);
  const start = performance.now();
  let last = start;
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    const s = (now - start) / 1000;
    engine.setProgress((s / 40) % 1, true);
    engine.setSceneTime(Math.min(SPECIMEN_END, s % 8));
    engine.tick(Math.min(0.1, (now - last) / 1000));
    last = now;
  };
  requestAnimationFrame(loop);
}
