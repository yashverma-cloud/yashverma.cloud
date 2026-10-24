# Brand kit

The social avatar, covers and LinkedIn post templates, rendered from the site's own tokens
and fonts so they always match it. The templates are pages at `/lab/brand/<name>/`
(`src/pages/lab/brand/[name].astro`); the identity files (monogram, wordmark, lockup) are in
`brand/altitude/`, written by `scripts/system/identity.mjs`. Nothing in `brand/` is deployed;
rendered PNGs go to `brand/export/altitude/`, which is not committed.

```bash
npm run build                  # once: builds the template pages
npm run brand                  # renders every image into brand/export/altitude/
npm run brand -- --guides      # the same with safe-zone overlays, into brand/export/altitude/guides/
```

## Sizes

Checked against each platform in September 2026. Re-check before uploading if it has been
a while; these change.

| File | Size | Safe zone used | Source |
|---|---|---|---|
| `avatar-1080.png` | 1080×1080 | The centred circle every platform crops to | — |
| `linkedin-profile-1584x396.png` | 1584×396 | Centred 1350×220, ≥300px from the left (the profile photo covers the bottom-left, more on mobile) | [Linearity](https://www.linearity.io/blog/linkedin-size-guide/), [Snappa](https://snappa.com/blog/linkedin-banner-size/) |
| `facebook-page-1640x924.png` | 1640×924 (16:9) | The 2.4:1 band a phone keeps, clear of the profile picture | [Facebook Help](https://www.facebook.com/help/125379114252045): 16:9 on computers, 2.4:1 on phones |
| `x-header-1500x500.png` | 1500×500 (3:1) | Centred 1500×360 band (phones trim the top and bottom), clear of the profile picture at the bottom-left | [Snappa](https://snappa.com/blog/twitter-header-size/), [Krumzi](https://www.krumzi.com/size-guide/twitter-header-size) |
| `post-*.png` | 1080×1350 (4:5) | Whole card; no text under 36px, since the feed shows it at a third to half size | — |

After uploading the Facebook cover, check it on a phone: the new layout is recent and
Facebook's help page is terse about how it crops.

## Post templates

`brand/altitude/cards.json` holds the words for the three sample posts, one per template;
edit an entry and run `npm run brand`. Every field is plain text.

| Template | Entry | Fields |
|---|---|---|
| `post-diagram` | `sample-diagram` | `label`, `title`, `diagram`, `caption` |
| `post-insight` | `sample-insight` | `label`, `statement`, `source` |
| `post-snippet` | `sample-snippet` | `label`, `title`, `code` (newlines kept), `caption` |

The samples use lines from the site's own case studies.

## Brand section for automated post drafting

Paste this into any task that drafts post images, as its brand section. It includes the
font-install step a fresh sandbox needs.

```text
Brand: Altitude (matches https://yashverma.cloud). Every post image is 1080x1350 (4:5).
FONTS (download once, then fc-cache -f):
  Archivo variable: https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/Archivo%5Bwdth,wght%5D.ttf
  B612 Mono: https://raw.githubusercontent.com/google/fonts/main/ofl/b612mono/B612Mono-Regular.ttf
  Render with Chromium (HTML/CSS) so the width axis works: font-stretch maps to Archivo's wdth.
COLOURS: ground #040C1F everywhere. Text #EEF3F6. Secondary text #B8C7D7. Hairlines and edges #5F82AB.
  Linework #EAF1F4. Code panel #0B1D3E. Amber #F5A524 ONLY for a failure or waste state the post itself
  describes (a pod that cannot be placed, idle capacity); most images use none. No other colours.
THE HORIZON (every image): a 2px #5F82AB line across the full width at y=1010; under it a dawn wash,
  linear-gradient(#E29060 at 20% opacity, transparent) over 160px, on #040C1F.
LAYOUT (px; margins 80 left and right):
  Label: x80 y96, Archivo 36px weight 480, #B8C7D7, sentence case (e.g. "Autoscaling").
  Title (diagram, snippet): 36px under the label, Archivo 72px (snippet 60px), weight 340, font-stretch 112%,
    line-height 1.04, letter-spacing -0.02em, #EEF3F6, max-width 18ch, balanced lines.
  Statement (insight): 132px under the label, Archivo 84px, weight 340, font-stretch 112%, line-height 1.06.
  Diagram: white linework standing ON the horizon (bottom at y~1000), centred, between y430 and y1000.
    Axonometric 30 degrees. Strokes 3px (2.2px for surrounding parts), round caps. Faces get a 4-7% white
    wash. Something that does not exist yet: 2px amber dashed outline. The stuck thing: a small solid amber block.
  Code (snippet): B612 Mono 36px, line-height 1.42, #EAF1F4 on #0B1D3E, 2px #5F82AB border, padding 36px 40px.
  Caption or source: under the horizon at y1046, Archivo 36px, #B8C7D7, line-height 1.32.
  Signature: bottom-left (x80, 72px from the bottom): the monogram 84x84 in #EEF3F6, 26px gap, then
    "Yash Verma" (Archivo 40px weight 380, font-stretch 125%, #EEF3F6) over "yashverma.cloud" (36px #B8C7D7).
MONOGRAM SVG: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g fill="none" stroke="#EEF3F6" stroke-width="2.75" stroke-linejoin="miter" stroke-linecap="butt" stroke-miterlimit="12"><polyline points="2.5,5 16,28.5 29.5,5"/><polyline points="11.2,5 16,13.2 20.8,5"/><polyline points="16,13.2 16,19.8"/></g></svg>
RULES: nothing smaller than 36px; 35 words max on diagram and insight cards; sentence case; no ALL-CAPS,
  emoji, hashtags, photos, stock art, icons, glow, drop shadows or rounded boxes; no gradient except the dawn
  wash. Facts only from the post and https://yashverma.cloud; numbers exactly as published.
```
