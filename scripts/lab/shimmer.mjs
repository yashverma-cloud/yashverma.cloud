/**
 * Measures how steady the case-study drawing is while the camera moves: renders a slow pan
 * (a fraction of a pixel per frame, like the idle drift or the tail of a scroll) with the
 * drawing's clock frozen, and scores how erratically each pixel of the drawing changes.
 *
 *   npm run build:fast && PLAYWRIGHT_BROWSERS_PATH=0 node scripts/lab/shimmer.mjs \
 *     [--size=1440x900] [--phone] [--at=0.8] [--speed=0.07] [--frames=24] [--t=5] \
 *     [--hide=pods,fills,lines,pending] [--ground-depth=off] [--label=name] [--route=/lab/altitude/] \
 *     [--dist=dist] [--port=4322] [--probe=N]
 *
 * The camera holds its place on the flight at --at and turns diagonally by --speed pixels a
 * frame, so the whole picture slides evenly. A well-filtered drawing then changes each pixel
 * gradually; a pixel that jumps by more than 40 levels against its neighbours in time is a
 * pop (aliasing, depth fighting, sub-pixel crawl). At 0.07 px a frame a perfectly filtered
 * edge never jumps more than about 25 levels, so every pop is a defect. Writes a heat map of
 * where the drawing flickers to .screenshots/web-05/shimmer/<label>-heat.png. --probe=N prints the N
 * worst pixels frame by frame, as "with drawing/without drawing" values, to tell a defect in the
 * drawing from one in the ground under it.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { serveDist } from './serve.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
const phone = process.argv.includes('--phone');
const [w, h] = arg('size', phone ? '390x844' : '1440x900').split('x').map(Number);
const at = Number(arg('at', '0.8'));
const speed = Number(arg('speed', '0.07'));
const frames = Number(arg('frames', '24'));
const sceneT = Number(arg('t', '5'));
const hide = arg('hide', '').split(',').filter(Boolean);
const groundDepth = arg('ground-depth', 'on');
const probe = Number(arg('probe', '0'));
const route = arg('route', '/lab/altitude/');
const dist = arg('dist', 'dist');
const port = Number(arg('port', '4322'));
const label = arg('label', `${phone ? 'phone' : `${w}x${h}`}${hide.length ? `-no-${hide.join('-')}` : ''}${groundDepth === 'off' ? '-nogd' : ''}`);
const OUT = '.screenshots/web-05/shimmer';
await mkdir(OUT, { recursive: true });

const server = await serveDist(port, resolve(dist));
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({
    viewport: { width: w, height: h },
    deviceScaleFactor: phone ? 3 : 1,
    isMobile: phone,
    hasTouch: phone,
  });
  page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
  // Phones start on the mid tier (guessTier); desktops on high.
  await page.goto(`http://127.0.0.1:${port}${route}?capture=1&q=${phone ? 'mid' : 'high'}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__altReady, null, { timeout: 300000 });
  const result = await page.evaluate(
    async ({ at, speed, frames, sceneT, hide, groundDepth, probe }) => {
      const e = window.__alt.engine;
      // Clouds off: this measures the drawing, and the cloud buffer's own temporal noise
      // would otherwise swamp it.
      e.clouds.render = () => {};
      e.composite.uniforms.uCloudsOn.value = 0;
      const bp = e.scene;
      const parts = Object.fromEntries(
        bp.group.children.map((c) => [c.userData.part ?? c.name, c]),
      );
      for (const name of hide) if (parts[name]) parts[name].visible = false;
      if (groundDepth === 'off') e.ground.group.children[0].material.depthWrite = false;
      let show = true;
      const update = bp.update.bind(bp);
      bp.update = (t, c) => {
        update(t, c);
        bp.group.visible = show;
      };
      const gl = e.renderer.getContext();
      const W = gl.drawingBufferWidth;
      const H = gl.drawingBufferHeight;
      const px = new Uint8Array(W * H * 4);
      const lum = () => {
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const out = new Float32Array(W * H);
        for (let i = 0; i < W * H; i++) out[i] = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
        return out;
      };
      // Degrees per drawing-buffer pixel, horizontally and vertically.
      const vfov = e.camera.fov;
      const hfov = (2 * Math.atan(Math.tan((vfov * Math.PI) / 360) * e.camera.aspect) * 180) / Math.PI;
      const degX = hfov / W;
      const degY = vfov / H;
      const render = (i, on) => {
        show = on;
        e.drift.yaw = i * speed * degX;
        e.drift.pitch = i * speed * degY;
        e.renderAt(at, sceneT, 1, 0);
        return lum();
      };
      const heat = new Float32Array(W * H);
      const ink = new Float32Array(W * H);
      const hist = [];
      let sumS = 0;
      let sumD = 0;
      let pops = 0;
      let inkPx = 0;
      for (let i = 0; i < frames; i++) {
        const a = render(i, true);
        const b = render(i, false);
        const d = new Float32Array(W * H);
        for (let k = 0; k < d.length; k++) d[k] = a[k] - b[k];
        hist.push(d);
        if (hist.length > 3) hist.shift();
        if (hist.length === 3) {
          const [d0, d1, d2] = hist;
          for (let k = 0; k < d1.length; k++) {
            // Dither moves pixels by about one level; ignore anything that small.
            const s = Math.abs(d2[k] - 2 * d1[k] + d0[k]);
            const m = Math.max(Math.abs(d0[k]), Math.abs(d1[k]), Math.abs(d2[k]));
            if (m < 3) continue;
            sumS += s;
            sumD += Math.abs(d1[k]);
            heat[k] += s;
            ink[k] = Math.max(ink[k], m);
            if (s > 40) pops++;
          }
        }
      }
      for (let k = 0; k < ink.length; k++) if (ink[k] >= 3) inkPx++;
      // Probe: the worst pixels' values frame by frame, from a second, identical pass.
      const probes = [];
      if (probe > 0) {
        const order = Array.from(heat.keys()).sort((a, b) => heat[b] - heat[a]);
        const picked = [];
        for (const k of order) {
          if (picked.length >= probe) break;
          const x = k % W;
          const y = Math.floor(k / W);
          if (picked.every((j) => Math.abs((j % W) - x) + Math.abs(Math.floor(j / W) - y) > 40)) picked.push(k);
        }
        const series = picked.map(() => []);
        for (let i = 0; i < frames; i++) {
          const a = render(i, true);
          const b = render(i, false);
          picked.forEach((k, j) => series[j].push(`${Math.round(a[k])}/${Math.round(b[k])}`));
        }
        picked.forEach((k, j) => probes.push({ x: k % W, y: H - 1 - Math.floor(k / W), d: series[j].join(' ') }));
      }
      // Heat map: flicker in amber over the drawing's ink in grey.
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(W, H);
      const steps = frames - 2;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const k = (H - 1 - y) * W + x;
          const o = (y * W + x) * 4;
          const f = Math.min(1, heat[k] / steps / 40);
          const g = Math.min(255, ink[k]) * 0.35;
          img.data[o] = g + (255 - g) * f;
          img.data[o + 1] = g + (165 - g) * f;
          img.data[o + 2] = g * (1 - f);
          img.data[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      return {
        W,
        H,
        score: sumS / Math.max(sumD, 1),
        popsPerFrame: pops / steps,
        inkPx,
        heat: c.toDataURL('image/png'),
        probes,
      };
    },
    { at, speed, frames, sceneT, hide, groundDepth, probe },
  );
  await writeFile(`${OUT}/${label}-heat.png`, Buffer.from(result.heat.split(',')[1], 'base64'));
  console.log(
    JSON.stringify({
      label,
      buffer: `${result.W}x${result.H}`,
      score: Number(result.score.toFixed(4)),
      popsPerFrame: Number(result.popsPerFrame.toFixed(1)),
      inkPx: result.inkPx,
    }),
  );
  for (const p of result.probes) console.log(`  (${p.x}, ${p.y} from top-left): ${p.d}`);
} finally {
  await browser.close();
  server.close();
}
