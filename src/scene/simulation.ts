/**
 * The cluster simulation — design/notes.md §6.2–6.3.
 *
 * Pure state and timing. It owns no DOM and no WebGL, so the SVG poster, the HUD and the
 * Three.js scene are all just subscribers rendering the same state. That is what keeps the
 * HUD honest: its figures are the simulation's, never typed in alongside it.
 *
 * Every duration here is real elapsed time. Nothing is labelled with a number it did not
 * take — see the note in §6.3 about the provisioning clock that was cut.
 */

import { NODE_OFFSETS, ZONES } from './geometry';

export type NodeStatus = 'ready' | 'failed' | 'provisioning';

export interface NodeState {
  /** Stable id, also used as the scene's instance index key. */
  id: string;
  zone: string;
  slot: number;
  status: NodeStatus;
  pods: number;
}

export type Phase =
  | 'healthy'
  | 'failed'
  | 'rerouted'
  | 'rescheduled'
  | 'degraded'
  | 'provisioning'
  | 'replaced'
  | 'rebalanced';

export interface Hud {
  nodesReady: number;
  nodesTotal: number;
  podsRunning: number;
  podsTotal: number;
  requestsServed: number;
  failedRequests: number;
  /** Milliseconds the last recovery actually took. null until one has happened. */
  lastRecoveryMs: number | null;
  /** True while the failure sequence is running, so the button can disable itself. */
  recovering: boolean;
  chaos: boolean;
}

export interface SimState {
  phase: Phase;
  nodes: NodeState[];
  hud: Hud;
  /** Id of the node currently failed or being replaced, if any. */
  affected: string | null;
}

/** Announcements for the live region. Throttled by the controller, not here. */
export type Announcement = { text: string };

type Listener = (state: SimState) => void;
type Announcer = (a: Announcement) => void;

/**
 * Beat schedule, in ms from the start of a failure. Matches the storyboard table.
 * `reduced` collapses it to four discrete states 1.2s apart, with no travel between them.
 */
const FULL_SEQUENCE: Array<{ at: number; phase: Phase }> = [
  { at: 0, phase: 'failed' },
  { at: 600, phase: 'rerouted' },
  { at: 2200, phase: 'rescheduled' },
  { at: 3000, phase: 'degraded' },
  { at: 3400, phase: 'provisioning' },
  { at: 6500, phase: 'replaced' },
  { at: 7100, phase: 'rebalanced' },
  { at: 8000, phase: 'healthy' },
];

const REDUCED_SEQUENCE: Array<{ at: number; phase: Phase }> = [
  { at: 0, phase: 'rerouted' },
  { at: 1200, phase: 'rescheduled' },
  { at: 2400, phase: 'replaced' },
  { at: 3600, phase: 'healthy' },
];

const IDLE_TICK_MS = 260;
const CHAOS_MIN_GAP_MS = 6000;
const CHAOS_MAX_GAP_MS = 10000;

function buildNodes(): NodeState[] {
  const nodes: NodeState[] = [];
  for (const zone of ZONES) {
    NODE_OFFSETS.forEach((_, slot) => {
      nodes.push({
        id: `${zone.id}-${slot}`,
        zone: zone.id,
        slot,
        status: 'ready',
        pods: zone.pods[slot] ?? 0,
      });
    });
  }
  return nodes;
}

export class Simulation {
  private nodes = buildNodes();
  private phase: Phase = 'healthy';
  private affected: string | null = null;
  private evictedPods = 0;
  private listeners = new Set<Listener>();
  private announcer: Announcer | null = null;

  private timers: number[] = [];
  private idleTimer: number | null = null;
  private chaosTimer: number | null = null;
  private startedAt = 0;
  private running = false;

  private hud: Hud;

  constructor(private reducedMotion = false) {
    const podsTotal = this.nodes.reduce((n, node) => n + node.pods, 0);
    this.hud = {
      nodesReady: this.nodes.length,
      nodesTotal: this.nodes.length,
      podsRunning: podsTotal,
      podsTotal,
      // Seeded so the figure looks like a system that was already up before you arrived.
      requestsServed: 12480,
      failedRequests: 0,
      lastRecoveryMs: null,
      recovering: false,
      chaos: false,
    };
  }

  // --- subscription ---------------------------------------------------------

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  onAnnounce(fn: Announcer): void {
    this.announcer = fn;
  }

  snapshot(): SimState {
    return {
      phase: this.phase,
      nodes: this.nodes.map((n) => ({ ...n })),
      hud: { ...this.hud },
      affected: this.affected,
    };
  }

  private emit(): void {
    const state = this.snapshot();
    for (const fn of this.listeners) fn(state);
  }

  private announce(text: string): void {
    this.announcer?.({ text });
  }

  // --- lifecycle ------------------------------------------------------------

  /** Begins the ambient request counter. Safe to call more than once. */
  start(): void {
    if (this.running) return;
    this.running = true;
    if (!this.reducedMotion) this.startIdle();
    this.emit();
  }

  /** Stops every timer. Called when the hero scrolls away or the tab is hidden. */
  pause(): void {
    this.running = false;
    if (this.idleTimer !== null) {
      window.clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  resume(): void {
    if (this.running) return;
    this.running = true;
    if (!this.reducedMotion) this.startIdle();
  }

  destroy(): void {
    this.pause();
    this.clearSequence();
    this.setChaos(false);
    this.listeners.clear();
    this.announcer = null;
  }

  private startIdle(): void {
    if (this.idleTimer !== null) return;
    this.idleTimer = window.setInterval(() => {
      // A steady, believable rate — not a counter racing for effect.
      this.hud.requestsServed += 6 + Math.floor(Math.random() * 7);
      this.emit();
    }, IDLE_TICK_MS);
  }

  // --- failure and recovery -------------------------------------------------

  get isRecovering(): boolean {
    return this.hud.recovering;
  }

  /** Picks a healthy node at random. Used by the button and by chaos mode. */
  randomHealthyNode(): string | null {
    const healthy = this.nodes.filter((n) => n.status === 'ready');
    if (healthy.length === 0) return null;
    return healthy[Math.floor(Math.random() * healthy.length)]!.id;
  }

  /**
   * Fails one node and runs the recovery. Ignored while a sequence is already running —
   * one failure at a time, which the storyboard requires on touch and which keeps the
   * HUD readable everywhere else.
   */
  fail(nodeId?: string): boolean {
    if (this.hud.recovering) return false;
    const id = nodeId ?? this.randomHealthyNode();
    if (!id) return false;
    const node = this.nodes.find((n) => n.id === id && n.status === 'ready');
    if (!node) return false;

    this.affected = node.id;
    this.evictedPods = node.pods;
    this.hud.recovering = true;
    this.startedAt = performance.now();

    const sequence = this.reducedMotion ? REDUCED_SEQUENCE : FULL_SEQUENCE;
    this.clearSequence();

    if (!this.reducedMotion) {
      this.applyPhase('failed');
    }

    for (const beat of sequence) {
      if (beat.at === 0 && !this.reducedMotion) continue;
      const timer = window.setTimeout(() => this.applyPhase(beat.phase), beat.at);
      this.timers.push(timer);
    }
    if (this.reducedMotion) this.applyPhase('rerouted');
    return true;
  }

  private clearSequence(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
  }

  private applyPhase(phase: Phase): void {
    const node = this.nodes.find((n) => n.id === this.affected);
    this.phase = phase;

    switch (phase) {
      case 'failed':
        if (node) {
          node.status = 'failed';
          node.pods = 0;
        }
        this.hud.nodesReady -= 1;
        this.hud.podsRunning -= this.evictedPods;
        this.announce(`Node failed. Rescheduling ${this.evictedPods} pods.`);
        break;

      case 'rerouted':
        // In reduced motion this is the first visible state, so it carries the failure too.
        if (this.reducedMotion && node && node.status === 'ready') {
          node.status = 'failed';
          node.pods = 0;
          this.hud.nodesReady -= 1;
          this.hud.podsRunning -= this.evictedPods;
          this.announce(`Node failed. Rescheduling ${this.evictedPods} pods.`);
        }
        break;

      case 'rescheduled': {
        // Pods land on the healthy nodes with the fewest, so the spread stays even.
        let remaining = this.evictedPods;
        while (remaining > 0) {
          const target = this.nodes
            .filter((n) => n.status === 'ready')
            .sort((a, b) => a.pods - b.pods)[0];
          if (!target) break;
          target.pods += 1;
          remaining -= 1;
        }
        this.hud.podsRunning = this.nodes.reduce((n, x) => n + x.pods, 0);
        this.announce('Pods rescheduled. 0 failed requests.');
        break;
      }

      case 'degraded':
        break;

      case 'provisioning':
        if (node) node.status = 'provisioning';
        break;

      case 'replaced':
        if (node) node.status = 'ready';
        this.hud.nodesReady += 1;
        break;

      case 'rebalanced': {
        // One pod moves back onto the replacement so the distribution is even again.
        if (node && node.status === 'ready') {
          const busiest = this.nodes
            .filter((n) => n.id !== node.id && n.pods > 0)
            .sort((a, b) => b.pods - a.pods)[0];
          if (busiest) {
            busiest.pods -= 1;
            node.pods += 1;
          }
        }
        break;
      }

      case 'healthy':
        this.hud.recovering = false;
        this.hud.lastRecoveryMs = Math.round(performance.now() - this.startedAt);
        this.affected = null;
        this.evictedPods = 0;
        this.announce(
          `Recovered. ${this.hud.nodesReady} of ${this.hud.nodesTotal} nodes ready, ` +
            `${this.hud.failedRequests} failed requests.`,
        );
        break;
    }

    this.emit();
  }

  // --- chaos mode (opt-in easter egg) ---------------------------------------

  setChaos(on: boolean): void {
    this.hud.chaos = on;
    if (this.chaosTimer !== null) {
      window.clearTimeout(this.chaosTimer);
      this.chaosTimer = null;
    }
    if (on && !this.reducedMotion) this.queueChaos();
    this.emit();
  }

  toggleChaos(): void {
    this.setChaos(!this.hud.chaos);
  }

  private queueChaos(): void {
    const gap =
      CHAOS_MIN_GAP_MS + Math.random() * (CHAOS_MAX_GAP_MS - CHAOS_MIN_GAP_MS);
    this.chaosTimer = window.setTimeout(() => {
      if (!this.hud.chaos) return;
      this.fail();
      this.queueChaos();
    }, gap);
  }
}
