/**
 * Binds the simulation to the DOM — design/notes.md §6.
 *
 * This layer is deliberately small and dependency-free: it must work on its own with no
 * WebGL at all, because that is the reduced-motion and no-WebGL experience. The Three.js
 * scene is loaded afterwards, only if it is wanted, and only once the page is idle.
 */

import { Simulation, type SimState } from './simulation';

declare global {
  interface Window {
    /** Defined inline in Base.astro. Sends a GA4 event once analytics has loaded; otherwise a no-op. */
    __track?: (name: string, params?: Record<string, string>) => void;
  }
}

const ANNOUNCE_THROTTLE_MS = 2000;

/**
 * The orchestrated page-load moment — design/notes.md §6.1. Timings in ms.
 *
 * Hand-rolled rather than GSAP + DrawSVG on purpose. This runs on the critical path, and
 * the effect is ~40 lines of Web Animations against ~30 KB gzip of library. Phase 4's
 * case-study diagrams went the same way, so GSAP ended up earning its place nowhere and
 * has been removed from the dependencies.
 */
const LOAD = {
  plates: { at: 150, dur: 300 },
  nodes: { at: 350, dur: 350 },
  ingress: { at: 600, dur: 200 },
  links: { at: 700, dur: 350 },
  power: { at: 1050, dur: 400 },
  done: 1450,
};

/** Draws a stroked shape on, plotter style, by running its own dash offset to zero. */
function drawOn(el: SVGGeometryElement, delay: number, duration: number): void {
  let length = 0;
  try {
    length = el.getTotalLength();
  } catch {
    return;
  }
  if (!length) return;
  el.style.strokeDasharray = `${length}`;
  el.style.strokeDashoffset = `${length}`;
  const animation = el.animate(
    [{ strokeDashoffset: length }, { strokeDashoffset: 0 }],
    { delay, duration, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' },
  );
  animation.finished
    .then(() => {
      // Hand the element back to the stylesheet so later state changes are unaffected.
      el.style.strokeDasharray = '';
      el.style.strokeDashoffset = '';
      animation.cancel();
    })
    .catch(() => {});
}

function fadeIn(el: Element, delay: number, duration: number): void {
  el.animate([{ opacity: 0 }, { opacity: 1 }], {
    delay,
    duration,
    easing: 'ease-out',
    fill: 'backwards',
  });
}

const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const supportsWebGL = (): boolean => {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl2') || canvas.getContext('webgl')),
    );
  } catch {
    return false;
  }
};

function formatRecovery(ms: number | null): string {
  if (ms === null) return '—';
  return `${(ms / 1000).toFixed(1)}s`;
}

export function mountHero(): void {
  const hero = document.querySelector<HTMLElement>('.hero');
  if (!hero) return;

  const sceneEl = hero.querySelector<HTMLElement>('[data-scene]');
  const button = hero.querySelector<HTMLButtonElement>('[data-take-down]');
  const live = hero.querySelector<HTMLElement>('[data-live]');
  const mount = hero.querySelector<HTMLElement>('[data-canvas-mount]');
  const poster = hero.querySelector<SVGSVGElement>('.poster');
  if (!sceneEl || !button || !poster) return;

  // Narrowing is lost inside the nested load-sequence function, so bind it once here.
  const posterSvg: SVGSVGElement = poster;

  const reduced = prefersReducedMotion();
  const sim = new Simulation(reduced);

  // --- HUD ------------------------------------------------------------------
  const hudCells = new Map<string, HTMLElement>();
  hero.querySelectorAll<HTMLElement>('[data-hud]').forEach((el) => {
    hudCells.set(el.dataset.hud!, el);
  });
  const hudCompact = new Map<string, HTMLElement>();
  hero.querySelectorAll<HTMLElement>('[data-hud-c]').forEach((el) => {
    hudCompact.set(el.dataset.hudC!, el);
  });

  const setHud = (key: string, full: string, compact = full): void => {
    const a = hudCells.get(key);
    if (a && a.textContent !== full) a.textContent = full;
    const b = hudCompact.get(key);
    if (b && b.textContent !== compact) b.textContent = compact;
  };

  // --- Poster ---------------------------------------------------------------
  const nodeEls = new Map<string, SVGGElement>();
  poster.querySelectorAll<SVGGElement>('[data-node]').forEach((el) => {
    nodeEls.set(el.dataset.node!, el);
  });
  const linkEls = new Map<string, SVGPathElement>();
  poster.querySelectorAll<SVGPathElement>('.links path[data-zone]').forEach((el) => {
    linkEls.set(el.dataset.zone!, el);
  });

  const renderPoster = (state: SimState): void => {
    for (const node of state.nodes) {
      const el = nodeEls.get(node.id);
      if (!el) continue;
      if (node.status === 'ready') el.removeAttribute('data-status');
      else el.setAttribute('data-status', node.status);
      const pods = String(node.pods);
      if (el.getAttribute('data-pods') !== pods) el.setAttribute('data-pods', pods);
    }

    // A zone's link goes quiet only while every node in it is unavailable.
    for (const [zone, link] of linkEls) {
      const zoneNodes = state.nodes.filter((n) => n.zone === zone);
      const anyReady = zoneNodes.some((n) => n.status === 'ready');
      if (anyReady) link.removeAttribute('data-state');
      else link.setAttribute('data-state', 'down');
    }
  };

  // --- Live region ----------------------------------------------------------
  let lastAnnounced = 0;
  sim.onAnnounce(({ text }) => {
    if (!live) return;
    const now = performance.now();
    if (now - lastAnnounced < ANNOUNCE_THROTTLE_MS) return;
    lastAnnounced = now;
    live.textContent = text;
  });

  // --- Render loop ----------------------------------------------------------
  // The load sequence owns the HUD until its count-up finishes, so the two cannot fight
  // over the same cells.
  let hudOwnedByLoad = !reduced;

  sim.subscribe((state) => {
    renderPoster(state);

    const mode = hero.querySelector<HTMLElement>('[data-hud-mode]');
    if (mode) {
      mode.textContent = state.hud.chaos
        ? 'cluster · simulated · chaos'
        : 'cluster · simulated';
    }
    button.disabled = state.hud.recovering;
    button.textContent = state.hud.recovering ? 'recovering…' : 'Take a node down';

    if (hudOwnedByLoad) return;

    setHud('nodes', `${state.hud.nodesReady} / ${state.hud.nodesTotal}`,
      `${state.hud.nodesReady}/${state.hud.nodesTotal}`);
    setHud('pods', String(state.hud.podsRunning));
    setHud('requests', state.hud.requestsServed.toLocaleString('en'));
    setHud('failed', String(state.hud.failedRequests));
    setHud('recovery', formatRecovery(state.hud.lastRecoveryMs));
  });

  // --- Load sequence --------------------------------------------------------
  // Resolves when the hero has finished arriving, so the WebGL crossfade never
  // interrupts the plotter draw.
  const loadComplete = runLoadSequence();

  function runLoadSequence(): Promise<void> {
    if (reduced) {
      // Poster renders complete, immediately. No draw-on, no power-on.
      return Promise.resolve();
    }

    const plates = posterSvg.querySelectorAll<SVGGeometryElement>('.plate');
    const faces = posterSvg.querySelectorAll<SVGGeometryElement>(
      '.face-top, .face-left, .face-right',
    );
    const ingressShape = posterSvg.querySelectorAll<SVGGeometryElement>('.ingress polygon');
    const linkPaths = posterSvg.querySelectorAll<SVGGeometryElement>('.links path');
    const pods = posterSvg.querySelectorAll<SVGElement>('.pod');
    const labels = posterSvg.querySelectorAll<SVGElement>('text');

    posterSvg.setAttribute('data-load', 'drawing');

    // Start the readout at zero so the power-on count-up has somewhere to come from.
    setHud('nodes', `0 / ${sim.snapshot().hud.nodesTotal}`, `0/${sim.snapshot().hud.nodesTotal}`);
    setHud('pods', '0');
    setHud('requests', '0');

    plates.forEach((el) => drawOn(el, LOAD.plates.at, LOAD.plates.dur));
    faces.forEach((el) => drawOn(el, LOAD.nodes.at, LOAD.nodes.dur));
    ingressShape.forEach((el) => drawOn(el, LOAD.ingress.at, LOAD.ingress.dur));
    linkPaths.forEach((el) => drawOn(el, LOAD.links.at, LOAD.links.dur));
    labels.forEach((el) => fadeIn(el, LOAD.ingress.at, 400));

    // Power on: the faces fill, then pods appear on their nodes.
    window.setTimeout(() => {
      posterSvg.removeAttribute('data-load');
      pods.forEach((pod, i) => {
        pod.animate(
          [
            { opacity: 0, transform: 'scale(0.6)' },
            { opacity: 1, transform: 'scale(1)' },
          ],
          {
            delay: i * 20,
            duration: 220,
            easing: 'cubic-bezier(.34,1.3,.64,1)',
            fill: 'backwards',
          },
        );
      });
      countUpHud();
    }, LOAD.power.at);

    return new Promise((resolve) => window.setTimeout(resolve, LOAD.done));
  }

  /** HUD figures count from zero once the power comes on. Tabular, so nothing jitters. */
  function countUpHud(): void {
    const targets: Array<[string, number]> = [
      ['pods', sim.snapshot().hud.podsRunning],
      ['requests', sim.snapshot().hud.requestsServed],
    ];
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / LOAD.power.dur);
      const eased = 1 - Math.pow(1 - t, 3);
      for (const [key, end] of targets) {
        const value = Math.round(end * eased);
        const cell = hudCells.get(key);
        if (cell) cell.textContent = value.toLocaleString('en');
      }
      const nodesCell = hudCells.get('nodes');
      if (nodesCell) {
        const ready = Math.round(sim.snapshot().hud.nodesTotal * eased);
        nodesCell.textContent = `${ready} / ${sim.snapshot().hud.nodesTotal}`;
      }
      if (t < 1) requestAnimationFrame(step);
      else hudOwnedByLoad = false;
    };
    requestAnimationFrame(step);
  }

  // --- Controls -------------------------------------------------------------
  // Counted only when a failure actually starts; a click during a recovery is ignored by
  // the simulation and is not an event either.
  button.addEventListener('click', () => {
    if (sim.fail()) window.__track?.('take_node_down', { method: 'button' });
  });

  // Nodes are pointer targets; the button is the keyboard path. One control, not ten.
  poster.querySelectorAll<SVGGElement>('[data-node]').forEach((el) => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      if (sim.fail(el.dataset.node)) window.__track?.('take_node_down', { method: 'node' });
    });
  });

  // Chaos mode: opt-in, never auto-starts, and off under reduced motion.
  if (!reduced) {
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'c' && event.key !== 'C') return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      sim.toggleChaos();
    });
  }

  // Idle traffic begins only once the scene has finished arriving.
  void loadComplete.then(() => sim.start());

  // --- Pause when off-screen or hidden --------------------------------------
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) sim.resume();
        else sim.pause();
      }
    },
    { threshold: 0 },
  );
  observer.observe(sceneEl);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sim.pause();
    else if (sceneEl.getBoundingClientRect().bottom > 0) sim.resume();
  });

  // --- WebGL, last ----------------------------------------------------------
  // Loaded after `load` and on idle so it never competes with the LCP paint.
  if (!mount || !supportsWebGL()) return;

  const loadScene = (): void => {
    const idle =
      window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
    idle(() => {
      Promise.all([import('./hero-scene'), loadComplete])
        .then(([{ createScene }]) => {
          const scene = createScene({ mount, sim, reduced });
          // Crossfade only after the plotter draw has finished, so the two never overlap.
          if (scene) sceneEl.setAttribute('data-webgl', 'on');
        })
        .catch(() => {
          /* Poster stays, fully drawn. Nothing to tell the visitor. */
        });
    });
  };

  if (document.readyState === 'complete') loadScene();
  else window.addEventListener('load', loadScene, { once: true });
}
