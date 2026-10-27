/**
 * Every case study's scene: its still's alt text, and a loader that brings in the drawing (and
 * three.js with it) only when a page asks for it. Plain data here, so pages and the scripts that
 * run before the 3D can import it.
 */
import { FEATURED } from '../flights/featured';
import type { DrawingScene } from '../engine/scene';
import type { Vec3 } from '../world';

/** How a case-study page frames its scene: where the camera starts, where it settles, what it looks at. */
export interface SceneView {
  target: Vec3;
  from: Vec3;
  to: Vec3;
  /** 0 pre-dawn to 1 sunrise. */
  dawn: number;
}

/**
 * A view orbiting the drawing: `distance` metres out at `elevation` degrees, from `azimuth`
 * degrees east of south. The camera starts a little further out and higher, and eases in.
 */
export function orbit(target: Vec3, distance: number, { elevation = 35, azimuth = 14, dawn = 0.92, approach = 1.2 } = {}): SceneView {
  const el = (elevation * Math.PI) / 180;
  const az = (azimuth * Math.PI) / 180;
  const at = (d: number, lift = 0): Vec3 => [
    target[0] + Math.sin(az) * Math.cos(el) * d,
    target[1] + Math.sin(el) * d + lift,
    target[2] + Math.cos(az) * Math.cos(el) * d,
  ];
  return { target, to: at(distance), from: at(distance * approach, distance * 0.08), dawn };
}

export interface SceneModule {
  create(origin?: Vec3): DrawingScene;
}

/** How each scene is framed: around its drawing's centre, in the scene's own coordinates. */
export const VIEWS = {
  'cloud-cost-optimisation': orbit([4, 6, -10], 340),
  'live-migration-to-kubernetes': orbit([2, 4, 14], 350),
  'alert-payload-reduction': orbit([0, 8, 2], 320),
  'karpenter-autoscaling': orbit([0, 4, -12], 380),
  'jarvis-slack-ops': orbit([6, 6, 12], 350),
  'sendmail-ses-cli': orbit([-28, 6, 0], 330),
} satisfies Record<string, SceneView>;

/** A case study's three reading sections, in the order they appear: Problem, What I did, Result. */
export const STATE_KEYS = ['problem', 'approach', 'result'] as const;
export type StateKey = (typeof STATE_KEYS)[number];

/**
 * One section's stretch of the drawing: its clock runs from `t[0]` to `t[1]` (scene seconds) as
 * the section is read, and the still for the section shows `t[1]`. `back` is how far the camera
 * stands from the drawing, relative to where the whole drawing fits beside the text: early
 * states are smaller, so the camera is closer, and it pulls back as the system grows.
 */
export interface ReadingState {
  t: [number, number];
  back: number;
  /** The phone snapshot's framing, where the default crops the drawing or crowds a label: the drawing's centre across the frame (0.46) and the share of its width it fills (0.72). */
  snap?: { x?: number; fill?: number };
}

/**
 * The reading sections' states, from each scene's own timeline (BEATS in scenes/<name>.ts).
 * Each stretch starts where the last one ended, so the clock never jumps between sections.
 */
export const STATES = {
  // Oversized nodes show their idle capacity in amber; rightsizing and HPA; the bill falls 40%.
  'cloud-cost-optimisation': {
    problem: { t: [1.4, 2.3], back: 0.92 },
    approach: { t: [2.3, 4.5], back: 0.92 },
    result: { t: [4.5, 5.8], back: 1 },
  },
  // The source and the cluster; the checks, DMS and the copy; the one planned cutover.
  'live-migration-to-kubernetes': {
    problem: { t: [0.9, 1.3], back: 0.92 },
    approach: { t: [1.3, 4.8], back: 0.96 },
    result: { t: [4.8, 6], back: 1 },
  },
  // The default payload in Grafana's lane; the cut and its card; the same again in Coralogix.
  'alert-payload-reduction': {
    problem: { t: [0.8, 1.6], back: 0.92 },
    approach: { t: [1.6, 3.4], back: 0.96 },
    result: { t: [3.4, 5.6], back: 1 },
  },
  // A pod that fits nowhere; Karpenter draws a node for it; the field grows past 100 nodes.
  'karpenter-autoscaling': {
    problem: { t: [0.7, 1.0], back: 0.5 },
    approach: { t: [1.0, 2.6], back: 0.54, snap: { x: 0.26 } },
    result: { t: [2.6, 5], back: 1, snap: { fill: 0.62, x: 0.5 } },
  },
  // Slack and the cluster; the four checks, a read and an admin command; a refusal, the audit line.
  'jarvis-slack-ops': {
    problem: { t: [0.4, 0.7], back: 0.92 },
    approach: { t: [0.7, 3.5], back: 0.96 },
    result: { t: [3.5, 5.6], back: 1 },
  },
  // Jobs piping mail into the old tool; the same-shaped CLI drops in; mail out through SES.
  'sendmail-ses-cli': {
    problem: { t: [0.6, 2.2], back: 0.92 },
    approach: { t: [2.2, 3.6], back: 0.96 },
    result: { t: [3.6, 5.6], back: 1 },
  },
} satisfies Record<string, Record<StateKey, ReadingState>>;

const alt = (slug: string) => FEATURED.find((f) => f.slug === slug)?.alt ?? '';

export const SCENES = {
  'cloud-cost-optimisation': { alt: alt('cloud-cost-optimisation'), load: () => import('./cost') as Promise<SceneModule> },
  'live-migration-to-kubernetes': { alt: alt('live-migration-to-kubernetes'), load: () => import('./migration') as Promise<SceneModule> },
  'alert-payload-reduction': { alt: alt('alert-payload-reduction'), load: () => import('./alerts') as Promise<SceneModule> },
  'karpenter-autoscaling': { alt: alt('karpenter-autoscaling'), load: () => import('./karpenter') as Promise<SceneModule> },
  'jarvis-slack-ops': {
    alt: 'Requests from Slack pass a gate of four checks; permitted commands reach the cluster by role, a refused one stops in amber, and every action writes a line to an audit channel.',
    load: () => import('./jarvis') as Promise<SceneModule>,
  },
  'sendmail-ses-cli': {
    alt: 'Legacy jobs pipe mail into the same socket; the old tool lifts out and a new CLI of the same shape drops in, sending through AWS SES to the mailbox.',
    load: () => import('./sendmail') as Promise<SceneModule>,
  },
} as const;

export type SceneSlug = keyof typeof SCENES;
