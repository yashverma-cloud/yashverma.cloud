/**
 * The Altitude design system's tokens: the single source for the site's CSS, the live scene
 * and the build-time images. Plain ESM so Node scripts, Astro pages and the browser bundle
 * all import the same values.
 *
 *   node scripts/system/tokens.mjs           writes src/system/tokens.css
 *   node scripts/system/tokens.mjs --check   fails on drift, or on any text pair under WCAG AA
 *
 * Rules: every colour that can carry text is listed in TEXT_PAIRS and checked; imagery-only
 * colours (clouds, horizon, glow) never carry text. Sizes are px at the two ends of the fluid
 * range and become one linear clamp() each.
 */

/** The fluid range: below MIN every size holds its minimum, above MAX its maximum. */
export const VIEWPORT = { min: 360, max: 2560 };

export const colour = {
  /** Grounds, from the top of the descent to the ground. */
  night: '#040c1f',
  deck: '#0b1d3e',
  dawn: '#13294d',
  sheet: '#0e2240',
  raised: '#1a3560',
  /** Text: primary, secondary, quiet. */
  ink: '#eef3f6',
  ink2: '#b8c7d7',
  ink3: '#93a8bf',
  /** The drawing's white linework. */
  line: '#eaf1f4',
  /** Hairlines and component edges (>= 3:1 on every ground). */
  rule: '#5f82ab',
  /** Decorative graticule only; never the only edge of anything. */
  ruleFaint: 'rgba(214, 228, 240, 0.18)',
  /** Imagery only: cloud light, cloud body, cloud shade, the horizon band and its glow. */
  cloudLit: '#f6f1ea',
  cloudBody: '#dfe6ee',
  cloudShade: '#9fb0c6',
  horizon: '#5f809e',
  glow: '#e29060',
  /** Sunlight, and a failure or waste state the page itself describes. Nothing else. */
  sun: '#f5a524',
};

export const GROUNDS = ['night', 'deck', 'dawn', 'sheet', 'raised'];

/**
 * Every pair that carries text or a component edge, with its WCAG minimum:
 * 4.5 for text, 3 for edges and focus rings (non-text contrast, 1.4.11).
 */
export const TEXT_PAIRS = [
  ...['ink', 'ink2', 'ink3', 'sun'].flatMap((fg) => GROUNDS.map((bg) => ({ fg, bg, min: 4.5 }))),
  ...['rule', 'ink'].flatMap((fg) => GROUNDS.map((bg) => ({ fg, bg, min: 3, edge: true }))),
  /** The primary button: night text on an ink fill. */
  { fg: 'night', bg: 'ink', min: 4.5 },
  { fg: 'deck', bg: 'ink', min: 4.5 },
];

export const font = {
  sans: "'Archivo', 'Archivo Fallback', 'Archivo Fallback Android', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "'B612 Mono', 'B612 Mono Fallback', ui-monospace, 'SFMono-Regular', 'Cascadia Mono', monospace",
  deva: "'Anek Devanagari', 'Noto Sans Devanagari', 'Nirmala UI', 'Kohinoor Devanagari', sans-serif",
};

/**
 * The type scale. Seven sizes, few on any one screen. `wdth` is Archivo's width axis (100 to
 * 125): the name is set wide, like lettering on an aircraft; statements a little wide; text at
 * normal width. Data, and only data, is set in B612 Mono.
 */
export const type = {
  name: { min: 64, max: 280, lh: 0.84, track: -0.03, wght: 300, wdth: 125 },
  display: { min: 30, max: 92, lh: 1.04, track: -0.02, wght: 340, wdth: 112 },
  title: { min: 22, max: 44, lh: 1.16, track: -0.01, wght: 420, wdth: 104 },
  lead: { min: 19, max: 30, lh: 1.45, track: -0.005, wght: 360, wdth: 100 },
  body: { min: 17, max: 26, lh: 1.6, track: 0, wght: 400, wdth: 100 },
  small: { min: 14, max: 20, lh: 1.5, track: 0.003, wght: 420, wdth: 100 },
  data: { min: 12, max: 18, lh: 1.4, track: 0.01, mono: true },
};

/** Paragraph measure, in em of the paragraph's own size. */
export const MEASURE = '34em';

/** Spacing, px at the two ends of the range. */
export const space = {
  '3xs': [4, 6],
  '2xs': [8, 12],
  xs: [12, 18],
  s: [16, 26],
  m: [24, 40],
  l: [32, 56],
  xl: [48, 88],
  '2xl': [72, 136],
  '3xl': [112, 216],
};

/** The grid: twelve columns at every width, full bleed. Only paragraphs keep a measure. */
export const grid = { columns: 12, margin: [20, 112], gap: [12, 44] };

/** Line weights in CSS px. The drawing kit uses the same values for its strokes. */
export const weight = {
  hairline: 1,
  /** The system a case study is about. */
  primary: 1.75,
  /** Everything around it. */
  secondary: 1.3,
  /** Boundaries, plumb lines, leaders. */
  construction: 1.1,
  /** Outlines of things that do not exist yet. */
  guide: 1,
  focus: 2,
};

/** Stacking layers. */
export const layer = { stage: 0, labels: 1, copy: 2, instruments: 3, nav: 10, skip: 50, stats: 60 };

/** Easing curves (cubic-bezier) and durations. Scroll-scrubbed motion has no durations. */
export const ease = {
  /** Arrivals: things that rise into place. */
  rise: [0.2, 0.7, 0.1, 1],
  /** Interface states: hover, focus, open. */
  settle: [0.16, 1, 0.3, 1],
  /** Travel between two resting places. */
  glide: [0.65, 0, 0.35, 1],
  /** Exits: things that leave. */
  lift: [0.4, 0, 1, 1],
};

export const duration = { instant: 120, quick: 240, base: 480, slow: 900, epic: 1600 };

/**
 * The sky through the descent, for the live scene: each entry keyed at dawn 0 (pre-dawn, the
 * top of the page), 0.55 and 1 (sunrise, the ground). Linear-light interpolation happens in
 * the scene; these are the sRGB keys.
 */
export const sky = {
  zenith: ['#040c1f', '#0c2148', '#183a6b'],
  sky: ['#0b1d3e', '#1d3a6b', '#3c6296'],
  horizon: ['#21455e', '#5f809e', '#98aec6'],
  sunward: ['#7a4b3c', '#e29060', '#ffc27c'],
  glow: ['#8a5030', '#f2a35e', '#ffb75c'],
  key: ['#9aa7cc', '#f3b88a', '#ffd3a3'],
  ambTop: ['#3a5788', '#58709e', '#7392bf'],
  ambBottom: ['#141f3a', '#28365a', '#3a4868'],
  haze: ['#21365a', '#6c84a8', '#a0b1ca'],
  ground: ['#0a1b36', '#11294c', '#18335a'],
};

/** Light intensities by dawn (key light, ambient, sun glow, stars). */
export const light = {
  keyI: [1.15, 1.7, 2.4],
  ambI: [0.72, 0.9, 1.0],
  glowI: [0.5, 1.0, 1.25],
  starsI: [1, 0.12, 0],
};

// --- Derived -----------------------------------------------------------------------

/** A px value at the two ends of the range as one linear clamp(), in rem and vw. */
export function fluid([min, max], { min: v0, max: v1 } = VIEWPORT) {
  const slope = (max - min) / (v1 - v0);
  const intercept = min - slope * v0;
  const rem = (px) => `${+(px / 16).toFixed(4)}rem`;
  return `clamp(${rem(min)}, ${rem(intercept)} + ${+(slope * 100).toFixed(4)}vw, ${rem(max)})`;
}

/** The size in px a fluid token takes at a viewport width. */
export function fluidAt([min, max], width, { min: v0, max: v1 } = VIEWPORT) {
  const t = Math.min(1, Math.max(0, (width - v0) / (v1 - v0)));
  return min + (max - min) * t;
}

/** WCAG relative luminance of an sRGB hex colour. */
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two opaque hex colours. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
