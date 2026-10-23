// Checks that every address the site had at yashverma-cloud.github.io still reaches the same page.
//
//   node scripts/check-old-urls.mjs                follow the old github.io addresses (after the switch)
//   node scripts/check-old-urls.mjs --via <origin> request the same paths on <origin> instead, e.g. a
//                                                  preview deployment, to test the redirects before the switch
//
// Node built-ins only. Exits 1 if any address fails.

const OLD = 'https://yashverma-cloud.github.io';
const SITE = 'https://yashverma.cloud';
const RUNBOOK = 'https://runbook.yashverma.cloud';
const MAX_HOPS = 4;

const viaIndex = process.argv.indexOf('--via');
const via = viaIndex > -1 ? process.argv[viaIndex + 1]?.replace(/\/$/, '') : undefined;
const from = via ?? OLD;
const site = via ?? SITE;

const work = [
  'alert-payload-reduction',
  'cloud-cost-optimisation',
  'jarvis-slack-ops',
  'karpenter-autoscaling',
  'live-migration-to-kubernetes',
  'sendmail-ses-cli',
];
const short = {
  in: 'utm_source=linkedin&utm_medium=social_bio&utm_content=profile',
  ig: 'utm_source=instagram&utm_medium=social_bio',
  fb: 'utm_source=facebook&utm_medium=social_bio',
  x: 'utm_source=x&utm_medium=social_bio',
  threads: 'utm_source=threads&utm_medium=social_bio',
};
const runbook = [
  '', 'kubernetes/', 'helm/', 'karpenter/', 'aws/', 'gcp/', 'terraform/', 'docker/', 'git/', 'ci-cd/',
  'ansible/', 'linux/', 'networking/', 'security/', 'databases/', 'observability/', 'debugging/',
  'playbooks/', 'playbooks/crashloop/', 'playbooks/node-not-ready/', 'playbooks/disk-full/',
  'playbooks/terraform-lock/', 'playbooks/bad-release/', 'playbooks/slow-endpoint/',
  'playbooks/tls-expiry/', 'og.png', 'style.css',
];

// [old path, expected final URL, expected final status, whether a 302 is allowed]
const cases = [
  ['/', `${site}/`, 200],
  ['/?utm_source=check', `${site}/?utm_source=check`, 200],
  ...work.flatMap((slug) => [
    [`/work/${slug}/`, `${site}/work/${slug}/`, 200],
    [`/work/${slug}`, `${site}/work/${slug}/`, 200],
    [`/og/work/${slug}.png`, `${site}/og/work/${slug}.png`, 200],
  ]),
  ...Object.entries(short).flatMap(([path, query]) => [
    [`/${path}`, `${site}/?${query}`, 200, true],
    [`/${path}/`, `${site}/?${query}`, 200, true],
  ]),
  ...['/sitemap-index.xml', '/sitemap-0.xml', '/robots.txt', '/favicon.svg', '/og/default.png',
    '/googlebbb04337c1cba257.html'].map((path) => [path, `${site}${path}`, 200]),
  ...runbook.map((path) => [`/yv-cloud-runbook/${path}`, `${RUNBOOK}/${path}`, 200]),
  ['/yv-cloud-runbook', `${RUNBOOK}/`, 200],
  ['/no-such-page/', `${site}/no-such-page/`, 404],
];

async function follow(url) {
  const hops = [];
  for (let i = 0; i <= MAX_HOPS + 2; i++) {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      hops.push(res.status);
      url = new URL(location, url).href;
      continue;
    }
    return { url, status: res.status, hops };
  }
  return { url, status: 'loop', hops };
}

async function check([path, expected, status, allow302]) {
  try {
    const end = await follow(from + path);
    const problems = [];
    if (end.url !== expected) problems.push(`landed on ${end.url}`);
    if (end.status !== status) problems.push(`status ${end.status}`);
    if (end.hops.length > MAX_HOPS) problems.push(`${end.hops.length} hops`);
    const bad = end.hops.filter((code, i) => {
      const last = i === end.hops.length - 1;
      return !(code === 301 || code === 308 || (code === 302 && allow302 && last));
    });
    if (bad.length) problems.push(`temporary redirect (${bad.join(', ')})`);
    return { path, chain: [...end.hops, end.status].join(' > '), problems };
  } catch (error) {
    return { path, chain: '-', problems: [error.cause?.code ?? error.message] };
  }
}

const results = [];
for (let i = 0; i < cases.length; i += 6) {
  results.push(...(await Promise.all(cases.slice(i, i + 6).map(check))));
}

const width = Math.max(...results.map((r) => r.path.length));
for (const r of results) {
  const verdict = r.problems.length ? `FAIL ${r.problems.join('; ')}` : 'ok';
  console.log(`${r.path.padEnd(width)}  ${r.chain.padEnd(22)}  ${verdict}`);
}
const failed = results.filter((r) => r.problems.length).length;
console.log(`\n${results.length - failed} of ${results.length} addresses ok (from ${from}).`);
process.exit(failed ? 1 : 0);
