/**
 * Colour tokens for build-time images, read from src/styles/tokens.css at build time so
 * the images can never drift from the site. Only plain hex tokens are read; the one
 * derived colour the images need is mixed here the same way the CSS mixes it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match?.[1]) throw new Error(`tokens.css has no hex value for --${name}`);
  return match[1].toUpperCase();
}

/** Equivalent of `color-mix(in srgb, a p%, b)` for two opaque hex colours. */
export function mix(a: string, b: string, p: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) => Math.round(ch(a, i) * p + ch(b, i) * (1 - p)));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export const T = {
  deep: token('deep'),
  blueprint: token('blueprint'),
  rule: token('rule'),
  line: token('line'),
  muted: token('muted'),
} as const;

/** --rule-faint is 45% --rule over transparent; on the blueprint ground that lands here. */
export const RULE_FAINT = mix(T.rule, T.blueprint, 0.45);

/** The node top face in ClusterPoster.astro: color-mix(--deep 70%, --blueprint). */
export const NODE_TOP = mix(T.deep, T.blueprint, 0.7);
