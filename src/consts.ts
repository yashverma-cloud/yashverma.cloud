/** Single source of truth for identity strings used in metadata and JSON-LD. */

export const SITE = {
  url: 'https://yashverma.cloud',
  name: 'Yash Verma',
  /** Official title, must match the resume (CLAUDE.md). */
  jobTitle: 'Infrastructure Engineer, Cloud Operations',
  employer: 'Copado',
  location: 'India · IST',
  title: 'Yash Verma — cloud infrastructure engineer',
  description:
    'I keep production Kubernetes running when nodes die. Infrastructure Engineer, Cloud Operations at Copado. Autoscaling, cost and observability across multi-region production infrastructure. Five years on AWS and GCP, at Treebo, BLG and now Copado.',
  analyticsId: 'G-75ZS56MGG5',
  /** Attribution on X link cards (twitter:site). */
  xHandle: '@yashverma_cloud',
} as const;

/** Assembled in the browser so no raw address appears in the HTML (CLAUDE.md). */
export const EMAIL_PARTS = ['yash', 'yashverma.cloud'] as const;

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

/**
 * Absolute URL of an OG image, versioned with the deploy's commit (Cloudflare Pages sets
 * CF_PAGES_COMMIT_SHA at build time). Each deploy gets new image URLs, so neither Cloudflare's
 * edge cache (/og/* is cached for 30 days) nor a link preview cache can keep an old card.
 */
export function ogImageHref(path: string): string {
  const url = new URL(path, SITE.url);
  // Read through globalThis: this module is also bundled for the browser, which has no process.
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
  const version = (env?.CF_PAGES_COMMIT_SHA ?? '').slice(0, 7);
  if (version) url.searchParams.set('v', version);
  return url.href;
}
