# yashverma-cloud.github.io

Personal site of Yash Verma — cloud infrastructure engineer, Jaipur, India.
Live at <https://yashverma-cloud.github.io/>.

Static site built with [Astro](https://astro.build), deployed to GitHub Pages.
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
  content/      experience, work, certifications, links, writing  (content collections)
  components/   page sections
  layouts/      Base.astro — metadata, JSON-LD, fonts, analytics
  scene/        cluster geometry shared by the poster and the hero scene
  styles/       tokens.css (design tokens), base.css, fonts.css
  pages/        index, work/[slug], [short] (bio short links), og/ (Open Graph images), 404
                _writing/, og/_writing/ — the writing section, parked (see below)
public/         fonts, favicon, robots.txt
scripts/        make-icons.mjs — regenerates the raster icons from public/favicon.svg
```

Design tokens are defined once in `src/styles/tokens.css`. Colours are not added there
without recording the contrast ratio against both grounds.

## Parked: /writing

A blog section for technical posts is fully built but switched off. Astro does not build
anything in a folder whose name starts with `_`, so `src/pages/_writing/` and
`src/pages/og/_writing/` produce no pages, no images and no sitemap entries, and the nav
shows no Writing item. The rest of the code stays in place and type-checked: the `writing`
content collection, `postCard` in `src/og/card.ts`, `formatDay` in `src/utils/dates.ts`,
and the `jsonLd` prop on `Base.astro` that a post uses for its `BlogPosting` data.

To bring it back, do steps 1 and 2 in the same commit — with the folders restored and no
published post, `/writing` would build as an empty `noindex` page:

1. Restore the route folders:

   ```bash
   git mv src/pages/_writing src/pages/writing
   git mv src/pages/og/_writing src/pages/og/writing
   ```

2. Publish at least one post: `draft: false` in its file in `src/content/writing/`. The
   frontmatter and content rules are in `src/content/writing/_contract.md`. The index, post
   pages, Open Graph cards, sitemap entries and nav item all follow on their own.
3. Add `/writing/index.html` and each post's `/writing/<slug>/index.html` to the `url` list
   in `lighthouserc.json`, so CI audits them.

## Deploys

- Push to `main` runs `.github/workflows/deploy.yml`, which builds with the official
  Astro action and publishes to GitHub Pages.
- Pull requests to `main` run `.github/workflows/ci.yml`: install, build, then Lighthouse
  CI against `dist/`. Accessibility, best practices and SEO scores fail the build;
  performance is a warning only, because the CI runner renders WebGL in software —
  check performance on a real device.
- Dependencies are updated monthly by Dependabot.

To roll back, revert the offending commit on `main` and push; the deploy workflow republishes.
