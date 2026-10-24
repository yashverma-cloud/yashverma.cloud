/**
 * The home page's live descent: smooth scroll, one flight clock shared by the copy and the
 * camera, the choreography, the altitude readout, the drawings' labels, and the scene itself
 * (loaded on idle, after everything else).
 *
 * One clock matters: the copy is scrubbed by the same smoothed progress the camera flies on, so
 * text anchored to the world (the name on the horizon, labels on a drawing) never drifts.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { copyAreas, LabelLayer } from './labels';
import { HorizonRig } from './horizon';
import { APPROACH, homeFlight, PARTS, settle, WINDOWS } from './flights/home';
import { feet } from './world';
import type { AltitudeEngine, Tier } from './engine/engine';
import type { DescentScene } from './scenes/descent';

gsap.registerPlugin(ScrollTrigger);

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll(sel)) as T[];

export function bootHome(): void {
  const root = document.documentElement;
  // The page's head script falls back to still mode if this never runs (index.astro).
  (window as unknown as Record<string, unknown>).__altBooted = true;
  if (root.dataset.mode !== 'live') return;
  try {
    startLive();
  } catch (err) {
    console.error('Altitude: live mode failed, showing the stills', err);
    root.dataset.mode = 'still';
  }
}

/** A plate and the stretch of the flight it is on screen for (it is parked off screen otherwise). */
type Near = [HTMLElement, number, number];

/** The scrubbed choreography: one timeline whose 0 to 1 is the flight's 0 to 1. */
function choreography(): { tl: gsap.core.Timeline; showAt: [Element, number][]; near: Near[] } {
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
  tl.set({}, {}, 1);
  const showAt: [Element, number][] = [];
  const near: Near[] = [];

  const hero = $('.plate-hero .plate-copy');
  tl.fromTo('[data-hero-cue]', { opacity: 1 }, { opacity: 0, duration: 0.008 }, 0.003);
  tl.fromTo(hero, { opacity: 1 }, { opacity: 0, duration: 0.02, ease: 'power1.in' }, PARTS.hero[1] - 0.004);
  showAt.push([$('.plate-hero'), 0.01]);

  const sf = $('[data-descent]');
  tl.fromTo(sf, { opacity: 0, filter: 'blur(10px)', y: 24 }, { opacity: 1, filter: 'blur(0px)', y: 0, duration: 0.016, ease: 'power2.out' }, 0.056);
  tl.to(sf, { opacity: 0, filter: 'blur(16px)', y: -12, duration: 0.016, ease: 'power1.in' }, 0.104);
  showAt.push([$('.plate-descent'), 0.08]);
  near.push([$('.plate-descent'), 0.046, 0.13]);

  const rows = $$('[data-proof-row]');
  tl.fromTo(rows, { opacity: 0, filter: 'blur(12px)', y: 18 }, { opacity: 1, filter: 'blur(0px)', y: 0, duration: 0.012, stagger: 0.005, ease: 'power2.out' }, PARTS.proof[0] + 0.008);
  tl.to(rows, { opacity: 0, y: -80, duration: 0.012, stagger: 0.002, ease: 'power1.in' }, PARTS.proof[1] - 0.004);
  showAt.push([$('.plate-between'), PARTS.proof[1] - 0.025]);
  near.push([$('.plate-between'), PARTS.proof[0] - 0.002, PARTS.proof[1] + 0.03]);

  for (const w of WINDOWS) {
    const plate = $(`[data-plate='${w.slug}']`);
    if (!plate) continue;
    near.push([plate, w.arrive - 0.032, w.leave + 0.022]);
    const head = $('[data-case-head]', plate);
    tl.fromTo(head, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.012, ease: 'power2.out' }, w.arrive - 0.02);
    tl.to(head, { opacity: 0, duration: 0.01 }, w.leave + 0.004);
    const beats = $$('.sbeat:not(.sbeat-link)', plate);
    const link = $('.sbeat-link', plate);
    const span = (w.leave - w.arrive + 0.01) / beats.length;
    beats.forEach((b, k) => {
      const at = w.arrive - 0.01 + k * span;
      const last = k === beats.length - 1;
      tl.fromTo(b, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.008, ease: 'power2.out' }, at);
      tl.to(b, { opacity: 0, y: -12, duration: 0.006, ease: 'power1.in' }, last ? w.leave + 0.004 : at + span - 0.008);
      if (last && link) {
        tl.fromTo(link, { opacity: 0 }, { opacity: 1, duration: 0.008 }, at + 0.004);
        tl.to(link, { opacity: 0, duration: 0.006 }, w.leave + 0.004);
        showAt.push([link, Math.min(w.leave - 0.004, at + span * 0.6)]);
      }
      showAt.push([b, at + Math.min(0.012, span * 0.5)]);
    });
    showAt.push([head, w.arrive + 0.004]);
  }
  return { tl, showAt, near };
}

/** The readout's tape: ticks every 250 ft, figures every 1,000 ft. */
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
      const shown = Math.max(0, Math.round(alt / 10) * 10);
      if (shown !== last) {
        read.textContent = shown.toLocaleString('en-US');
        last = shown;
      }
    },
  };
}

function startLive(): void {
  const root = document.documentElement;
  const params = new URLSearchParams(location.search);
  const capture = params.has('capture');
  const flight = $('[data-flight]');

  const fine = matchMedia('(pointer: fine)').matches;
  const lenis = fine && !capture ? new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 }) : null;
  if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  const { tl, showAt, near } = choreography();
  const tape = buildTape();
  const stage = $('.stage');
  const rig = new HorizonRig(stage, $('.plate-hero .plate-copy'));
  const labels = new LabelLayer($('[data-labels]'), $<SVGSVGElement>('[data-leaders]'));
  const small = () => (Math.min(window.innerWidth, window.innerHeight) < 600 ? 0.7 : 1);

  let target = 0;
  let p = 0;
  const trigger = ScrollTrigger.create({
    trigger: flight,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      target = self.progress;
    },
  });
  target = trigger.progress;
  p = target;

  // Layout, read on resize only: where the flight ends, where contact reaches the top of the
  // screen, and where it has come fully into view. Between them the camera flies the approach.
  let flightEnd = 0;
  let landTop = 1;
  let landEnd = 2;
  let pageEnd = 3;
  // From the document, not offsetTop: #contact sits inside the positioned ground.
  const pageTop = (el: Element) => el.getBoundingClientRect().top + window.scrollY;
  const measure = () => {
    flightEnd = pageTop(flight) + flight.offsetHeight - window.innerHeight;
    const contact = document.querySelector<HTMLElement>('#contact');
    landTop = Math.max(flightEnd + 1, contact ? pageTop(contact) : flightEnd + 1);
    landEnd = Math.max(landTop + 1, contact ? pageTop(contact) + contact.offsetHeight - window.innerHeight : landTop + 1);
    pageEnd = Math.max(landEnd + 1, document.documentElement.scrollHeight - window.innerHeight);
    // The horizon lands just above contact's heading, wherever the layout puts it.
    const head = contact?.querySelector('.sh');
    if (contact && head) {
      const top = pageTop(head);
      const h = window.innerHeight;
      contact.style.setProperty('--horizon-at', String(settle(rig.orientation, (top - landEnd) / h, (top - pageEnd) / h)));
    }
  };
  measure();
  const unit = (x: number) => Math.min(1, Math.max(0, x));
  // The approach's stretches and the scroll each one takes: the glide under the ground
  // sections, the flare as contact fills the screen, the touchdown over the footer.
  const legs = () =>
    [
      [1, APPROACH.glideEnd, flightEnd, landTop],
      [APPROACH.glideEnd, APPROACH.land, landTop, landEnd],
      [APPROACH.land, APPROACH.end, landEnd, pageEnd],
    ] as const;
  /** Progress along the approach for a scroll position past the flight. */
  const approachAt = (y: number) => {
    for (const [p0, p1, y0, y1] of legs()) if (y <= y1) return p0 + (p1 - p0) * unit((y - y0) / (y1 - y0));
    return APPROACH.end;
  };
  /** The scroll position for a progress, the inverse of the flight's trigger and approachAt. */
  const scrollFor = (at: number) => {
    if (at <= 1) return pageTop(flight) + at * (flight.offsetHeight - window.innerHeight);
    for (const [p0, p1, y0, y1] of legs()) if (at <= p1) return y0 + ((at - p0) / (p1 - p0)) * (y1 - y0);
    return pageEnd;
  };
  window.addEventListener('resize', () => {
    measure();
    rig.measure();
    tape.rebuild();
    engine?.resize();
    keptFor = null;
  });

  // The drawing whose labels show keeps them off its copy, read once per hold. The plate is the
  // base (fixed where the stage is), which cancels its parking offset.
  let keptFor: string | null = null;
  const keepClear = (at: number) => {
    const w = WINDOWS.find((x) => at >= x.arrive - 0.03 && at <= x.leave + 0.01);
    if (!w || w.slug === keptFor) return;
    keptFor = w.slug;
    const plate = $(`[data-plate='${w.slug}']`);
    const dy = Number(gsap.getProperty($('[data-case-head]', plate), 'y')) || 0;
    labels.setKeepOut(copyAreas(plate, $('.case-title', plate), $('.beats', plate), dy));
  };

  const flyTo = (at: number) => {
    const y = scrollFor(at);
    if (lenis) lenis.scrollTo(y, { immediate: true });
    else window.scrollTo(0, y);
    target = Math.min(1, at);
    p = at;
  };
  // Keyboard and screen-reader users reach copy before the flight shows it: focusing it flies there.
  document.addEventListener('focusin', (e) => {
    const el = e.target as Element;
    let best: number | null = null;
    for (const [owner, at] of showAt) if (owner.contains(el)) best = at;
    if (best !== null && Math.abs(p - best) > 0.01) flyTo(best);
  });
  // "Work" is the proof, which lives inside the flight: fly to it rather than jump.
  const toWork = () => flyTo(PARTS.proof[1] - 0.025);
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || a.pathname !== '/' || a.origin !== location.origin) return;
    if (a.hash === '#work') {
      e.preventDefault();
      history.pushState(null, '', '/#work');
      toWork();
    } else if (a.hash && lenis) {
      const el = document.querySelector(a.hash);
      if (el) {
        e.preventDefault();
        history.pushState(null, '', `/${a.hash}`);
        lenis.scrollTo(el as HTMLElement, { offset: 0 });
      }
    }
  });
  if (location.hash === '#work') requestAnimationFrame(toWork);

  let engine: AltitudeEngine | null = null;
  let scene: DescentScene | null = null;
  const interactive = $$('[data-proof-row], .sbeat-link');
  let labelsUp = true;

  // Each ground section's horizon rule draws itself from the words to the margin as it arrives.
  const rules = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        (e.target as HTMLElement).dataset.drawn = '';
        rules.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -20% 0px' },
  );
  $$('.ground .sh .rule').forEach((r) => rules.observe(r));

  const frame = (dt: number, render = true) => {
    // One clock from the top of the page to contact: the flight's trigger, then the approach.
    const y = window.scrollY;
    if (!capture) {
      const goal = y > flightEnd ? approachAt(y) : target;
      const k = lenis ? 1 : 1 - Math.exp(-dt * 10);
      p += (goal - p) * k;
      if (Math.abs(goal - p) < 1e-5) p = goal;
    }
    // The copy's choreography is the flight's alone.
    const f = Math.min(1, p);
    tl.progress(f);
    for (const [plate, from, to] of near) {
      const on = f >= from && f <= to;
      if (on !== plate.hasAttribute('data-near')) plate.toggleAttribute('data-near', on);
    }
    for (const el of interactive) {
      const shown = Number(el.style.opacity || '0') > 0.5;
      if (shown !== (el.dataset.live === 'on')) {
        el.dataset.live = shown ? 'on' : 'off';
        el.style.pointerEvents = shown ? 'auto' : 'none';
      }
    }
    // The readout is the camera's altitude, all the way down: 0 ft at eye height, at contact.
    const cam = homeFlight.camera(p, rig.orientation);
    tape.set(feet(cam.pos[1]));

    // The stage renders under the whole page now: the ground sections fly the approach over it.
    if (engine) burnIn(engine, f);
    if (engine && render) {
      engine.setProgress(p, true);
      engine.tick(dt);
    }
    if (p < 0.06) rig.set(engine ? engine.horizonY() : rig.forPitch(cam.pitch));
    if (engine && scene) {
      keepClear(f);
      if (p <= 1) labels.update(scene.labels(f), engine, small());
      else if (labelsUp) labels.hideAll();
      labelsUp = p <= 1;
    }
  };

  // ?perf=1 records what each frame costs on the main thread.
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
  (window as unknown as Record<string, unknown>).__altLive = { perf, stats: () => engine?.stats() ?? null, on: () => !!engine };

  const toStill = (why: string) => {
    console.warn('Altitude: falling back to stills:', why);
    const share = p;
    engine?.dispose();
    engine = null;
    trigger.kill();
    tl.kill();
    lenis?.destroy();
    labels.hideAll();
    root.dataset.mode = 'still';
    $$('.plate-copy, .plate-copy *').forEach((el) => {
      el.style.opacity = '';
      el.style.transform = '';
      el.style.filter = '';
      el.style.pointerEvents = '';
    });
    requestAnimationFrame(() => window.scrollTo(0, share * (flight.offsetHeight - window.innerHeight)));
  };

  const loadScene = async () => {
    try {
      const [{ AltitudeEngine, guessTier }, { DescentScene }] = await Promise.all([import('./engine/engine'), import('./scenes/descent')]);
      const canvas = $<HTMLCanvasElement>('[data-canvas]');
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) throw new Error('WebGL2 is not available');
      const forced = params.get('q') as Tier | null;
      const tier: Tier = forced && ['poster', 'ultra', 'high', 'mid', 'low'].includes(forced) ? forced : guessTier(probe);
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      const s = await DescentScene.create();
      const e = new AltitudeEngine({ canvas, tier, scene: s, director: homeFlight, capture, dpr: Number(params.get('dpr')) || undefined });
      canvas.addEventListener('webglcontextlost', (ev) => {
        ev.preventDefault();
        toStill('the WebGL context was lost');
      });
      await e.init();
      e.setProgress(p, true);
      engine = e;
      scene = s;
      stage.dataset.stage = 'on';
      // The live sunrise replaces contact's still (home.css).
      root.dataset.scene = 'on';
      setTimeout(() => {
        const poster = $('.stage-poster');
        if (poster) poster.style.visibility = 'hidden';
      }, 900);
      if (params.has('stats')) showStats(e);
      if (capture) {
        const w = window as unknown as Record<string, unknown>;
        w.__alt = {
          engine: e,
          goto(at: number, frames = 8, time = 0) {
            flyTo(at);
            e.renderAt(at, -1, frames, time);
            frame(0, false);
            keepClear(at);
            labels.update(s.labels(at), e, small());
          },
        };
        w.__altReady = true;
      }
    } catch (err) {
      toStill(String(err));
    }
  };

  const idle = (fn: () => void) =>
    'requestIdleCallback' in window
      ? (window as Window & { requestIdleCallback: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback(fn, { timeout: 1200 })
      : setTimeout(fn, 200);
  // After the name's rise (index.astro's head script), so compiling the scene never stalls it.
  const risen = (window as unknown as { __risen?: Promise<void> }).__risen ?? Promise.resolve();
  const start = () => void risen.then(() => idle(loadScene));
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

/**
 * While the camera holds over a drawing, the image is burnt in behind the title (top left) and
 * the beats (bottom left), as a printer would: a soft local darkening, never a panel. On tall
 * screens the copy runs across the top and the bottom instead.
 */
function burnIn(engine: AltitudeEngine, p: number): void {
  let k = 0;
  for (const w of WINDOWS) k = Math.max(k, Math.min(1, Math.max(0, (p - (w.arrive - 0.03)) / 0.02)) * Math.min(1, Math.max(0, (w.leave + 0.012 - p) / 0.02)));
  const tall = window.innerWidth < window.innerHeight;
  const s = engine.scrims;
  if (tall) {
    s.a = [0.5, 0.86, 0.75, 0.1];
    s.b = [0.5, 0.12, 0.75, 0.13];
  } else {
    s.a = [0.2, 0.82, 0.3, 0.12];
    s.b = [0.18, 0.16, 0.28, 0.15];
  }
  s.strength = [0.5 * k, 0.5 * k];
}

function showStats(e: AltitudeEngine): void {
  const el = $('[data-stats]');
  el.hidden = false;
  setInterval(() => {
    const s = e.stats();
    el.textContent = `${s.fps.toFixed(1)} fps  ${s.ms.toFixed(1)} ms\nclouds ${s.cloudRes}  steps ${s.steps}\n${s.drawRes} @${s.dpr.toFixed(2)}x  tier ${s.tier}\n${s.gpu.slice(0, 48)}`;
  }, 500);
}
