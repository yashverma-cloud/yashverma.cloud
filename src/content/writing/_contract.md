# Writing — what a post file must contain

Underscore-prefixed, so the collection loader ignores this file. It is the contract for whoever
writes the posts; the section's code is in `src/pages/_writing/` and `src/og/card.ts`.

**Status: parked.** The section is switched off — nothing in this folder appears on the site,
whatever its `draft` value. Posts can still be drafted here. Bringing the section back is
covered in README.md, "Parked: /writing".

## Frontmatter

```yaml
---
title: ''        # sentence case. Becomes the <h1>, the <title>, and the OG card's headline.
                 # Over 52 characters the card drops to a smaller size; under that it is 62px.
description: ''  # one or two lines. Becomes the meta description, the listing line, the
                 # standfirst under the title, and the OG card's second line.
published: ''    # full YYYY-MM-DD, required. BlogPosting datePublished needs a real date, and
                 # the listing prints the day.
updated: ''      # optional, YYYY-MM-DD. Only for a material revision; becomes dateModified.
draft: true      # state it every time.
---
```

**`draft` defaults to `false` in this collection** — the opposite of `work`. A file without the key
publishes the moment it is saved. There is no other switch: a published entry gets a page, an OG
image, a sitemap entry, a listing row and the Writing item in the site nav, all at once.

The filename is the URL: `karpenter-cold-starts.md` → `/writing/karpenter-cold-starts`. A slug is
free to change before the link is shared anywhere and expensive after, because the platforms cache
what they scrape.

## Body

Markdown only. The template styles `h2`, `h3`, paragraphs, `ul`/`ol`, `blockquote`, `hr`, links,
inline `code` and fenced code blocks at a 66-character measure. Do not use `h1` — the title is the
page's only one. Syntax highlighting is off by design: code is set in the site's own palette, so
fenced blocks need no language for colour, though a language tag is harmless.

## Content rules (from CLAUDE.md, which is the authority)

- Facts only from the portfolio, `design/notes.md`, or Yash. Nothing invented — no metrics, tools,
  dates, clients or credentials.
- No employer internals: no counts of regions, environments, clusters or accounts, no internal
  hostnames, account IDs, customer names or dashboards.
- Never imply an employer was deficient. Describe the work and its result.
- A post about employer work may not claim more than its case study under `/work/` already does,
  and may not claim more than the resume.
- First person, active voice, sentence case, plain words, numbers over adjectives.
- Numbers only where they were actually measured.
- Anything missing: `TODO(yash): <question>`, listed at the end of the turn.
