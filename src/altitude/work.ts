/**
 * A case-study page's scene. The opening plays the drawing as the page opens, then holds with a
 * slight drift; rendering stops when nothing is on screen or the tab is hidden. The page decides
 * live or still in its head; a failed start or a lost context falls back to the stills.
 *
 * Wide screens read on with the scene (the canvas is fixed there). As the opening scrolls away,
 * the camera moves the drawing beside the text and the drawing winds back to where the story
 * starts; from there the drawing's clock runs through each section's state as it is read
 * (STATES in scenes/catalogue.ts), eased so a jump of the scroll is a short replay, never a cut.
 * Nothing sways while reading, so once the reader stops, the scene settles and stops rendering.
 * Narrow screens keep the opening as it is and show the sections' states as stills.
 */
import { copyAreas, LabelLayer, type Area } from './labels';
import { SCENES, STATE_KEYS, STATES, VIEWS, type ReadingState, type SceneSlug } from './scenes/catalogue';
import { READ, stateProgress, workFlight } from './flights/work';
import type { AltitudeEngine, Tier } from './engine/engine';

/** Where the drawing reads beside the text; the page's CSS uses the same query. */
const WIDE = '(min-width: 60rem) and (min-aspect-ratio: 5/4)';
/** The reading line, as a fraction of the screen's height from the top. */
const LINE = 0.55;

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

/**
 * Still mode on wide screens: the section at the reading line shows its still (the page's CSS
 * fades it in over the last one), and the sections beside it are marked near, so their stills
 * load before they are needed. Before the case study, none. Cheap enough to run in every mode:
 * a live page that falls back to its stills has them in step at once.
 */
export function bootStills(): void {
  const wide = window.matchMedia(WIDE);
  const article = document.querySelector<HTMLElement>('[data-case]');
  const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-step]'));
  if (!article || !sections.length) return;
  let queued = false;
  const update = () => {
    queued = false;
    if (!wide.matches) return;
    const h = window.innerHeight;
    const top = article.getBoundingClientRect().top;
    let active = top < h * 0.5 ? 0 : -1;
    const tops = sections.map((s) => s.getBoundingClientRect().top);
    tops.forEach((y, k) => {
      if (active >= 0 && y <= h * LINE) active = k;
    });
    const near = active < 0 ? (top < h * 1.5 ? [0] : []) : [active - 1, active + 1];
    sections.forEach((s, k) => {
      s.toggleAttribute('data-active', k === active);
      s.toggleAttribute('data-near', near.includes(k));
    });
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  wide.addEventListener('change', queue);
  update();
}

async function run(stage: HTMLElement): Promise<void> {
  const params = new URLSearchParams(location.search);
  const slug = stage.dataset.workStage as SceneSlug;
  const entry = SCENES[slug];
  if (!entry) return;
  // The labels' face, asked for now (after the page's LCP) so they never appear in a stand-in.
  const mono = document.fonts.load('1em "B612 Mono"').catch(() => []);
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
  const states: ReadingState[] = STATE_KEYS.map((k) => STATES[slug][k]);
  const director = workFlight(VIEWS[slug], scene.site, states);
  director.aspect = window.innerWidth / window.innerHeight;
  const engine: AltitudeEngine = new AltitudeEngine({ canvas, tier, scene, director, capture, dpr: Number(params.get('dpr')) || undefined });
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    document.documentElement.dataset.mode = 'still';
    stage.dataset.stage = 'off';
  });
  await engine.init();
  await Promise.race([mono, new Promise((ok) => setTimeout(ok, 1500))]);
  stage.dataset.stage = 'on';
  const labels = new LabelLayer(stage.querySelector<HTMLElement>('[data-labels]')!, stage.querySelector<SVGSVGElement>('[data-leaders]')!);
  const small = () => (Math.min(window.innerWidth, window.innerHeight) < 600 ? 0.7 : 1);
  const wide = window.matchMedia(WIDE);
  const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-step]'));
  const column = document.querySelector<HTMLElement>('[data-step] h2');

  // Layout, read on resize and when the page reflows, never per frame.
  const layout = { tops: [] as number[], end: 0, opening: [] as Area[], reading: [] as Area[] };
  let reading = false;
  const measure = () => {
    const y = window.scrollY;
    layout.tops = sections.map((s) => s.getBoundingClientRect().top + y);
    const last = sections.at(-1);
    layout.end = last ? last.getBoundingClientRect().bottom + y : 0;
    layout.opening = copyAreas(stage, document.querySelector('[data-frame-title]'), document.querySelector('[data-frame-beats]'));
    // The labels keep off the whole text column while reading, not just its words.
    const right = column ? column.getBoundingClientRect().right : window.innerWidth / 2;
    layout.reading = [{ l: 0, r: right + 24, t: 0, b: window.innerHeight }];
    labels.setKeepOut(reading ? layout.reading : layout.opening);
    director.aspect = window.innerWidth / window.innerHeight;
  };
  measure();

  /** Progress and the drawing's clock the page asks for now (`s`: seconds since the scene began). */
  const want = (s: number): { p: number; t: number; reading: boolean } => {
    const play = scene.duration / 0.85 + 0.4;
    const opening = { p: Math.min(1, s / play), t: Math.min(scene.duration, s * 0.85), reading: false };
    if (!wide.matches || !sections.length) return opening;
    const line = window.scrollY + window.innerHeight * LINE;
    const first = layout.tops[0];
    if (line < first) {
      // From the opening to the reading view as the opening scrolls away; the drawing winds back
      // with it to where the story starts.
      const away = Math.min(1, window.scrollY / Math.max(1, first - window.innerHeight * LINE));
      if (away <= 0) return opening;
      return { p: 1 + away * (READ.start - 1), t: opening.t + (states[0].t[0] - opening.t) * away, reading: true };
    }
    // Section k runs from its top to the next one's (the last to the end of the case study).
    let k = 0;
    while (k < layout.tops.length - 1 && line >= layout.tops[k + 1]) k++;
    const top = layout.tops[k];
    const bottom = k < layout.tops.length - 1 ? layout.tops[k + 1] : layout.end;
    const p = stateProgress(k, (line - top) / Math.max(1, bottom - top));
    return { p, t: director.clock(p), reading: true };
  };

  if (capture) {
    // Stills: render a given moment on request (scripts/altitude/posters.mjs). `goto` takes the
    // page's progress (0 to 1 the opening, then the reading: stateProgress) and the drawing's
    // time; `snapshot` frames the drawing alone, centred, for a phone's section snapshot.
    const w = window as unknown as Record<string, unknown>;
    w.__alt = {
      engine,
      director,
      states,
      read: READ,
      stateProgress,
      goto(p: number, t: number, frames = 4, snapshot = false) {
        director.snapshot = snapshot;
        director.aspect = window.innerWidth / window.innerHeight;
        labels.setKeepOut(snapshot ? [] : p > 1 ? layout.reading : layout.opening);
        engine.renderAt(p, t, frames, 0);
        labels.update(scene.labels?.(t) ?? [], engine, small());
      },
      // What the live page would ask for at this scroll position, `s` seconds in (recordings).
      want,
      duration: scene.duration,
    };
    w.__altReady = true;
    return;
  }

  let openingVisible = true;
  let caseVisible = false;
  new IntersectionObserver(([e]) => {
    openingVisible = e.isIntersecting;
    wake();
  }).observe(stage);
  const article = document.querySelector('[data-case]');
  if (article)
    new IntersectionObserver(([e]) => {
      caseVisible = e.isIntersecting;
      wake();
    }).observe(article);

  const t0 = performance.now();
  let last = t0;
  let time = -1;
  let running = false;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const s = (now - t0) / 1000;
    const w = want(s);
    // The drawing's clock eases to where the page is, at most a few seconds of drawing a second.
    if (time < 0) time = w.t;
    const step = w.t - time;
    time += Math.sign(step) * Math.min(Math.abs(step), Math.max(Math.abs(step) * (1 - Math.exp(-dt * 5)), dt * 0.4), dt * 3);
    if (Math.abs(w.t - time) < 0.002) time = w.t;
    if (w.reading !== reading) {
      reading = w.reading;
      labels.setKeepOut(reading ? layout.reading : layout.opening);
    }
    engine.setProgress(w.p);
    engine.setSceneTime(time);
    engine.tick(dt);
    labels.update(scene.labels?.(time) ?? [], engine, small());
    // Keep going while anything moves: the opening's play and sway, the camera, the clock.
    const opening = !reading && openingVisible;
    const busy = opening || !engine.settled || time !== w.t;
    const shown = (openingVisible || (wide.matches && caseVisible)) && !document.hidden;
    if (busy && shown) requestAnimationFrame(frame);
    else running = false;
  };
  const wake = () => {
    if (running || document.hidden) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  };
  const reflow = () => {
    engine.resize();
    measure();
    wake();
  };
  window.addEventListener('resize', reflow);
  wide.addEventListener('change', reflow);
  // The font swap and lazy images reflow the case study: its sections move.
  new ResizeObserver(() => {
    measure();
    wake();
  }).observe(document.body);
  window.addEventListener('scroll', wake, { passive: true });
  document.addEventListener('visibilitychange', wake);
  wake();
}
