/** The components the style guide shows, each alone at /lab/system/c/<name>/. */
export const COMPONENTS = [
  'nav',
  'hero',
  'section-header',
  'proof',
  'scene-frame',
  'flight-path',
  'stack',
  'runbook',
  'recognition',
  'credentials',
  'contact',
  'footer',
  'not-found',
] as const;

export type ComponentName = (typeof COMPONENTS)[number];

export const COMPONENT_NAMES: Record<ComponentName, string> = {
  nav: 'Nav',
  hero: 'Hero',
  'section-header': 'Section header',
  proof: 'Proof figures',
  'scene-frame': 'Case-study scene frame',
  'flight-path': 'Experience as a flight path',
  stack: 'Stack',
  runbook: 'Runbook link',
  recognition: 'Recognition',
  credentials: 'Certifications and education',
  contact: 'Contact',
  footer: 'Footer',
  'not-found': '404',
};
