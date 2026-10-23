/*
 * Fills a brand template, then marks it ready for render.mjs to screenshot.
 *   - [data-cluster]          gets the hero's cluster drawing (dist/og/cluster.svg)
 *   - ?card=<id>              fills [data-field] elements from cards.json
 *   - ?guides                 shows the safe-zone overlays
 * Templates open fine on their own too: `npm run brand -- --serve`.
 */
const params = new URLSearchParams(location.search);
if (params.has('guides')) document.documentElement.classList.add('guides');

const text = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
};

async function fill() {
  const cluster = await text('/dist/og/cluster.svg');
  for (const el of document.querySelectorAll('[data-cluster]')) el.innerHTML = cluster;

  const id = params.get('card');
  if (id) {
    const cards = JSON.parse(await text('/brand/cards.json'));
    const card = cards.find((c) => c.id === id);
    if (!card) throw new Error(`cards.json has no card "${id}"`);
    for (const el of document.querySelectorAll('[data-field]')) {
      const value = card[el.dataset.field];
      if (value == null) {
        el.remove();
      } else if (el.dataset.field === 'diagram') {
        el.innerHTML = value === 'cluster' ? cluster : await text(`/brand/${value}`);
        if (value === 'cluster') el.dataset.kind = 'cluster';
      } else {
        el.textContent = value;
      }
    }
  }

  await document.fonts.ready;
  document.documentElement.dataset.ready = 'true';
}

fill().catch((err) => {
  document.documentElement.dataset.ready = 'error';
  document.documentElement.dataset.error = String(err.message || err);
});
