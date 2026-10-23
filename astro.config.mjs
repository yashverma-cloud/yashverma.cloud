// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Astro's CSP <meta> only hashes the inline scripts it has met by the time it writes <head>,
 * which leaves out the is:inline scripts further down the page (the GA4 loader, the email
 * button, the diagram arming script). This adds their hashes to each page after the build.
 * @type {import('astro').AstroIntegration}
 */
const hashInlineScripts = {
  name: 'hash-inline-scripts',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      const root = fileURLToPath(dir);
      const pages = (await readdir(root, { recursive: true })).filter((f) => f.endsWith('.html'));
      for (const page of pages) {
        const file = join(root, page);
        const html = await readFile(file, 'utf8');
        const hashes = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
          .filter(([, attrs]) => !/\bsrc=|application\/ld\+json/.test(attrs))
          .map(([, , body]) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`);
        const out = html.replace(/(content-security-policy" content="[^"]*?script-src )([^;"]*)/, (_, head, sources) =>
          head + [sources, ...hashes.filter((h) => !sources.includes(h))].join(' '),
        );
        if (out !== html) await writeFile(file, out);
      }
    },
  },
};

// Served from the root of yashverma.cloud by Cloudflare Pages, so no `base`.
export default defineConfig({
  site: 'https://yashverma.cloud',
  output: 'static',
  trailingSlash: 'ignore',
  security: {
    // Astro hashes every script and <style> it emits into a CSP <meta> on each page.
    // GA4 loads from googletagmanager.com and reports to google-analytics.com and
    // www.google.com/g/collect (Base.astro).
    // Directives a <meta> can't carry (frame-ancestors) are headers in public/_headers.
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com https://www.google.com",
        "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://www.google.com",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      scriptDirective: {
        resources: ["'self'", 'https://www.googletagmanager.com'],
      },
      styleDirective: {
        // Diagrams and the poster pass CSS custom properties through style attributes.
        resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }],
      },
    },
  },
  integrations: [
    sitemap({
      // Bio short links redirect and must stay out of the index.
      filter: (page) =>
        !['/in', '/ig', '/fb', '/x', '/threads'].includes(
          new URL(page).pathname.replace(/\/$/, ''),
        ),
    }),
    hashInlineScripts,
  ],
  markdown: {
    // Code is set in the site's own tokens (base.css), not a highlighter theme's palette.
    syntaxHighlight: false,
  },
  build: {
    inlineStylesheets: 'always',
  },
  vite: {
    build: {
      // Keeps the eventual 3D chunk identifiable in the bundle report.
      chunkSizeWarningLimit: 300,
    },
  },
});
