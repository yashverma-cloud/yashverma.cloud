/**
 * Method A: raymarched volumetric clouds, after Schneider's Nubis and Hillaire's
 * physically based clouds, cut down for phones.
 *
 * Cost control, in order of effect:
 *   1. The march runs at a fraction of the drawing buffer (`scale`).
 *   2. Temporal upscaling: with `interleave` 2, each frame marches one pixel in four, in a
 *      rotating 2×2 pattern; the other three are reprojected from the previous frame. That
 *      is four times fewer rays for a picture that converges in four frames.
 *   3. Interleaved gradient noise jitters every ray's start; the accumulation turns the
 *      jitter into smooth gradients instead of banding.
 *   4. Steps are spread by distance, light samples are few and cheap, detail erosion is
 *      skipped where the cloud is already dense or far away.
 */
import {
  GLSL3,
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  RawShaderMaterial,
  RGBAFormat,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { COMMON, HAZE, HEADER } from './glsl';
import type { CloudNoise } from './noise';
import { FullscreenPass, FULLSCREEN_VERT } from './pass';
import { shared } from './uniforms';
import type { CloudMethod, CloudQuality } from './types';

const DENSITY = /* glsl */ `
uniform sampler3D uShape;
uniform sampler3D uDetail;
uniform sampler2D uWeather;
uniform vec4 uGeo[3];
uniform vec4 uShp[3];
uniform vec4 uBreak;
uniform vec4 uWispClear;
uniform float uTime;
uniform float uDetailOn;

float heightProfile(float h, float type, float tall) {
  // The weather value raises or lowers the tops, so a covered sea still forms domes over
  // the coverage cells instead of a flat lid. Flat bases, rounded tops.
  float topEff = mix(0.34, 1.0, tall);
  float hr = h / topEff;
  if (hr >= 1.0) return 0.0;
  float base = saturate(remap(h, 0.0, mix(0.05, 0.14, type), 0.0, 1.0));
  float top = saturate(remap(hr, mix(0.3, 0.5, type), 1.0, 1.0, 0.0));
  return base * pow(top, 0.6);
}

// x: coverage, y: how tall the cloud stands there.
vec2 coverageAt(vec2 xz, int L) {
  vec2 wind = vec2(uTime * 3.0, uTime * 1.2) * float(3 - L);
  vec4 w = textureLod(uWeather, (xz + wind) * uShp[L].w, 0.0);
  float c = L == 0 ? w.r : (L == 1 ? w.g : w.b);
  float cov = uGeo[L].z;
  float k = smoothstep(1.0 - cov - 0.2, 1.0 - cov + 0.25, c);
  if (L == 1) {
    float r = length(xz - uBreak.xy) + (w.a - 0.5) * 520.0;
    k *= smoothstep(uBreak.z, uBreak.z + uBreak.w, r);
  } else if (L == 2) {
    float r = length(xz - uWispClear.xy) + (w.a - 0.5) * 300.0;
    k *= smoothstep(uWispClear.z, uWispClear.z + uWispClear.w, r);
  }
  return vec2(k, smoothstep(0.08, 0.95, c));
}

float density(vec3 p, int L, float lod, bool cheap) {
  vec4 g = uGeo[L];
  float h = (p.y - g.x) / (g.y - g.x);
  if (h <= 0.0 || h >= 1.0) return 0.0;
  vec2 ct = coverageAt(p.xz, L);
  float cov = ct.x;
  if (cov <= 0.01) return 0.0;
  vec4 s = uShp[L];
  vec3 wind = vec3(uTime * 6.0, 0.0, uTime * 2.0);
  vec4 n = textureLod(uShape, (p + wind) * s.x, lod);
  float fbm = n.g * 0.625 + n.b * 0.25 + n.a * 0.125;
  float body = remap(n.r, -(1.0 - fbm), 1.0, 0.0, 1.0);
  body *= heightProfile(h, s.z, ct.y);
  body = saturate(remap(body, 1.0 - cov, 1.0, 0.0, 1.0)) * cov;
  if (body <= 0.0) return 0.0;
  if (!cheap && uDetailOn > 0.5 && body < 0.85) {
    vec3 d = textureLod(uDetail, (p + wind * 1.6) * s.y, lod).rgb;
    float dfbm = d.r * 0.625 + d.g * 0.25 + d.b * 0.125;
    // Wispy at the base, billowed at the top.
    float erode = mix(dfbm, 1.0 - dfbm, saturate(h * 5.0));
    body = saturate(remap(body, erode * 0.52, 1.0, 0.0, 1.0));
  }
  return body * g.w;
}
`;

const MARCH_FRAG = /* glsl */ `
${HEADER}
${COMMON}
uniform vec3 uHorizon;
uniform vec3 uSunward;
uniform vec3 uHaze;
uniform vec3 uSunDir;
${HAZE}
${DENSITY}
uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
uniform vec2 uLowRes;
uniform ivec2 uOffset;
uniform int uInterleave;
uniform float uFrame;
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uAmbTop;
uniform vec3 uAmbBottom;
uniform int uSteps;
uniform int uLightSteps;
uniform float uMaxDist;
uniform float uFogDensity;

layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oDepth;

float hg(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5));
}
float phase(float c, float k) {
  return mix(hg(c, 0.72 * k), hg(c, -0.22 * k), 0.3);
}

float lightDepth(vec3 p, int L, float lod) {
  float thick = uGeo[L].y - uGeo[L].x;
  float stepLen = thick * 0.08;
  float od = 0.0;
  float t = 0.0;
  for (int j = 0; j < 6; j++) {
    if (j >= uLightSteps) break;
    float dt = stepLen * (1.0 + float(j) * 0.9);
    t += dt;
    od += density(p + uKeyDir * (t - dt * 0.5), L, lod + 1.0, true) * dt;
  }
  return od;
}

vec2 slab(vec3 ro, vec3 rd, float y0, float y1) {
  if (abs(rd.y) < 1e-5) {
    return (ro.y > y0 && ro.y < y1) ? vec2(0.0, 1e9) : vec2(1.0, 0.0);
  }
  float a = (y0 - ro.y) / rd.y;
  float b = (y1 - ro.y) / rd.y;
  return vec2(max(min(a, b), 0.0), max(a, b));
}

void main() {
  ivec2 q = ivec2(gl_FragCoord.xy);
  ivec2 pix = q * uInterleave + uOffset;
  vec2 uv = (vec2(pix) + 0.5) / uLowRes;
  vec4 w = uInvViewProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize(w.xyz / w.w - uCamPos);
  vec3 ro = uCamPos;
  float jitter = ign(vec2(pix), uFrame);

  float tGround = rd.y < 0.0 ? -ro.y / rd.y : 1e9;
  float tMax = min(uMaxDist, tGround);
  float cosTheta = dot(rd, uKeyDir);
  vec3 scat = vec3(0.0);
  float T = 1.0;
  float depthSum = 0.0;
  float weightSum = 0.0;
  // Angular size of one low-res pixel, for texture level of detail along the ray.
  float pixelAngle = 1.6 / uLowRes.y;

  // Layers are disjoint slabs; visit them nearest first.
  int order[3];
  if (rd.y < 0.0) { order[0] = 0; order[1] = 1; order[2] = 2; }
  else { order[0] = 2; order[1] = 1; order[2] = 0; }

  for (int k = 0; k < 3; k++) {
    int L = order[k];
    vec2 span = slab(ro, rd, uGeo[L].x, uGeo[L].y);
    span.y = min(span.y, tMax);
    if (span.y <= span.x || T < 0.02) continue;
    float len = span.y - span.x;
    bool inside = span.x <= 0.0;
    float thick = uGeo[L].y - uGeo[L].x;
    int n = int(clamp(len / (thick * 0.035), 6.0, float(uSteps)));
    float invN = 1.0 / float(n);
    for (int i = 0; i < 96; i++) {
      if (i >= n || T < 0.02) break;
      float s0 = (float(i) + jitter) * invN;
      float s1 = s0 + invN;
      // From inside a layer, crowd samples near the eye; from outside, spread them evenly.
      float t0 = span.x + len * (inside ? s0 * s0 : s0);
      float t1 = span.x + len * (inside ? s1 * s1 : s1);
      float dt = t1 - t0;
      vec3 p = ro + rd * t0;
      float lod = clamp(log2(max(t0 * pixelAngle * uShp[L].x * 64.0, 1.0)), 0.0, 5.0);
      float d = density(p, L, lod, false);
      if (d <= 0.0) continue;
      float h = saturate((p.y - uGeo[L].x) / thick);
      float od = lightDepth(p, L, lod);
      // Two octaves of approximate multiple scattering keep the cores from going grey.
      vec3 sun = uKeyCol * (exp(-od) * phase(cosTheta, 1.0) + 0.45 * exp(-od * 0.3) * phase(cosTheta, 0.5));
      // Schneider's 'powder': thin, sunward edges darken, which gives the tops their form.
      sun *= mix(1.0, 1.0 - exp(-od * 2.0), 0.7);
      // Light scattered many times inside the cloud: what makes a cloud's interior glow.
      sun += uKeyCol * 0.035 * (0.3 + 0.7 * h);
      // Skylight barely dims inside a cloud: diffuse light is everywhere in there.
      vec3 amb = mix(uAmbBottom, uAmbTop, pow(h, 0.7)) * (0.55 + 0.45 * exp(-od * 0.08));
      vec3 S = (sun * 4.0 * PI * 0.25 + amb) * d;
      float Ts = exp(-d * dt);
      scat += T * (S - S * Ts) / max(d, 1e-6);
      depthSum += t0 * T * (1.0 - Ts);
      weightSum += T * (1.0 - Ts);
      T *= Ts;
    }
  }

  float meanDepth = weightSum > 1e-4 ? depthSum / weightSum : tMax;
  float fog = 1.0 - exp(-meanDepth * uFogDensity);
  scat = mix(scat, hazeColor0(rd) * (1.0 - T), fog);
  oColor = vec4(scat, 1.0 - T);
  oDepth = vec4(min(meanDepth, uMaxDist), 0.0, 0.0, 1.0);
}
`;

const RESOLVE_FRAG = /* glsl */ `
${HEADER}
uniform sampler2D uNew;
uniform sampler2D uNewDepth;
uniform sampler2D uHist;
uniform sampler2D uHistDepth;
uniform mat4 uInvViewProj;
uniform mat4 uPrevViewProj;
uniform vec3 uCamPos;
uniform vec2 uLowRes;
uniform vec2 uNewRes;
uniform ivec2 uOffset;
uniform int uInterleave;
uniform float uHistoryValid;
uniform float uFreshBlend;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oDepth;

void main() {
  ivec2 pix = ivec2(gl_FragCoord.xy);
  ivec2 q = pix / uInterleave;
  ivec2 qMax = ivec2(uNewRes) - 1;
  bool fresh = uInterleave == 1 || all(equal(pix - q * uInterleave, uOffset));

  vec4 cur;
  float curDepth;
  if (fresh) {
    cur = texelFetch(uNew, min(q, qMax), 0);
    curDepth = texelFetch(uNewDepth, min(q, qMax), 0).r;
  } else {
    // This frame's marched samples sit at q * 2 + offset; interpolate between them.
    vec2 sp = (vec2(pix) - vec2(uOffset)) / float(uInterleave) + 0.5;
    cur = texture(uNew, sp / uNewRes);
    curDepth = texture(uNewDepth, sp / uNewRes).r;
  }

  vec4 lo = cur;
  vec4 hi = cur;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec4 c = texelFetch(uNew, clamp(q + ivec2(x, y), ivec2(0), qMax), 0);
    lo = min(lo, c);
    hi = max(hi, c);
  }

  vec2 uv = (vec2(pix) + 0.5) / uLowRes;
  vec4 w = uInvViewProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize(w.xyz / w.w - uCamPos);
  vec4 prev = uPrevViewProj * vec4(uCamPos + rd * curDepth, 1.0);
  vec2 puv = prev.xy / prev.w * 0.5 + 0.5;
  bool onScreen = prev.w > 0.0 && all(greaterThanEqual(puv, vec2(0.0))) && all(lessThanEqual(puv, vec2(1.0)));

  vec4 outc = cur;
  if (uHistoryValid > 0.5 && onScreen) {
    vec4 hist = texture(uHist, puv);
    float spread = fresh ? 0.02 : 0.06;
    hist = clamp(hist, lo - spread, hi + spread);
    outc = mix(hist, cur, fresh ? uFreshBlend : 0.12);
  }
  oColor = outc;
  oDepth = vec4(curDepth, 0.0, 0.0, 1.0);
}
`;

function target(w: number, h: number, filter: typeof LinearFilter | typeof NearestFilter): WebGLRenderTarget {
  const rt = new WebGLRenderTarget(w, h, {
    count: 2,
    type: HalfFloatType,
    format: RGBAFormat,
    depthBuffer: false,
    minFilter: filter,
    magFilter: filter,
  });
  return rt;
}

export class RaymarchClouds implements CloudMethod {
  readonly name = 'raymarch' as const;
  private march: FullscreenPass;
  private resolve: FullscreenPass;
  private samples: WebGLRenderTarget;
  private history: [WebGLRenderTarget, WebGLRenderTarget];
  private current = 0;
  private quality: CloudQuality;
  private full = { w: 1, h: 1 };
  private low = { w: 1, h: 1 };
  private historyValid = false;
  private tick = 0;

  constructor(noise: CloudNoise, quality: CloudQuality) {
    this.quality = quality;
    const common = {
      uShape: { value: noise.shape },
      uDetail: { value: noise.detail },
      uWeather: { value: noise.weather },
    };
    this.march = new FullscreenPass(
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: FULLSCREEN_VERT,
        fragmentShader: MARCH_FRAG,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          ...common,
          uGeo: shared.uGeo,
          uShp: shared.uShp,
          uBreak: shared.uBreak,
          uWispClear: shared.uWispClear,
          uTime: shared.uTime,
          uFrame: shared.uFrame,
          uInvViewProj: shared.uInvViewProj,
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
          uDetailOn: { value: 1 },
          uLowRes: { value: [1, 1] },
          uOffset: { value: [0, 0] },
          uInterleave: { value: 1 },
          uSteps: { value: 48 },
          uLightSteps: { value: 4 },
          uMaxDist: { value: 42000 },
        },
      }),
    );
    this.resolve = new FullscreenPass(
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: FULLSCREEN_VERT,
        fragmentShader: RESOLVE_FRAG,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uNew: { value: null },
          uNewDepth: { value: null },
          uHist: { value: null },
          uHistDepth: { value: null },
          uInvViewProj: shared.uInvViewProj,
          uPrevViewProj: shared.uPrevViewProj,
          uCamPos: shared.uCamPos,
          uLowRes: { value: [1, 1] },
          uNewRes: { value: [1, 1] },
          uOffset: { value: [0, 0] },
          uInterleave: { value: 1 },
          uHistoryValid: { value: 0 },
          uFreshBlend: { value: 0.3 },
        },
      }),
    );
    this.samples = target(1, 1, LinearFilter);
    this.history = [target(1, 1, LinearFilter), target(1, 1, LinearFilter)];
  }

  get texture(): Texture {
    return this.history[this.current].textures[0];
  }

  get resolution(): { w: number; h: number } {
    return this.low;
  }

  setQuality(q: CloudQuality): void {
    const rescale = q.scale !== this.quality.scale || q.interleave !== this.quality.interleave;
    this.quality = q;
    if (rescale) this.resize(this.full.w, this.full.h);
  }

  resize(width: number, height: number): void {
    this.full = { w: width, h: height };
    const s = this.quality.scale;
    const i = this.quality.interleave;
    // Keep the low-res size a multiple of the interleave so the 2×2 pattern tiles exactly.
    const lw = Math.max(i, Math.round((width * s) / i) * i);
    const lh = Math.max(i, Math.round((height * s) / i) * i);
    this.low = { w: lw, h: lh };
    this.samples.setSize(lw / i, lh / i);
    this.history[0].setSize(lw, lh);
    this.history[1].setSize(lw, lh);
    this.historyValid = false;
  }

  reset(): void {
    this.historyValid = false;
  }

  render(renderer: WebGLRenderer): void {
    const q = this.quality;
    const i = q.interleave;
    // Bayer order visits all four pixels of the block before repeating.
    const pattern: [number, number][] = [
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 1],
    ];
    const offset = i === 2 ? pattern[this.tick % 4] : [0, 0];
    this.tick++;

    const mu = (this.march.material as RawShaderMaterial).uniforms;
    mu.uLowRes.value = [this.low.w, this.low.h];
    mu.uOffset.value = offset;
    mu.uInterleave.value = i;
    mu.uSteps.value = q.steps;
    mu.uLightSteps.value = q.lightSteps;
    mu.uDetailOn.value = q.detail ? 1 : 0;
    this.march.render(renderer, this.samples);

    const prev = this.history[this.current];
    const next = this.history[1 - this.current];
    const ru = (this.resolve.material as RawShaderMaterial).uniforms;
    ru.uNew.value = this.samples.textures[0];
    ru.uNewDepth.value = this.samples.textures[1];
    ru.uHist.value = prev.textures[0];
    ru.uHistDepth.value = prev.textures[1];
    ru.uLowRes.value = [this.low.w, this.low.h];
    ru.uNewRes.value = [this.low.w / i, this.low.h / i];
    ru.uOffset.value = offset;
    ru.uInterleave.value = i;
    ru.uHistoryValid.value = this.historyValid ? 1 : 0;
    ru.uFreshBlend.value = q.freshBlend;
    this.resolve.render(renderer, next);
    this.current = 1 - this.current;
    this.historyValid = true;
  }

  dispose(): void {
    this.march.dispose();
    this.resolve.dispose();
    this.samples.dispose();
    this.history[0].dispose();
    this.history[1].dispose();
  }
}
