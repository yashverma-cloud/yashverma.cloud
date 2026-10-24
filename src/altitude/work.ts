/**
 * A case-study page's opening: its scene plays once as the page opens, then holds with a slight
 * drift; rendering stops when the opening is off screen or the tab is hidden. The page decides
 * live or still in its head; a failed start or a lost context falls back to the still.
 */
import { LabelLayer } from './labels';
import { SCENES, VIEWS, type SceneSlug } from './scenes/catalogue';
import { workFlight } from './flights/work';
import type { AltitudeEngine, Tier } from './engine/engine';

export function bootWork(): void {
  const root = document.documentElement;
  const stage = document.querySelector<HTMLElement>('[data-work-stage]');
  if (!stage || root.dataset.mode !== 'live') return;
  const toStill = (why: unknown) => {
    console.warn('Altitude: showing the still:', why);
    root.dataset.mode = 'still';
    stage.dataset.stage = 'off';
  };
  const idle = (fn: () => void) =>
    'requestIdleCallback' in window
      ? (window as Window & { requestIdleCallback: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback(fn, { timeout: 1200 })
      : setTimeout(fn, 200);
  const start = () => idle(() => run(stage).catch(toStill));
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

async function run(stage: HTMLElement): Promise<void> {
  const params = new URLSearchParams(location.search);
  const slug = stage.dataset.workStage as SceneSlug;
  const entry = SCENES[slug];
  if (!entry) return;
  const [{ AltitudeEngine, guessTier }, mod] = await Promise.all([import('./engine/engine'), entry.load()]);
  const canvas = stage.querySelector<HTMLCanvasElement>('[data-canvas]');
  if (!canvas) return;
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) throw new Error('WebGL2 is not available');
  const forced = params.get('q') as Tier | null;
  const tier: Tier = forced && ['poster', 'ultra', 'high', 'mid', 'low'].includes(forced) ? forced : guessTier(probe);
  probe.getExtension('WEBGL_lose_context')?.loseContext();
  const scene = mod.create();
  const capture = params.has('capture');
  const engine: AltitudeEngine = new AltitudeEngine({ canvas, tier, scene, director: workFlight(VIEWS[slug], scene.site), capture });
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    document.documentElement.dataset.mode = 'still';
    stage.dataset.stage = 'off';
  });
  await engine.init();
  stage.dataset.stage = 'on';
  const labels = new LabelLayer(stage.querySelector<HTMLElement>('[data-labels]')!, stage.querySelector<SVGSVGElement>('[data-leaders]')!);
  const small = () => (Math.min(window.innerWidth, window.innerHeight) < 600 ? 0.7 : 1);
  window.addEventListener('resize', () => engine.resize());

  if (capture) {
    // Stills: render a given moment of the opening on request (scripts/altitude/posters.mjs).
    const w = window as unknown as Record<string, unknown>;
    w.__alt = {
      engine,
      goto(p: number, t: number, frames = 4) {
        engine.renderAt(p, t, frames, 0);
        labels.update(scene.labels?.(t) ?? [], engine, small());
      },
      duration: scene.duration,
    };
    w.__altReady = true;
    return;
  }

  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(stage);
  const t0 = performance.now();
  let last = t0;
  const play = scene.duration / 0.85 + 0.4;
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!visible || document.hidden) return;
    const s = (now - t0) / 1000;
    const p = Math.min(1, s / play);
    const t = Math.min(scene.duration, s * 0.85);
    engine.setProgress(p);
    engine.setSceneTime(t);
    engine.tick(dt);
    labels.update(scene.labels?.(t) ?? [], engine, small());
  };
  requestAnimationFrame(frame);
}
