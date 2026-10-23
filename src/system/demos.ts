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
  'writing-list',
  'writing-empty',
  'note',
  'article',
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
  'writing-list': 'Writing list',
  'writing-empty': 'Writing list, empty',
  note: 'Note page',
  article: 'Article page',
  contact: 'Contact',
  footer: 'Footer',
  'not-found': '404',
};
