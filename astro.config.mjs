// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// User site served from the root of yashverma-cloud.github.io, so no `base`.
export default defineConfig({
  site: 'https://yashverma-cloud.github.io',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [
    sitemap({
      // Bio short links redirect and must stay out of the index.
      filter: (page) =>
        !['/in', '/ig', '/fb', '/x', '/threads'].includes(
          new URL(page).pathname.replace(/\/$/, ''),
        ),
    }),
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
