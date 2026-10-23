/**
 * Method B: layered noise-textured billboards. Camera-facing quads, one draw call per frame,
 * placed from the same coverage maps as the raymarcher so the two methods show the same sky.
 *
 * Each puff samples a GPU-generated atlas of four cumulus shapes (density, a normal for
 * lighting, and cavity), lit against the same key light, skylight and haze as method A.
 * Blending is back to front, so the instances are kept sorted for the nearest of a set of
 * stations along the flight; re-sorting only happens when the camera passes a station.
 */
import {
  BufferGeometry,
  Float32BufferAttribute,
  GLSL3,
  HalfFloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PerspectiveCamera,
  RawShaderMaterial,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  WebGLRenderTarget,
  CustomBlending,
  AddEquation,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { BREAK, cameraAt, LAYERS, WISP_CLEAR } from '../world';
import { COMMON, HAZE, HEADER } from './glsl';
import { readWeather, type CloudNoise } from './noise';
import { FullscreenPass, FULLSCREEN_VERT } from './pass';
import type { CloudMethod, CloudQuality } from './types';
import { shared } from './uniforms';

const ATLAS_FRAG = /* glsl */ `
${HEADER}
${COMMON}
out vec4 oColor;
vec2 h2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453) * 2.0 - 1.0;
}
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(h2(i), f), dot(h2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
             mix(dot(h2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(h2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  return gnoise(p) * 0.5 + gnoise(p * 2.03 + 1.7) * 0.25 + gnoise(p * 4.1 - 3.1) * 0.125 + gnoise(p * 8.3 + 5.2) * 0.0625;
}
// A cumulus puff as a height field: a union of domes on a flat base, eroded by noise.
float puff(vec2 uv, int k) {
  float h = 0.0;
  for (int i = 0; i < 8; i++) {
    vec3 r = hash3(ivec3(i, k, 11));
    float sx = r.x * 2.0 - 1.0;
    vec2 c = vec2(sx * 0.5, -0.28 + r.y * 0.45 - abs(sx) * 0.28);
    float rad = 0.28 + r.z * 0.3 - abs(sx) * 0.08;
    vec2 d = uv - c;
    float s = rad * rad - dot(d, d);
    if (s > 0.0) h = max(h, sqrt(s) + (c.y + 0.3) * 0.25);
  }
  h *= smoothstep(-0.7, -0.38, uv.y);
  // Erode the outline so the silhouette breaks up into wisps instead of a hard ball.
  h -= (fbm(uv * 4.5 + float(k) * 3.1) * 0.5 + 0.3) * 0.16;
  h -= (fbm(uv * 13.0 - float(k) * 1.7) * 0.5 + 0.5) * 0.05;
  return h;
}
void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 tile = floor(px / 256.0);
  vec2 uv = (fract(px / 256.0) * 2.0 - 1.0) * 1.1;
  int k = int(tile.x + tile.y * 2.0);
  float e = 2.0 / 256.0;
  float h = puff(uv, k);
  float hx = puff(uv + vec2(e, 0.0), k);
  float hy = puff(uv + vec2(0.0, e), k);
  float dens = smoothstep(-0.03, 0.32, h);
  vec3 n = normalize(vec3(-(hx - h) / e, -(hy - h) / e, 2.2));
  oColor = vec4(dens, n.x * 0.5 + 0.5, n.y * 0.5 + 0.5, saturate(h * 2.2));
}
`;

const PUFF_VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iData; // size, tile, rotation, shade
uniform float uTime;
varying vec2 vUv;
varying vec2 vLocal;
varying vec3 vWorld;
varying float vDepth;
varying float vShade;
varying float vHeight;
void main() {
  float size = iData.x;
  float rot = iData.z;
  vec2 corner = position.xy;
  float c = cos(rot);
  float s = sin(rot);
  vec2 rc = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c);
  vec3 center = iPos + vec3(uTime * 6.0, 0.0, uTime * 2.0);
  vec4 view = viewMatrix * vec4(center, 1.0);
  view.xy += rc * size;
  gl_Position = projectionMatrix * view;
  vLocal = corner;
  float t = iData.y;
  vec2 tile = vec2(mod(t, 2.0), floor(t / 2.0));
  vUv = (tile + corner * 0.5 + 0.5) * 0.5;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vWorld = center + right * rc.x * size + up * rc.y * size;
  vDepth = -view.z;
  vShade = iData.w;
  vHeight = rc.y;
}
`;

const PUFF_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uCamPos;
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uAmbTop;
uniform vec3 uAmbBottom;
uniform vec3 uHorizon;
uniform vec3 uSunward;
uniform vec3 uHaze;
uniform vec3 uSunDir;
uniform float uFogDensity;
uniform float uNear;
varying vec2 vUv;
varying vec2 vLocal;
varying vec3 vWorld;
varying float vDepth;
varying float vShade;
varying float vHeight;
float saturate(float x) { return clamp(x, 0.0, 1.0); }
${HAZE}
void main() {
  vec4 t = texture(uAtlas, vUv);
  float dens = t.r;
  if (dens < 0.01) discard;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 toCam = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  vec2 nl = t.gb * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nl, nl), 0.0));
  vec3 n = normalize(right * nl.x + up * nl.y + toCam * nz);
  vec3 rd = normalize(vWorld - uCamPos);
  float ndl = dot(n, uKeyDir);
  // Wrapped diffuse for the body, and forward scattering through the thin edges.
  float diffuse = mix(0.6, saturate(ndl * 0.5 + 0.5), 0.55);
  // Forward scattering through thin edges, only for puffs the camera looks down on.
  float above = smoothstep(-0.05, 0.25, uCamPos.y - vWorld.y);
  float edge = (1.0 - dens) * pow(saturate(dot(rd, uKeyDir)), 6.0) * above;
  float cavity = mix(0.65, 1.0, t.a);
  vec3 sun = uKeyCol * (diffuse * 0.3 + edge * 0.6) * cavity * vShade;
  vec3 amb = mix(uAmbBottom, uAmbTop, saturate(0.5 + vHeight * 0.45 + n.y * 0.2)) * mix(0.75, 1.0, t.a);
  vec3 col = sun + amb;
  float fog = 1.0 - exp(-vDepth * uFogDensity);
  col = mix(col, hazeColor0(rd), fog);
  // Fade a puff out as the camera reaches it, so flying through a layer is a soft whiteout.
  float a = dens * smoothstep(uNear * 0.3, uNear, vDepth) * 0.78;
  gl_FragColor = vec4(col * a, a);
}
`;

interface Puff {
  x: number;
  y: number;
  z: number;
  size: number;
  tile: number;
  rot: number;
  shade: number;
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class BillboardClouds implements CloudMethod {
  readonly name = 'billboard' as const;
  private readonly target: WebGLRenderTarget;
  private readonly atlas: WebGLRenderTarget;
  private readonly scene = new Scene();
  private readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly geometry: InstancedBufferGeometry;
  private readonly puffs: Puff[];
  private readonly stations: Vector3[];
  private readonly orders: (Uint32Array | null)[];
  private station = -1;
  private quality: CloudQuality;
  private low = { w: 1, h: 1 };
  private full = { w: 1, h: 1 };
  private readonly camera: PerspectiveCamera;

  constructor(renderer: WebGLRenderer, noise: CloudNoise, quality: CloudQuality, camera?: PerspectiveCamera) {
    this.quality = quality;
    this.camera = camera ?? new PerspectiveCamera();
    this.atlas = new WebGLRenderTarget(512, 512, {
      format: RGBAFormat,
      type: UnsignedByteType,
      depthBuffer: false,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
    });
    const gen = new FullscreenPass(
      new RawShaderMaterial({ glslVersion: GLSL3, vertexShader: FULLSCREEN_VERT, fragmentShader: ATLAS_FRAG, depthTest: false, depthWrite: false }),
    );
    const prev = renderer.getRenderTarget();
    gen.render(renderer, this.atlas);
    gen.dispose();
    renderer.setRenderTarget(prev);

    this.puffs = this.place(readWeather(renderer, noise));

    const quad = new BufferGeometry();
    quad.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    this.geometry = new InstancedBufferGeometry();
    this.geometry.setAttribute('position', quad.getAttribute('position'));
    const n = this.puffs.length;
    this.geometry.setAttribute('iPos', new InstancedBufferAttribute(new Float32Array(n * 3), 3));
    this.geometry.setAttribute('iData', new InstancedBufferAttribute(new Float32Array(n * 4), 4));
    this.geometry.instanceCount = n;

    this.material = new ShaderMaterial({
      vertexShader: PUFF_VERT,
      fragmentShader: PUFF_FRAG,
      uniforms: {
        uAtlas: { value: this.atlas.texture },
        uTime: shared.uTime,
        uCamPos: shared.uCamPos,
        uKeyDir: shared.uKeyDir,
        uKeyCol: shared.uKeyCol,
        uAmbTop: shared.uAmbTop,
        uAmbBottom: shared.uAmbBottom,
        uHorizon: shared.uHorizon,
        uSunward: shared.uSunward,
        uHaze: shared.uHaze,
        uSunDir: shared.uSunDir,
        uFogDensity: shared.uFogDensity,
        uNear: { value: 220 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneMinusSrcAlphaFactor,
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    // Sort stations: points along the flight where the draw order is precomputed.
    this.stations = [];
    for (let i = 0; i <= 24; i++) {
      const c = cameraAt(i / 24, 'landscape');
      this.stations.push(new Vector3(...c.pos));
    }
    this.orders = this.stations.map(() => null);

    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      format: RGBAFormat,
      depthBuffer: false,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
    });
  }

  /** Places puffs where the coverage maps say there is cloud, nearer and finer along the flight. */
  private place(weather: Uint8Array): Puff[] {
    const rand = rng(4111);
    const sample = (x: number, z: number, period: number, ch: number) => {
      // Bilinear lookup into the 256² map, wrapping like the GPU's repeat mode.
      const u = ((((x / period) % 1) + 1) % 1) * 256 - 0.5;
      const v = ((((z / period) % 1) + 1) % 1) * 256 - 0.5;
      const x0 = Math.floor(u);
      const y0 = Math.floor(v);
      const fx = u - x0;
      const fy = v - y0;
      const at = (i: number, j: number) => weather[((((j % 256) + 256) % 256) * 256 + (((i % 256) + 256) % 256)) * 4 + ch] / 255;
      return (
        at(x0, y0) * (1 - fx) * (1 - fy) +
        at(x0 + 1, y0) * fx * (1 - fy) +
        at(x0, y0 + 1) * (1 - fx) * fy +
        at(x0 + 1, y0 + 1) * fx * fy
      );
    };
    const puffs: Puff[] = [];
    const regions = [
      // Sea: fine near the flight, coarse to the horizon.
      { L: 0, x0: -9000, x1: 9000, z0: -4000, z1: 14000, cell: 900, size: [520, 900] },
      { L: 0, x0: -34000, x1: 34000, z0: -42000, z1: -4000, cell: 2600, size: [1500, 2600] },
      { L: 0, x0: -34000, x1: -9000, z0: -4000, z1: 14000, cell: 2600, size: [1500, 2600] },
      { L: 0, x0: 9000, x1: 34000, z0: -4000, z1: 14000, cell: 2600, size: [1500, 2600] },
      // Deck.
      { L: 1, x0: -9000, x1: 9000, z0: -9000, z1: 6000, cell: 520, size: [260, 520] },
      { L: 1, x0: -26000, x1: 26000, z0: -34000, z1: -9000, cell: 2200, size: [900, 1700] },
      // Wisps, near the drawing only.
      { L: 2, x0: -2600, x1: 2600, z0: -2600, z1: 2600, cell: 260, size: [110, 240] },
    ];
    for (const r of regions) {
      const layer = LAYERS[r.L];
      const ch = r.L === 0 ? 0 : r.L === 1 ? 1 : 2;
      for (let x = r.x0; x < r.x1; x += r.cell) {
        for (let z = r.z0; z < r.z1; z += r.cell) {
          const cx = x + rand() * r.cell;
          const cz = z + rand() * r.cell;
          const wv = sample(cx, cz, layer.weatherPeriod, ch);
          let cov = smooth(1 - layer.coverage - 0.2, 1 - layer.coverage + 0.25, wv);
          if (r.L === 1) {
            const rr = Math.hypot(cx - BREAK.x, cz - BREAK.z) + (sample(cx, cz, layer.weatherPeriod, 3) - 0.5) * 520;
            cov *= smooth(BREAK.radius, BREAK.radius + BREAK.feather, rr);
          } else if (r.L === 2) {
            const rr = Math.hypot(cx - WISP_CLEAR.x, cz - WISP_CLEAR.z) + (sample(cx, cz, layer.weatherPeriod, 3) - 0.5) * 300;
            cov *= smooth(WISP_CLEAR.radius, WISP_CLEAR.radius + WISP_CLEAR.feather, rr);
          }
          if (cov < 0.22) continue;
          const tall = smooth(0.08, 0.95, wv);
          const thick = layer.top - layer.bottom;
          const top = layer.bottom + thick * (0.34 + 0.66 * tall);
          const count = r.L === 2 ? 1 + Math.floor(rand() * 2) : 2 + Math.floor(cov * 3.5);
          for (let k = 0; k < count; k++) {
            const size = (r.size[0] + rand() * (r.size[1] - r.size[0])) * (0.8 + cov * 0.6);
            puffs.push({
              x: cx + (rand() - 0.5) * r.cell * 0.9,
              y: layer.bottom + (top - layer.bottom) * (0.35 + rand() * 0.55),
              z: cz + (rand() - 0.5) * r.cell * 0.9,
              size,
              tile: Math.floor(rand() * 4),
              rot: (rand() - 0.5) * 0.5,
              shade: 0.75 + tall * 0.35,
            });
          }
        }
      }
    }
    return puffs;
  }

  private sortFor(i: number): Uint32Array {
    const cached = this.orders[i];
    if (cached) return cached;
    const s = this.stations[i];
    const d = new Float32Array(this.puffs.length);
    this.puffs.forEach((p, k) => {
      d[k] = (p.x - s.x) ** 2 + (p.y - s.y) ** 2 + (p.z - s.z) ** 2;
    });
    const order = new Uint32Array(this.puffs.length).map((_, k) => k);
    order.sort((a, b) => d[b] - d[a]);
    this.orders[i] = order;
    return order;
  }

  private upload(order: Uint32Array): void {
    const pos = this.geometry.getAttribute('iPos') as InstancedBufferAttribute;
    const data = this.geometry.getAttribute('iData') as InstancedBufferAttribute;
    const P = pos.array as Float32Array;
    const D = data.array as Float32Array;
    for (let k = 0; k < order.length; k++) {
      const p = this.puffs[order[k]];
      P[k * 3] = p.x;
      P[k * 3 + 1] = p.y;
      P[k * 3 + 2] = p.z;
      D[k * 4] = p.size;
      D[k * 4 + 1] = p.tile;
      D[k * 4 + 2] = p.rot;
      D[k * 4 + 3] = p.shade;
    }
    pos.needsUpdate = true;
    data.needsUpdate = true;
  }

  get texture(): Texture {
    return this.target.texture;
  }

  get resolution(): { w: number; h: number } {
    return this.low;
  }

  get count(): number {
    return this.puffs.length;
  }

  setQuality(q: CloudQuality): void {
    const rescale = q.scale !== this.quality.scale;
    this.quality = q;
    if (rescale) this.resize(this.full.w, this.full.h);
  }

  resize(width: number, height: number): void {
    this.full = { w: width, h: height };
    // Billboards have hard silhouettes next to the raymarcher's soft ones; give them more pixels.
    const s = Math.min(1, this.quality.scale * 1.35);
    this.low = { w: Math.max(1, Math.round(width * s)), h: Math.max(1, Math.round(height * s)) };
    this.target.setSize(this.low.w, this.low.h);
  }

  reset(): void {}

  render(renderer: WebGLRenderer): void {
    const cam = this.camera;
    // Nearest sort station; reorder only when it changes.
    let best = 0;
    let bestD = Infinity;
    this.stations.forEach((s, i) => {
      const d = s.distanceToSquared(cam.position);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best !== this.station) {
      this.upload(this.sortFor(best));
      this.station = best;
    }
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.render(this.scene, cam);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.atlas.dispose();
    this.target.dispose();
  }
}
