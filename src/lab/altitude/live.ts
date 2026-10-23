/**
 * Live mode: smooth scroll, one flight clock shared by the copy and the scene, the
 * choreography, the altimeter, the 3D labels, and the scene itself (loaded on idle).
 *
 * One clock matters: the copy is scrubbed by the same smoothed progress the camera flies on,
 * so text anchored to the world (the name on the horizon, labels on the drawing) never
 * drifts against it.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { BEATS } from './site';
import { cameraAt, feet, FOV, sceneClockAt } from './world';
import type { AltitudeEngine, MethodName, Tier } from './engine/engine';

gsap.registerPlugin(ScrollTrigger);

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll(sel)) as T[];

const params = new URLSearchParams(location.search);
const root = document.documentElement;

function orientation(): 'landscape' | 'portrait' {
  return window.innerWidth / window.innerHeight < 1 ? 'portrait' : 'landscape';
}

/** Horizon height in CSS pixels for a camera pitch, matching the scene's projection. */
function horizonFor(pitchDeg: number): number {
  const half = (FOV[orientation()] / 2) * (Math.PI / 180);
  const ndc = Math.tan((-pitchDeg * Math.PI) / 180) / Math.tan(half);
  return ((1 - ndc) / 2) * window.innerHeight;
}

/** Builds the scrubbed choreography: one timeline whose 0 to 1 is the flight's 0 to 1. */
function choreography(): gsap.core.Timeline {
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
  // gsap needs the timeline to span exactly 1 for progress to equal flight progress.
  tl.set({}, {}, 1);

  const hero = $('.plate-hero .plate-copy');
  tl.fromTo('[data-hero-cue]', { opacity: 1 }, { opacity: 0, duration: 0.025 }, 0.005);
  tl.fromTo(hero, { opacity: 1 }, { opacity: 0, duration: 0.05, ease: 'power1.in' }, 0.1);

  const sf = $('[data-descent] .standfirst');
  tl.fromTo(sf, { opacity: 0, filter: 'blur(10px)', y: 24 }, { opacity: 1, filter: 'blur(0px)', y: 0, duration: 0.035, ease: 'power2.out' }, 0.13);
  // Into the cloud: the paragraph goes soft with the view.
  tl.to(sf, { opacity: 0, filter: 'blur(16px)', y: -12, duration: 0.04, ease: 'power1.in' }, 0.255);

  const rows = $$('[data-proof-row]');
  // Out of the cloud base, the numbers condense one by one.
  tl.fromTo(rows, { opacity: 0, filter: 'blur(12px)', y: 18 }, { opacity: 1, filter: 'blur(0px)', y: 0, duration: 0.03, stagger: 0.012, ease: 'power2.out' }, 0.375);
  // As the camera tips toward the break, the summary climbs away with the horizon.
  tl.to(rows, { opacity: 0, y: -80, duration: 0.03, stagger: 0.006, ease: 'power1.in' }, 0.52);

  const head = $('[data-case-head]');
  tl.fromTo(head, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.03, ease: 'power2.out' }, 0.6);
  tl.to(head, { opacity: 0, duration: 0.02 }, 0.965);

  const beat = (name: string, at: number, until: number) => {
    const el = $(`.beat[data-beat='${name}']`);
    tl.fromTo(el, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.014, ease: 'power2.out' }, at);
    tl.to(el, { opacity: 0, y: -14, duration: 0.01, ease: 'power1.in' }, until);
  };
  beat('pending', 0.765, 0.8);
  beat('provision', 0.81, 0.862);
  beat('scale', 0.872, 0.926);
  beat('tuned', 0.934, 0.972);

  tl.fromTo($$('[data-end] > *'), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.012, stagger: 0.004 }, 0.976);
  return tl;
}

/** The altimeter: ticks every 250 ft, figures every 1,000 ft. */
function buildTape(): { set(altFeet: number): void; rebuild(): void } {
  const strip = $('[data-tape-strip]');
  const read = $('[data-tape-read]');
  let pxPerFt = 0;
  const rebuild = () => {
    pxPerFt = window.innerHeight / 2 / 2600;
    strip.textContent = '';
    for (let a = 0; a <= 15000; a += 250) {
      const i = document.createElement('i');
      if (a % 1000 === 0) i.className = 'major';
      i.style.top = `${-a * pxPerFt}px`;
      strip.appendChild(i);
    }
  };
  rebuild();
  let last = -1;
  return {
    rebuild,
    set(alt: number) {
      strip.style.transform = `translate3d(0, ${alt * pxPerFt}px, 0)`;
      const shown = Math.round(alt / 10) * 10;
      if (shown !== last) {
        read.textContent = shown.toLocaleString('en-US');
        last = shown;
      }
    },
  };
}

interface Label {
  el: HTMLElement;
  text: HTMLElement;
  extra: HTMLElement | null;
  line: SVGLineElement;
}

function buildLabels(): Record<'pending' | 'node' | 'field', Label> {
  const svg = $<SVGSVGElement>('[data-leaders]');
  const make = (name: 'pending' | 'node' | 'field', extraSel: string): Label => {
    const el = $(`[data-label='${name}']`);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    svg.appendChild(line);
    return { el, text: $('[data-label-text]', el), extra: el.querySelector(extraSel), line };
  };
  return {
    pending: make('pending', 'x'),
    node: make('node', '[data-label-clock]'),
    field: make('field', '[data-label-count]'),
  };
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export async function startLive(): Promise<void> {
  const fine = matchMedia('(pointer: fine)').matches;
  const lenis = fine ? new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 }) : null;
  if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  const tl = choreography();
  const tape = buildTape();
  const labels = buildLabels();
  const heroCopy = $('.plate-hero .plate-copy');

  // Flight clock: scroll gives the target; one smoothing (none under Lenis, which already
  // eases) feeds both the copy and the camera.
  let target = 0;
  let p = 0;
  const trigger = ScrollTrigger.create({
    trigger: '.flight',
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      target = self.progress;
    },
  });
  target = trigger.progress;
  p = target;

  let engine: AltitudeEngine | null = null;
  const pt = { x: 0, y: 0, visible: false };

  // Label heights are read once per resize, never inside the frame: a read after the
  // writes above would force a layout every frame.
  let labelHalf = 10;
  const measureLabels = () => {
    labelHalf = labels.node.el.offsetHeight / 2 || 10;
  };
  measureLabels();
  window.addEventListener('resize', measureLabels);

  const hide = (l: Label) => {
    if (l.el.style.opacity !== '0') {
      l.el.style.opacity = '0';
      l.line.style.opacity = '0';
    }
  };
  const placeLabel = (l: Label, anchor: [number, number, number], show: number, dx: number, dy: number) => {
    if (!engine || show <= 0.001) return hide(l);
    engine.project(anchor, pt);
    if (!pt.visible) return hide(l);
    const lx = pt.x + dx;
    const ly = pt.y + dy;
    l.el.style.opacity = String(show);
    l.el.style.transform = `translate3d(${lx}px, ${ly - labelHalf}px, 0)`;
    l.line.setAttribute('x1', String(pt.x));
    l.line.setAttribute('y1', String(pt.y));
    l.line.setAttribute('x2', String(lx - 6));
    l.line.setAttribute('y2', String(ly));
    l.line.style.opacity = String(show);
  };

  const window01 = (t: number, a: number, b: number, fade = 0.08) =>
    Math.min(Math.max((t - a) / fade, 0), 1) * Math.min(Math.max((b - t) / fade, 0), 1);

  const capture = params.has('capture');
  const interactive = $$('[data-proof-row], .beat[data-beat="tuned"], [data-end] .end-links');

  // Keyboard and screen-reader users reach copy before the flight has shown it: focusing
  // anything flies the page to where that copy is on screen.
  const showAt: [string, number][] = [
    ['.plate-hero', 0.02],
    ['.plate-descent', 0.2],
    ['.plate-between', 0.46],
    ['[data-case-head]', 0.7],
    ['.beat[data-beat="pending"]', 0.785],
    ['.beat[data-beat="provision"]', 0.84],
    ['.beat[data-beat="scale"]', 0.9],
    ['.beat[data-beat="tuned"]', 0.955],
    ['[data-end]', 0.995],
  ];
  const flyTo = (at: number) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (lenis) lenis.scrollTo(at * max, { immediate: true });
    else window.scrollTo(0, at * max);
    target = at;
    p = at;
  };
  document.addEventListener('focusin', (e) => {
    const el = e.target as Element;
    for (const [sel, at] of showAt) {
      if (el.closest(sel)) {
        if (Math.abs(p - at) > 0.02) flyTo(at);
        return;
      }
    }
  });
  $('.skip').addEventListener('click', (e) => {
    e.preventDefault();
    flyTo(0.7);
    $<HTMLElement>('#case-title').setAttribute('tabindex', '-1');
    $<HTMLElement>('#case-title').focus({ preventScroll: true });
  });

  let lastHorizon = -1;
  const frame = (dt: number, render = true) => {
    if (!capture) {
      const k = lenis ? 1 : 1 - Math.exp(-dt * 10);
      p += (target - p) * k;
      if (Math.abs(target - p) < 1e-5) p = target;
    }
    tl.progress(p);
    // Links stay in the accessibility tree while hidden, but only take taps once they show.
    for (const el of interactive) {
      // GSAP writes inline opacity; reading it back costs no style recalculation.
      const shown = Number(el.style.opacity || '0') > 0.5;
      if (shown !== (el.dataset.live === 'on')) {
        el.dataset.live = shown ? 'on' : 'off';
        el.style.pointerEvents = shown ? 'auto' : 'none';
      }
    }
    const cam = cameraAt(p, orientation());
    tape.set(feet(cam.pos[1]));
    if (engine && render) {
      engine.setProgress(p, true);
      engine.tick(dt);
    }
    // The name rides the horizon; only while the hero can be seen, and only when it moves.
    if (p < 0.2) {
      const horizon = Math.round((engine ? engine.horizonY() : horizonFor(cam.pitch)) * 2) / 2;
      if (horizon !== lastHorizon) {
        heroCopy.style.setProperty('--horizon-px', `${horizon}px`);
        lastHorizon = horizon;
      }
    }

    if (engine) {
      const t = sceneClockAt(p);
      const bp = engine.blueprint;
      const near = Math.min(window.innerWidth, window.innerHeight) < 600 ? 0.7 : 1;
      const pendShow = window01(t, 0.78, 2.6);
      const podState = t < BEATS.ready + 0.3 ? 'pending' : 'running';
      if (labels.pending.el.dataset.state !== podState) {
        labels.pending.el.dataset.state = podState;
        labels.pending.text.textContent = `pod: ${podState}`;
      }
      placeLabel(labels.pending, bp.anchors.pending, pendShow, 46 * near, -30 * near);

      const nodeShow = window01(t, 1.0, 2.95);
      const secs = Math.min(1, Math.max(0, (t - BEATS.provision) / (BEATS.ready - BEATS.provision))) * 80;
      const nodeText = t < BEATS.ready ? 'NodeClaim' : 'node: ready';
      if (labels.node.text.textContent !== nodeText) labels.node.text.textContent = nodeText;
      const c = clock(secs);
      if (labels.node.extra && labels.node.extra.textContent !== c) labels.node.extra.textContent = c;
      placeLabel(labels.node, bp.anchors.node, nodeShow, 54 * near, 18 * near);

      const fieldShow = window01(t, BEATS.scale, BEATS.end + 1);
      const drawn = bp.drawnNodes(t);
      const count = drawn >= 100 ? '100+' : String(drawn);
      if (labels.field.extra && labels.field.extra.textContent !== count) labels.field.extra.textContent = count;
      placeLabel(labels.field, bp.anchors.field, fieldShow, 36 * near, -26 * near);
    }
  };

  // ?perf=1 records what each frame costs on the main thread, and when frames land.
  const perf = params.has('perf') ? { work: [] as number[], stamps: [] as number[] } : null;
  let last = performance.now();
  if (!capture) {
    gsap.ticker.add(() => {
      const now = performance.now();
      frame(Math.min(0.1, (now - last) / 1000));
      last = now;
      if (perf && engine) {
        perf.work.push(performance.now() - now);
        perf.stamps.push(now);
      }
    });
  }
  (window as unknown as Record<string, unknown>).__altLive = {
    perf,
    stats: () => engine?.stats() ?? null,
    on: () => !!engine,
  };

  window.addEventListener('resize', () => {
    tape.rebuild();
    engine?.resize();
  });

  // Review switches at the end of the page.
  const switches = $$<HTMLAnchorElement>('[data-switch]');
  const markMethod = (m: string) =>
    switches.forEach((a) => a.setAttribute('aria-current', String(a.dataset.switch === m)));
  markMethod(root.dataset.clouds ?? 'raymarch');
  switches.forEach((a) =>
    a.addEventListener('click', (e) => {
      if (!engine) return;
      e.preventDefault();
      const m = a.dataset.switch as MethodName;
      engine.setMethod(m);
      root.dataset.clouds = m;
      const u = new URL(location.href);
      u.searchParams.set('clouds', m);
      history.replaceState(null, '', u);
      markMethod(m);
    }),
  );

  // The scene loads after everything else, when the main thread is idle.
  const loadScene = async () => {
    try {
      const { AltitudeEngine, guessTier } = await import('./engine/engine');
      const canvas = $<HTMLCanvasElement>('[data-canvas]');
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) throw new Error('WebGL2 is not available');
      const forced = params.get('q') as Tier | null;
      const tier: Tier = forced && ['poster', 'ultra', 'high', 'mid', 'low'].includes(forced) ? forced : guessTier(probe);
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      const e = new AltitudeEngine({
        canvas,
        method: (root.dataset.clouds as MethodName) ?? 'raymarch',
        tier,
        capture,
        dpr: Number(params.get('dpr')) || undefined,
      });
      canvas.addEventListener('webglcontextlost', (ev) => {
        ev.preventDefault();
        toStill('the WebGL context was lost');
      });
      await e.init();
      e.setProgress(p, true);
      engine = e;
      root.dataset.stage = 'on';
      $('.stage').dataset.stage = 'on';
      setTimeout(() => {
        const poster = $('.stage-poster');
        if (poster) poster.style.visibility = 'hidden';
      }, 900);
      if (params.has('stats')) showStats(e);
      if (capture) {
        // Poster and recording capture: render a given point of the flight on request.
        const w = window as unknown as Record<string, unknown>;
        w.__alt = {
          engine: e,
          goto(at: number, frames = 8, time = 0) {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            window.scrollTo(0, at * max);
            target = at;
            p = at;
            e.renderAt(at, -1, frames, time);
            frame(0, false);
          },
        };
        w.__altReady = true;
      }
    } catch (err) {
      toStill(String(err));
    }
  };

  const toStill = (why: string) => {
    console.warn('Altitude: falling back to stills:', why);
    const share = p;
    engine?.dispose();
    engine = null;
    trigger.kill();
    tl.kill();
    lenis?.destroy();
    root.dataset.mode = 'still';
    // Clear the inline styles the choreography left behind.
    $$('.plate-copy, .plate-copy *').forEach((el) => {
      el.style.opacity = '';
      el.style.transform = '';
      el.style.filter = '';
    });
    requestAnimationFrame(() =>
      window.scrollTo(0, share * (document.documentElement.scrollHeight - window.innerHeight)),
    );
  };

  const idle = (fn: () => void) =>
    'requestIdleCallback' in window
      ? (window as Window & { requestIdleCallback: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback(fn, { timeout: 1200 })
      : setTimeout(fn, 200);
  if (document.readyState === 'complete') idle(loadScene);
  else window.addEventListener('load', () => idle(loadScene), { once: true });
}

function showStats(e: AltitudeEngine): void {
  const el = $('[data-stats]');
  el.hidden = false;
  setInterval(() => {
    const s = e.stats();
    el.textContent =
      `${s.fps.toFixed(1)} fps  ${s.ms.toFixed(1)} ms\n` +
      `${s.method}  clouds ${s.cloudRes}  steps ${s.steps}\n` +
      `${s.drawRes} @${s.dpr.toFixed(2)}x  tier ${s.tier}\n` +
      s.gpu.slice(0, 48);
  }, 500);
}
