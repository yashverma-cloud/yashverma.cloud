/** Single source of truth for identity strings used in metadata and JSON-LD. */

export const SITE = {
  url: 'https://yashverma-cloud.github.io',
  name: 'Yash Verma',
  /** Official title, must match the resume (CLAUDE.md). */
  jobTitle: 'Infrastructure Engineer, Cloud Operations',
  employer: 'Copado',
  location: 'Jaipur, India',
  title: 'Yash Verma — cloud infrastructure engineer',
  description:
    'I keep production Kubernetes running when nodes die. Infrastructure Engineer, Cloud Operations at Copado, in Jaipur. Autoscaling, cost and observability across multi-region production infrastructure. Five years on AWS and GCP, at Treebo, BLG and now Copado.',
  analyticsId: 'G-75ZS56MGG5',
  /** Attribution on X link cards (twitter:site). */
  xHandle: '@yashverma_cloud',
} as const;

/** Assembled in the browser so no raw address appears in the HTML (CLAUDE.md). */
export const EMAIL_PARTS = ['yashverma.cloud', 'gmail.com'] as const;

/**
 * Every profile that is the same person, for JSON-LD `sameAs`. Not the site's visible links:
 * those are LinkedIn, GitHub and email only (src/content/links.yaml). List only accounts that
 * still exist: a dead URL here is worse than a missing one.
 */
export const SAME_AS = [
  'https://www.linkedin.com/in/yashcloud/',
  'https://github.com/yashverma-cloud',
  'https://www.instagram.com/yashverma_cloud/',
  'https://www.facebook.com/yashverma.cloud',
  'https://x.com/yashverma_cloud',
  'https://www.threads.com/@yashverma_cloud',
] as const;
