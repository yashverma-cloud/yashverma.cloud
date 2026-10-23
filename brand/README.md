# Brand kit

Social covers and LinkedIn post cards, rendered from the site's own tokens and fonts so
they always match it. Nothing in `brand/` is deployed; rendered PNGs go to
`brand/export/`, which is not committed.

```bash
npm run build                  # once: writes dist/og/cluster.svg, used by the covers
npm run brand                  # renders every cover and card into brand/export/
npm run brand -- --guides      # the same with safe-zone overlays, into brand/export/guides/
npm run brand -- --serve       # serves the templates on http://127.0.0.1:4400 for editing
```

## Sizes

Checked against each platform in September 2026. Re-check before uploading if it has been
a while; these change.

| File | Size | Safe zone used | Source |
|---|---|---|---|
| `linkedin-profile-1584x396.png` | 1584×396 | Centred 1350×220, ≥300px from the left (the profile photo covers the bottom-left, more on mobile) | [Linearity](https://www.linearity.io/blog/linkedin-size-guide/), [Snappa](https://snappa.com/blog/linkedin-banner-size/) |
| `facebook-page-1640x924.png` | 1640×924 (16:9) | The 2.4:1 band a phone keeps, clear of the profile picture | [Facebook Help](https://www.facebook.com/help/125379114252045): 16:9 on computers, 2.4:1 on phones |
| `x-header-1500x500.png` | 1500×500 (3:1) | Centred 1500×360 band (phones trim the top and bottom), clear of the profile picture at the bottom-left | [Snappa](https://snappa.com/blog/twitter-header-size/), [Krumzi](https://www.krumzi.com/size-guide/twitter-header-size) |
| `card-*.png` | 1080×1350 (4:5) | Whole card; no text under 36px, since the feed shows it at a third to half size | — |

After uploading the Facebook cover, check it on a phone: the new layout is recent and
Facebook's help page is terse about how it crops.

## Making a card

Add an entry to `cards.json` and run `npm run brand`. Every field is plain text; leave one
out and its element is removed.

| Template | Fields |
|---|---|
| `diagram` | `label`, `title`, `diagram` (`"cluster"`, or the path of an SVG file inside `brand/`), `caption` |
| `insight` | `label`, `statement`, `source` |
| `snippet` | `label`, `title`, `code` (newlines kept), `caption` |

The three sample cards use lines from the site's own case studies.

## Brand section for automated post drafting

Paste this into any task that drafts post images, as its brand section. It includes the
font-install step a fresh sandbox needs.

```text
Brand (identical on every image; matches https://yashverma-cloud.github.io)
- Colours: background #15345C. Text and all linework #EAF1F4. Secondary text, captions and labels #8FA9C4. Hairlines and borders #5580B0. Panels and code blocks #0C2442, edged with a 1px #5580B0 line.
- #F5A524 is reserved for a failure state inside a diagram (a node down, an error). Never decoration, never a highlight; most images use none.
- Typeface Overpass: 700 headlines, 600 labels, 400 body. Overpass Mono, 400, only for real code and terminal output. If they are not installed, download https://raw.githubusercontent.com/google/fonts/main/ofl/overpass/Overpass%5Bwght%5D.ttf and https://raw.githubusercontent.com/google/fonts/main/ofl/overpassmono/OverpassMono%5Bwght%5D.ttf, copy both into ~/.fonts/, and run "fc-cache -f" before rendering.
- Sentence case (capitalize proper nouns like Karpenter, Terraform, AWS normally). No ALL-CAPS labels, emojis or hashtags in the image.
- Style: blueprint line drawings, white linework, axonometric where it helps. No photos, stock art or icons. Flat colour: no gradients, glow, drop shadows or rounded boxes; 1px hairlines instead.
- Footer, bottom-right, as a small title block: "Yash Verma" over "yashverma-cloud.github.io".
- Phone-readable: nothing smaller than 36 px in the final 1080x1350 output (so render at device_scale_factor 1 with a 1080x1350 viewport, or scale CSS sizes accordingly if you use a different render pipeline); 35 words max on diagram and insight cards.
```
