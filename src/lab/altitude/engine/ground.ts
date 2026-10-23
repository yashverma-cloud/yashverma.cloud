/**
 * The ground under the clouds, drawn as a survey sheet: contour lines of a gentle terrain
 * that flattens into a plateau for the site, and a site grid on the plateau. Contours are
 * the cartographer's altitude markers, so the drawing language holds all the way down.
 * Plus the stars, which fade as the dawn comes up.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
} from 'three';
import { HAZE } from './glsl';
import { shared } from './uniforms';

const GROUND_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const GROUND_FRAG = /* glsl */ `
uniform vec3 uCamPos;
uniform vec3 uGround;
uniform vec3 uHaze;
uniform vec3 uHorizon;
uniform vec3 uSunward;
uniform vec3 uSunDir;
uniform float uFogDensity;
uniform float uMapOn;
uniform vec4 uSite;
varying vec3 vWorld;
${HAZE}
float sunAzimuth0(vec3 dir) {
  vec2 h = normalize(dir.xz + vec2(1e-5));
  vec2 s = normalize(uSunDir.xz + vec2(1e-5));
  return dot(h, s) * 0.5 + 0.5;
}

vec2 h2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453) * 2.0 - 1.0;
}
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(dot(h2(i), f), dot(h2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
             mix(dot(h2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(h2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
}
float terrain(vec2 xz) {
  vec2 p = xz / 2600.0;
  float h = gnoise(p) * 0.6 + gnoise(p * 2.1 + 3.7) * 0.28 + gnoise(p * 4.3 - 1.3) * 0.12;
  h = h * 340.0 + gnoise(xz / 700.0 + 9.1) * 30.0;
  float plateau = smoothstep(260.0, 1200.0, length(xz - vec2(0.0, -20.0)));
  return mix(18.0, h, plateau);
}
float isoline(float v, float interval, float width) {
  float x = v / interval;
  float d = abs(fract(x - 0.5) - 0.5) / max(fwidth(x), 1e-5);
  return 1.0 - smoothstep(width - 0.5, width + 0.5, d);
}
float grid(vec2 p, float spacing) {
  vec2 x = p / spacing;
  vec2 d = abs(fract(x - 0.5) - 0.5) / max(fwidth(x), vec2(1e-5));
  return 1.0 - smoothstep(0.0, 1.0, min(d.x, d.y));
}

void main() {
  vec3 toFrag = vWorld - uCamPos;
  float dist = length(toFrag);
  vec3 rd = toFrag / dist;
  vec3 col = uGround;
  // Broad, soft tonal variation, as a landscape has under morning haze, and a fine mottle,
  // as a cyanotype has: the sheet should read as printed, not as a viewport.
  float tone = gnoise(vWorld.xz / 1400.0 + 4.2) * 0.5 + gnoise(vWorld.xz / 380.0 - 2.7) * 0.25;
  float fineFade = 1.0 - smoothstep(150.0, 900.0, dist);
  float mottle = fineFade > 0.0 ? (gnoise(vWorld.xz / 23.0 + 1.3) * 0.6 + gnoise(vWorld.xz / 6.5 - 7.1) * 0.4) * fineFade : 0.0;
  col *= 0.9 + tone * 0.3 + mottle * 0.12;
  // Low light rakes in from the sun's side and warms the sheet; the far side stays cool.
  float az = sunAzimuth0(rd);
  col = mix(col, col * vec3(1.7, 1.28, 0.95), pow(az, 2.2) * 0.75);

  float near = 1.0 - smoothstep(1800.0, 16000.0, dist);
  float h = terrain(vWorld.xz);
  float minor = isoline(h, 12.5, 0.5) * 0.12;
  float major = isoline(h, 62.5, 0.7) * 0.3;
  col = mix(col, vec3(0.62, 0.72, 0.84), (minor + major) * near * uMapOn);

  vec2 lo = uSite.xy - 70.0;
  vec2 hi = uSite.zw + 70.0;
  vec2 inside = smoothstep(lo, lo + 60.0, vWorld.xz) * (1.0 - smoothstep(hi - 60.0, hi, vWorld.xz));
  float site = inside.x * inside.y;
  if (site > 0.0 && dist < 2200.0) {
    float ink = 0.72 + 0.28 * (gnoise(vWorld.xz / 31.0 + 5.5) * 0.5 + 0.5);
    float g = (grid(vWorld.xz, 8.0) * 0.03 + grid(vWorld.xz, 40.0) * 0.1) * ink;
    col = mix(col, vec3(0.62, 0.72, 0.84), g * site * uMapOn * (1.0 - smoothstep(600.0, 2200.0, dist)));
  }

  float fog = 1.0 - exp(-dist * uFogDensity * 1.6);
  col = mix(col, hazeColor0(rd), fog);
  gl_FragColor = vec4(col, 1.0);
}
`;

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aBright;
uniform float uDpr;
uniform float uStarsI;
varying float vBright;
void main() {
  vec4 view = viewMatrix * vec4(position + cameraPosition, 1.0);
  gl_Position = projectionMatrix * view;
  float alt = normalize(position).y;
  vBright = aBright * uStarsI * smoothstep(0.02, 0.35, alt);
  gl_PointSize = aSize * uDpr;
}
`;

const STAR_FRAG = /* glsl */ `
varying float vBright;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = exp(-dot(d, d) * 18.0) * vBright;
  if (a < 0.002) discard;
  gl_FragColor = vec4(vec3(0.82, 0.88, 1.0) * a, 0.0);
}
`;

export const SITE_RECT = { x0: -170, z0: -110, x1: 170, z1: 110 } as const;

export function createGround(dpr: number): { group: Group; setDpr(v: number): void; dispose(): void } {
  const group = new Group();
  const plane = new PlaneGeometry(90000, 90000, 1, 1);
  plane.rotateX(-Math.PI / 2);
  const material = new ShaderMaterial({
    vertexShader: GROUND_VERT,
    fragmentShader: GROUND_FRAG,
    uniforms: {
      uCamPos: shared.uCamPos,
      uGround: shared.uGround,
      uHaze: shared.uHaze,
      uHorizon: shared.uHorizon,
      uSunward: shared.uSunward,
      uSunDir: shared.uSunDir,
      uFogDensity: shared.uFogDensity,
      uMapOn: { value: 1 },
      uSite: { value: [SITE_RECT.x0, SITE_RECT.z0, SITE_RECT.x1, SITE_RECT.z1] },
    },
  });
  const ground = new Mesh(plane, material);
  ground.frustumCulled = false;
  ground.renderOrder = 0;
  group.add(ground);

  // Stars on a dome; drawn relative to the camera so they sit at infinity.
  const count = 900;
  const pos: number[] = [];
  const size: number[] = [];
  const bright: number[] = [];
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < count; i++) {
    const u = rand();
    const v = rand() * 0.92 + 0.08;
    const theta = u * Math.PI * 2;
    const y = v;
    const r = Math.sqrt(1 - y * y);
    pos.push(Math.cos(theta) * r * 50000, y * 50000, Math.sin(theta) * r * 50000);
    const m = rand();
    size.push(1.1 + Math.pow(m, 6) * 2.4);
    bright.push(0.25 + Math.pow(rand(), 3) * 1.2);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new Float32BufferAttribute(size, 1));
  geo.setAttribute('aBright', new Float32BufferAttribute(bright, 1));
  const starMat = new ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    uniforms: { uDpr: { value: dpr }, uStarsI: shared.uStarsI },
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
  });
  const stars = new Points(geo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = -1;
  group.add(stars);

  return {
    group,
    setDpr(v: number) {
      starMat.uniforms.uDpr.value = v;
    },
    dispose() {
      plane.dispose();
      material.dispose();
      geo.dispose();
      starMat.dispose();
    },
  };
}
