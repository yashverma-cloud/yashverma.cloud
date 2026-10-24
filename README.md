# yashverma.cloud

Personal site of Yash Verma — cloud infrastructure engineer, Jaipur, India.
Live at <https://yashverma.cloud/>.

Static site built with [Astro](https://astro.build), deployed to Cloudflare Pages.
No runtime services, no third-party CDNs: every dependency comes from npm and is
bundled at build time.

## Running it locally

Requires Node 22 or newer.

```bash
npm install
npm run dev        # dev server, http://localhost:4321
npm run build      # type-check + production build into dist/
npm run build:fast # build without the type-check, for quick iteration
npm run preview    # serve the built site
```

`build:fast` skips `astro check`. On a Windows drive mounted into WSL the type-check is
I/O-bound and can take minutes; use it while iterating, and `npm run build` before pushing.
CI always runs the full build.

To check it on a phone on the same Wi-Fi:

```bash
npm run build && npm run preview -- --host
```

then open the network URL it prints.

## Layout

```
src/
  content/      experience, work, certifications, recognition, links, writing  (content collections)
  system/       the design system: tokens.mjs (single source), tokens.css (generated), fonts,
                system.css, Page.astro (metadata, JSON-LD, analytics), components/, templates/
  altitude/     the 3D world: engine/, scenes/ (one drawing per case study), flights/ (camera paths),
                home.ts and work.ts (the live controllers), posters.ts (still image sizes)
  og/           altitude.ts — Open Graph cards (Satori + resvg), drawn at build time
  pages/        index, work/[slug], writing/, [short] (bio short links), og/ (Open Graph images), 404,
                lab/ (style guide, scene and brand pages; noindex, out of the sitemap)
public/         fonts, favicon, robots.txt, _headers and _redirects (Cloudflare Pages)
brand/          social covers and post templates, rendered locally (see brand/README.md)
scripts/        check-old-urls.mjs — checks that every old address redirects to the right page
                make-icons.mjs — regenerates the raster icons from public/favicon.svg
                system/ — token generator, contrast, focus, Lighthouse and screenshot checks
                altitude/, lab/ — render, measure and record the scenes
```

Design tokens are defined once in `src/system/tokens.mjs`; `npm run build` regenerates
`src/system/tokens.css` and fails on drift or on any text pair under WCAG AA.

## /writing

Postmortems and notes, from the `writing` collection (`src/content/writing/`; the rules for a
post file are in `_contract.md` there). Only entries with `draft: false` appear. While none is
published, `/writing/` shows "No posts yet.", carries `noindex`, and is left out of the sitemap
(`astro.config.mjs`) and the nav (`Nav.astro`); the first published post brings all three in,
with its page, Open Graph card and `BlogPosting` data.

`lighthouserc.json` audits `/writing/` for accessibility and best practices only while it is
`noindex`. When the first post is published, add its `/writing/<slug>/index.html` to the `url`
list and move `/writing/` into the full set of assertions.

## Deploys

- Cloudflare Pages builds the repository through its Git integration: a merge to `main`
  deploys to production, and every pull request gets a preview deployment, linked from
  the pull request's checks. Build command `npm run build`, output `dist`, Node 22.
- Pull requests to `main` also run `.github/workflows/ci.yml`: install, build, then Lighthouse
  CI against `dist/`. Accessibility, best practices and SEO scores fail the build;
  performance is a warning only, because the CI runner renders WebGL in software —
  check performance on a real device.
- `public/_headers` sets the security and caching headers; the script and style sources are
  in the CSP `<meta>` that Astro writes from `security.csp` in `astro.config.mjs`.
  `public/_redirects` answers the bio short links and the runbook's old paths at the edge.
- Dependencies are updated monthly by Dependabot.

To roll back, open the project's deployments in the Cloudflare dashboard and roll back to the
previous production deployment, then revert the offending commit through a pull request.

The site used to live at `yashverma-cloud.github.io`. That address now answers every path with
a redirect to the same path here; `node scripts/check-old-urls.mjs` checks the whole list.
