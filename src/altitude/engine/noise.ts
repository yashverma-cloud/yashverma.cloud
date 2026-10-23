/**
 * Cloud noise, generated on the GPU at start-up so the page ships no texture files:
 *   shape   64³  Perlin-Worley plus three Worley octaves (the cloud body)
 *   detail  32³  three Worley octaves (erodes the edges)
 *   weather 256² coverage maps for the three layers, and a fourth channel to break tiling
 * All tile seamlessly. Generating them takes a few milliseconds on a phone GPU.
 */
import {
  GLSL3,
  LinearFilter,
  LinearMipmapLinearFilter,
  RawShaderMaterial,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
  WebGL3DRenderTarget,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { COMMON, HEADER } from './glsl';
import { FullscreenPass, FULLSCREEN_VERT } from './pass';

const NOISE = /* glsl */ `
float worley(vec3 p, float freq) {
  vec3 q = p * freq;
  ivec3 id = ivec3(floor(q));
  vec3 f = fract(q);
  int n = int(freq);
  float md = 1.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    ivec3 o = ivec3(x, y, z);
    ivec3 c = (id + o + n) % n;
    vec3 r = vec3(o) + hash3(c) - f;
    md = min(md, dot(r, r));
  }
  return 1.0 - saturate(sqrt(md));
}
float gradNoise(vec3 p, float freq) {
  vec3 q = p * freq;
  ivec3 i = ivec3(floor(q));
  vec3 f = fract(q);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  int n = int(freq);
  #define G(ox, oy, oz) dot(normalize(hash3((i + ivec3(ox, oy, oz) + n) % n) * 2.0 - 1.0 + 1e-4), f - vec3(ox, oy, oz))
  float v = mix(
    mix(mix(G(0, 0, 0), G(1, 0, 0), u.x), mix(G(0, 1, 0), G(1, 1, 0), u.x), u.y),
    mix(mix(G(0, 0, 1), G(1, 0, 1), u.x), mix(G(0, 1, 1), G(1, 1, 1), u.x), u.y),
    u.z);
  #undef G
  return v;
}
`;

const SHAPE_FRAG = /* glsl */ `
${HEADER}
${COMMON}
${NOISE}
uniform float uSlice;
uniform float uSize;
out vec4 oColor;
void main() {
  vec3 p = vec3(gl_FragCoord.xy, uSlice + 0.5) / uSize;
  float w4 = worley(p, 4.0);
  float w8 = worley(p, 8.0);
  float w16 = worley(p, 16.0);
  float w32 = worley(p, 32.0);
  float perlin = gradNoise(p, 4.0) * 0.5 + gradNoise(p, 8.0) * 0.25 + gradNoise(p, 16.0) * 0.125;
  perlin = saturate(perlin * 0.9 + 0.5);
  float wfbm = w4 * 0.625 + w8 * 0.25 + w16 * 0.125;
  float pw = saturate(remap(perlin, 0.0, 1.0, wfbm, 1.0));
  oColor = vec4(pw, wfbm, w8 * 0.625 + w16 * 0.25 + w32 * 0.125, w16 * 0.75 + w32 * 0.25);
}
`;

const DETAIL_FRAG = /* glsl */ `
${HEADER}
${COMMON}
${NOISE}
uniform float uSlice;
uniform float uSize;
out vec4 oColor;
void main() {
  vec3 p = vec3(gl_FragCoord.xy, uSlice + 0.5) / uSize;
  float w2 = worley(p, 2.0);
  float w4 = worley(p, 4.0);
  float w8 = worley(p, 8.0);
  float w16 = worley(p, 16.0);
  oColor = vec4(w2 * 0.625 + w4 * 0.25 + w8 * 0.125, w4 * 0.625 + w8 * 0.25 + w16 * 0.125, w8 * 0.75 + w16 * 0.25, 1.0);
}
`;

const WEATHER_FRAG = /* glsl */ `
${HEADER}
${COMMON}
${NOISE}
uniform float uSize;
out vec4 oColor;
float fbm2(vec2 p, float f0, float seed) {
  vec3 q = vec3(p, fract(seed));
  float a = 0.0;
  a += gradNoise(q, f0) * 0.5;
  a += gradNoise(q, f0 * 2.0) * 0.25;
  a += gradNoise(q, f0 * 4.0) * 0.125;
  a += gradNoise(q, f0 * 8.0) * 0.0625;
  return a * 1.1 + 0.5;
}
float cells(vec2 p, float f, float seed) {
  return worley(vec3(p, fract(seed)), f);
}
void main() {
  vec2 p = gl_FragCoord.xy / uSize;
  // Sea: broad coverage with cumulus cells, so the tops read as separate towers.
  float sea = saturate(fbm2(p, 4.0, 0.13) * 0.75 + cells(p, 8.0, 0.31) * 0.45 - 0.05);
  // Deck: a broken layer with long gaps.
  float deck = saturate(fbm2(p, 4.0, 0.57) * 0.8 + cells(p, 16.0, 0.71) * 0.35 - 0.05);
  // Wisps: sparse and ragged.
  float wisp = saturate(fbm2(p, 8.0, 0.91) * 0.9 + cells(p, 16.0, 0.17) * 0.25 - 0.1);
  float var = saturate(fbm2(p, 2.0, 0.43));
  // Sums of octaves bunch around the middle; stretch each map so coverage can actually
  // reach clear sky and full cloud.
  vec4 m = vec4(sea, deck, wisp, var);
  oColor = saturate((m - vec4(0.55, 0.52, 0.46, 0.53)) * vec4(2.7, 2.6, 2.5, 2.4) + 0.5);
}
`;

export interface CloudNoise {
  shape: Texture;
  detail: Texture;
  weather: Texture;
  weatherTarget: WebGLRenderTarget;
  dispose(): void;
}

function generate3D(renderer: WebGLRenderer, size: number, frag: string): WebGL3DRenderTarget {
  const rt = new WebGL3DRenderTarget(size, size, size, {
    format: RGBAFormat,
    type: UnsignedByteType,
    depthBuffer: false,
    generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter,
    magFilter: LinearFilter,
  });
  rt.texture.wrapS = rt.texture.wrapT = rt.texture.wrapR = RepeatWrapping;
  const material = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: frag,
    uniforms: { uSlice: { value: 0 }, uSize: { value: size } },
    depthTest: false,
    depthWrite: false,
  });
  const pass = new FullscreenPass(material);
  for (let z = 0; z < size; z++) {
    material.uniforms.uSlice.value = z;
    pass.render(renderer, rt, z);
  }
  pass.dispose();
  return rt;
}

export function generateCloudNoise(renderer: WebGLRenderer): CloudNoise {
  const previous = renderer.getRenderTarget();
  const shape = generate3D(renderer, 64, SHAPE_FRAG);
  const detail = generate3D(renderer, 32, DETAIL_FRAG);

  const weather = new WebGLRenderTarget(256, 256, {
    format: RGBAFormat,
    type: UnsignedByteType,
    depthBuffer: false,
    generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter,
    magFilter: LinearFilter,
  });
  weather.texture.wrapS = weather.texture.wrapT = RepeatWrapping;
  const material = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: WEATHER_FRAG,
    uniforms: { uSize: { value: 256 } },
    depthTest: false,
    depthWrite: false,
  });
  const pass = new FullscreenPass(material);
  pass.render(renderer, weather);
  pass.dispose();
  renderer.setRenderTarget(previous);

  return {
    shape: shape.texture,
    detail: detail.texture,
    weather: weather.texture,
    weatherTarget: weather,
    dispose() {
      shape.dispose();
      detail.dispose();
      weather.dispose();
    },
  };
}
