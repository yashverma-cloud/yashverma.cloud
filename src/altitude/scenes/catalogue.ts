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
  'sendmail-ses-cli': orbit([2, 6, 0], 330),
} satisfies Record<string, SceneView>;

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
