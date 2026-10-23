/**
 * The drawing kit: the primitives every case-study scene is drawn with, as white plotter
 * linework on the survey sheet. A scene is a list of strokes, faint fills and a few solids;
 * the kit turns each list into one instanced draw call.
 *
 * Shimmer-free by construction (design/system.md, "Drawing kit"):
 *   - Every primitive anti-aliases itself. Strokes are exact screen-space distance fields
 *     (round pen ends, no triangle seams); fills fade over one pixel at their edges; a solid's
 *     outline is an exact screen-space distance and its faces are shaded from eight rays a
 *     pixel. Nothing relies on MSAA or a post-process pass, so it costs no extra buffers.
 *   - Painter's order and no depth buffer: fills, then strokes, then solids back to front.
 *     The ground never writes depth, so nothing can fight it, and nothing sits in its plane.
 *   - No stroke is drawn thinner than one device pixel: a thinner stroke keeps one pixel and
 *     loses ink, so its brightness never depends on where it falls on the pixel grid.
 *   - Dashes are box-filtered: as a dashed stroke recedes, its dashes fade to an even tone
 *     instead of crawling.
 */
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  ShaderMaterial,
  Vector2,
} from 'three';
import { lin, type Vec3 } from '../world';
import { shared } from './uniforms';

/** Linework white and the one warm colour, in linear RGB. */
export const INK = {
  line: lin('#eaf1f4'),
  signal: lin('#f5a524'),
} as const;

/** Stroke weights in CSS pixels; the kit multiplies by the device pixel ratio. */
export const WEIGHT = {
  /** The system the case study is about. */
  primary: 1.75,
  /** Everything around it: the rest of the field. */
  secondary: 1.3,
  /** Boundaries, plumb lines and other construction lines. */
  construction: 1.1,
  /** Outlines of things that do not exist yet. */
  guide: 1.0,
} as const;

/** Dash patterns, as a fraction of their period that carries ink. */
export type DashPattern = 'solid' | 'dash' | 'dashdot';
const PATTERN_ID: Record<DashPattern, number> = { solid: 0, dash: 1, dashdot: 2 };

export interface Stroke {
  a: Vec3;
  b: Vec3;
  /** Scene seconds when the pen starts and finishes the stroke. */
  t0: number;
  t1: number;
  /** Optional: scene seconds over which the stroke is lifted again (fades out). */
  out?: [number, number];
  color: Vec3;
  /** CSS pixels; use WEIGHT. */
  width: number;
  dash?: DashPattern;
  /** Dash period in metres. */
  period?: number;
}

const STROKE_VERT = /* glsl */ `
attribute vec3 iA;
attribute vec3 iB;
attribute vec4 iT;
attribute vec4 iStyle;
attribute vec2 iDash;
uniform float uTime;
uniform vec2 uViewport;
uniform float uDpr;
uniform float uNear;
uniform vec3 uCamPos;
uniform float uFogDensity;
flat varying vec4 vEnds;
flat varying vec2 vW;
flat varying vec3 vColor;
flat varying vec2 vWidth;
flat varying vec3 vDash;
flat varying float vDrawing;
varying float vFog;

void main() {
  float p = clamp((uTime - iT.x) / max(iT.y - iT.x, 1e-4), 0.0, 1.0);
  float lift = 1.0 - smoothstep(iT.z, iT.w, uTime);
  if (p <= 0.0 || lift <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 b = mix(iA, iB, p);
  mat4 vp = projectionMatrix * viewMatrix;
  vec4 ca = vp * vec4(iA, 1.0);
  vec4 cb = vp * vec4(b, 1.0);
  // Clip to the near plane, so a stroke that passes beside the camera still projects.
  float nw = uNear * 1.01;
  if (ca.w < nw && cb.w < nw) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  if (ca.w < nw) ca = mix(ca, cb, (nw - ca.w) / (cb.w - ca.w));
  if (cb.w < nw) cb = mix(cb, ca, (nw - cb.w) / (ca.w - cb.w));
  vec2 sa = (ca.xy / ca.w * 0.5 + 0.5) * uViewport;
  vec2 sb = (cb.xy / cb.w * 0.5 + 0.5) * uViewport;
  float wpx = iStyle.w * uDpr;
  float halfW = max(wpx * 0.5, 0.5);
  vec2 d = sb - sa;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  // The quad covers the stroke plus one pixel all round, for the edge filter.
  float r = halfW + 1.0;
  bool start = position.x < 0.5;
  vec2 corner = (start ? sa - dir * r : sb + dir * r) + nrm * position.y * r;
  vec4 c = start ? ca : cb;
  gl_Position = vec4((corner / uViewport * 2.0 - 1.0) * c.w, c.z, c.w);

  vEnds = vec4(sa, sb);
  vW = vec2(ca.w, cb.w);
  vColor = iStyle.rgb;
  vWidth = vec2(halfW, min(wpx, 1.0) * lift);
  vDash = vec3(iDash.x, iDash.y, length(b - iA));
  vDrawing = p < 1.0 ? 1.0 : 0.0;
  vec3 end = start ? iA : b;
  vFog = 1.0 - exp(-length(end - uCamPos) * uFogDensity * 1.6);
}
`;

const STROKE_FRAG = /* glsl */ `
uniform vec3 uHaze;
uniform float uIntensity;
flat varying vec4 vEnds;
flat varying vec2 vW;
flat varying vec3 vColor;
flat varying vec2 vWidth;
flat varying vec3 vDash;
flat varying float vDrawing;
varying float vFog;

// Ink carried by the dash pattern from 0 to u periods: its integral, so the filter is exact.
float inkTo(float u, float pattern) {
  float f = fract(u);
  float whole = floor(u);
  if (pattern < 1.5) return whole * 0.5 + min(f, 0.5);
  // Dash-dot, as for a boundary on a site plan: a long dash, a gap, a dot, a gap.
  return whole * 0.615 + min(f, 0.538) + clamp(f - 0.692, 0.0, 0.077);
}

float dashInk(float u, float pattern) {
  float fw = fwidth(u);
  if (fw < 1e-3) {
    float f = fract(u);
    return pattern < 1.5 ? step(f, 0.5) : step(f, 0.538) + step(0.692, f) * step(f, 0.769);
  }
  // Box filter over the pixel's footprint along the stroke.
  return clamp((inkTo(u + fw * 0.5, pattern) - inkTo(u - fw * 0.5, pattern)) / fw, 0.0, 1.0);
}

void main() {
  vec2 pa = vEnds.xy;
  vec2 ab = vEnds.zw - pa;
  vec2 ap = gl_FragCoord.xy - pa;
  float l2 = dot(ab, ab);
  float s = l2 > 1e-6 ? clamp(dot(ap, ab) / l2, 0.0, 1.0) : 0.0;
  // Exact distance from the pixel centre to the stroke, round ends included.
  float dist = length(ap - ab * s);
  float cov = clamp(vWidth.x + 0.5 - dist, 0.0, 1.0) * vWidth.y;
  // Position along the stroke in world terms: the screen parameter, perspective undone.
  float t = (s / vW.y) / ((1.0 - s) / vW.x + s / vW.y);
  if (vDash.x > 0.5) cov *= dashInk(t * vDash.z / vDash.y, vDash.x);
  if (cov <= 0.002) discard;
  vec3 col = mix(vColor * uIntensity, uHaze, vFog);
  // The pen: the growing end of a stroke is brighter, like wet ink.
  col *= 1.0 + 1.4 * vDrawing * smoothstep(0.85, 1.0, t);
  gl_FragColor = vec4(col * cov, cov);
}
`;

/** Every stroke of a scene, as one instanced draw call. */
export class StrokeLayer {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly geometry: InstancedBufferGeometry;
  private readonly quad: BufferGeometry;

  constructor(strokes: Stroke[]) {
    this.quad = new BufferGeometry();
    this.quad.setAttribute('position', new Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    const geo = new InstancedBufferGeometry();
    geo.setAttribute('position', this.quad.getAttribute('position'));
    const n = strokes.length;
    const A = new Float32Array(n * 3);
    const B = new Float32Array(n * 3);
    const T = new Float32Array(n * 4);
    const S = new Float32Array(n * 4);
    const D = new Float32Array(n * 2);
    strokes.forEach((s, i) => {
      A.set(s.a, i * 3);
      B.set(s.b, i * 3);
      T.set([s.t0, s.t1, s.out?.[0] ?? 1e9, s.out?.[1] ?? 1e9 + 1], i * 4);
      S.set([...s.color, s.width], i * 4);
      D.set([PATTERN_ID[s.dash ?? 'solid'], s.period ?? 1], i * 2);
    });
    geo.setAttribute('iA', new InstancedBufferAttribute(A, 3));
    geo.setAttribute('iB', new InstancedBufferAttribute(B, 3));
    geo.setAttribute('iT', new InstancedBufferAttribute(T, 4));
    geo.setAttribute('iStyle', new InstancedBufferAttribute(S, 4));
    geo.setAttribute('iDash', new InstancedBufferAttribute(D, 2));
    geo.instanceCount = n;
    this.geometry = geo;
    this.material = new ShaderMaterial({
      vertexShader: STROKE_VERT,
      fragmentShader: STROKE_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uViewport: { value: new Vector2(1, 1) },
        uDpr: { value: 1 },
        uNear: { value: 1 },
        uCamPos: shared.uCamPos,
        uFogDensity: shared.uFogDensity,
        uHaze: shared.uHaze,
        uIntensity: { value: 1.25 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.name = 'lines';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = ORDER.strokes;
  }

  setViewport(w: number, h: number, dpr: number, near: number): void {
    (this.material.uniforms.uViewport.value as Vector2).set(w, h);
    this.material.uniforms.uDpr.value = dpr;
    this.material.uniforms.uNear.value = near;
  }

  setTime(t: number): void {
    this.material.uniforms.uTime.value = t;
  }

  dispose(): void {
    this.geometry.dispose();
    this.quad.dispose();
    this.material.dispose();
  }
}

/** Painter's order inside a scene: washes under the linework, solids over it. */
export const ORDER = { fills: 2, strokes: 4, solids: 5, focus: 6 } as const;

/** An axis-aligned box standing on the ground: centre x, z; footprint w, d; height h. */
export interface BoxSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** Base height above the ground; 0 for anything standing on the sheet. */
  y?: number;
}

/**
 * A fill face's two in-plane coordinates, and how many pixels the fragment is from each pair
 * of edges: a box is a unit cube scaled per instance, so every face spans -0.5 to 0.5.
 */
const FACE_EDGES = /* glsl */ `
vec2 faceCoords(vec3 local, vec3 n, out vec3 axA, out vec3 axB) {
  vec3 an = abs(n);
  if (an.x > 0.5) { axA = vec3(0.0, 1.0, 0.0); axB = vec3(0.0, 0.0, 1.0); return local.yz; }
  if (an.y > 0.5) { axA = vec3(1.0, 0.0, 0.0); axB = vec3(0.0, 0.0, 1.0); return local.xz; }
  axA = vec3(1.0, 0.0, 0.0); axB = vec3(0.0, 1.0, 0.0); return local.xy;
}
vec2 edgePixels(vec2 q) {
  vec2 g = vec2(length(vec2(dFdx(q.x), dFdy(q.x))), length(vec2(dFdx(q.y), dFdy(q.y))));
  return (0.5 - abs(q)) / max(g, vec2(1e-6));
}
`;

const FILL_VERT = /* glsl */ `
attribute float aT;
attribute float aDur;
uniform float uTime;
varying vec3 vLocal;
flat varying vec3 vN;
varying float vOpacity;
void main() {
  vLocal = position;
  vN = normal;
  vOpacity = smoothstep(aT + aDur * 0.85, aT + aDur * 1.2, uTime);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position + vec3(0.0, 0.5, 0.0), 1.0);
}
`;

const FILL_FRAG = /* glsl */ `
uniform vec3 uKeyDir;
uniform vec3 uTint;
uniform float uAlpha;
varying vec3 vLocal;
flat varying vec3 vN;
varying float vOpacity;
${FACE_EDGES}
void main() {
  vec3 axA;
  vec3 axB;
  vec2 q = faceCoords(vLocal, vN, axA, axB);
  vec2 e = edgePixels(q);
  // Each wash fades over the last pixel inside its outline; the stroke on top covers the seam.
  float cov = clamp(min(e.x, e.y), 0.0, 1.0);
  float lit = 0.6 + 0.4 * max(dot(vN, uKeyDir), 0.0);
  float a = uAlpha * vOpacity * (vN.y > 0.5 ? 1.25 : 0.9 + 0.2 * (vLocal.y + 0.5)) * cov;
  if (a <= 0.002) discard;
  gl_FragColor = vec4(uTint * lit * a, a);
}
`;

/** Faint washes on the faces of boxes, arriving once their outline has closed. */
export class FillLayer {
  readonly mesh: InstancedMesh;
  private readonly material: ShaderMaterial;
  private readonly geometry: BoxGeometry;

  constructor(boxes: (BoxSpec & { t: number; dur: number })[], alpha = 0.07) {
    this.geometry = new BoxGeometry(1, 1, 1);
    this.material = new ShaderMaterial({
      vertexShader: FILL_VERT,
      fragmentShader: FILL_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uKeyDir: shared.uKeyDir,
        uTint: { value: new Color(0.75, 0.82, 0.9) },
        uAlpha: { value: alpha },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
      premultipliedAlpha: true,
    });
    this.mesh = new InstancedMesh(this.geometry, this.material, boxes.length);
    const m = new Matrix4();
    const aT = new Float32Array(boxes.length);
    const aDur = new Float32Array(boxes.length);
    boxes.forEach((b, i) => {
      m.makeScale(b.w, b.h, b.d).setPosition(b.x, b.y ?? 0, b.z);
      this.mesh.setMatrixAt(i, m);
      aT[i] = b.t;
      aDur[i] = b.dur;
    });
    this.geometry.setAttribute('aT', new InstancedBufferAttribute(aT, 1));
    this.geometry.setAttribute('aDur', new InstancedBufferAttribute(aDur, 1));
    this.mesh.name = 'fills';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = ORDER.fills;
  }

  setTime(t: number): void {
    this.material.uniforms.uTime.value = t;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

const SOLID_VERT = /* glsl */ `
attribute float aT;
uniform float uTime;
uniform vec2 uResolution;
flat varying vec3 vMin;
flat varying vec3 vMax;
flat varying vec4 vHull0;
flat varying vec4 vHull1;
flat varying vec4 vHull2;
flat varying float vHullN;
void main() {
  // A solid grows out of its base when its time comes; aT < 0 means always there.
  float on = aT < 0.0 ? 1.0 : smoothstep(aT, aT + 0.12, uTime);
  float s = mix(0.2, 1.0, on);
  mat4 m = modelMatrix * instanceMatrix;
  // The exact box in world space: instances are scaled and moved, never turned.
  vec3 c0 = (m * vec4(vec3(-0.5, 0.0, -0.5) * s, 1.0)).xyz;
  vec3 c1 = (m * vec4(vec3(0.5, 1.0, 0.5) * s, 1.0)).xyz;
  vMin = min(c0, c1);
  vMax = max(c0, c1);
  // Its eight corners on screen, in pixels.
  mat4 vp = projectionMatrix * viewMatrix;
  vec2 P[8];
  bool behind = false;
  for (int i = 0; i < 8; i++) {
    vec3 c = vec3((i & 1) == 0 ? vMin.x : vMax.x, (i & 2) == 0 ? vMin.y : vMax.y, (i & 4) == 0 ? vMin.z : vMax.z);
    vec4 cc = vp * vec4(c, 1.0);
    behind = behind || cc.w <= 0.0;
    P[i] = (cc.xy / max(cc.w, 1e-6) * 0.5 + 0.5) * uResolution;
  }
  if (on <= 0.0 || behind) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // The outline is the convex hull of the corners: at most six points, counter-clockwise
  // (gift wrapping from the leftmost corner).
  int first = 0;
  for (int i = 1; i < 8; i++) {
    if (P[i].x < P[first].x || (P[i].x == P[first].x && P[i].y < P[first].y)) first = i;
  }
  vec2 hull[6];
  int count = 0;
  int cur = first;
  for (int k = 0; k < 6; k++) {
    hull[k] = P[cur];
    count = k + 1;
    int next = cur == 0 ? 1 : 0;
    for (int j = 0; j < 8; j++) {
      if (j == cur) continue;
      vec2 a = P[next] - P[cur];
      vec2 b = P[j] - P[cur];
      float cr = a.x * b.y - a.y * b.x;
      if (cr < 0.0 || (abs(cr) < 1e-4 && dot(b, b) > dot(a, a))) next = j;
    }
    cur = next;
    if (cur == first) break;
  }
  for (int k = count; k < 6; k++) hull[k] = hull[count - 1];
  vHull0 = vec4(hull[0], hull[1]);
  vHull1 = vec4(hull[2], hull[3]);
  vHull2 = vec4(hull[4], hull[5]);
  vHullN = float(count);
  // Draw the hull's bounding rectangle plus a pixel: every pixel the outline touches is
  // shaded exactly once, whatever the box's faces do.
  vec2 lo = P[0];
  vec2 hi = P[0];
  for (int i = 1; i < 8; i++) {
    lo = min(lo, P[i]);
    hi = max(hi, P[i]);
  }
  vec2 px = mix(lo - 1.0, hi + 1.0, position.xy);
  gl_Position = vec4(px / uResolution * 2.0 - 1.0, 0.0, 1.0);
}
`;

const SOLID_FRAG = /* glsl */ `
uniform vec3 uKeyDir;
uniform vec3 uColor;
uniform vec3 uCamPos;
uniform mat4 uInvViewProj;
uniform vec2 uResolution;
flat varying vec3 vMin;
flat varying vec3 vMax;
flat varying vec4 vHull0;
flat varying vec4 vHull1;
flat varying vec4 vHull2;
flat varying float vHullN;
// Eight sub-pixel positions (the usual 8x multisample pattern), in pixels.
const vec2 SAMPLES[8] = vec2[8](
  vec2(0.0625, -0.1875), vec2(-0.0625, 0.1875), vec2(0.3125, 0.0625), vec2(-0.1875, -0.3125),
  vec2(-0.3125, 0.3125), vec2(-0.4375, -0.0625), vec2(0.1875, 0.4375), vec2(0.4375, -0.4375)
);

// Signed distance in pixels from p to the convex outline: negative inside.
float outline(vec2 p) {
  vec2 h[6] = vec2[6](vHull0.xy, vHull0.zw, vHull1.xy, vHull1.zw, vHull2.xy, vHull2.zw);
  int n = int(vHullN + 0.5);
  float d = -1e9;
  for (int i = 0; i < 6; i++) {
    if (i >= n) break;
    vec2 a = h[i];
    vec2 b = h[i + 1 < n ? i + 1 : 0];
    vec2 e = b - a;
    float l = length(e);
    if (l < 1e-4) continue;
    d = max(d, dot(p - a, vec2(e.y, -e.x) / l));
  }
  return d;
}

void main() {
  // The outline's coverage is exact and continuous: the pixel's distance to the silhouette.
  float cov = clamp(0.5 - outline(gl_FragCoord.xy), 0.0, 1.0);
  if (cov <= 0.002) discard;
  // Inside it, eight rays decide which faces the pixel sees, so the edge between the lit
  // roof and a shaded side is smoothed too.
  vec3 col = vec3(0.0);
  float hits = 0.0;
  for (int k = 0; k < 8; k++) {
    vec2 ndc = (gl_FragCoord.xy + SAMPLES[k]) / uResolution * 2.0 - 1.0;
    vec4 far = uInvViewProj * vec4(ndc, 1.0, 1.0);
    vec3 rd = normalize(far.xyz / far.w - uCamPos);
    vec3 inv = 1.0 / rd;
    vec3 ta = (vMin - uCamPos) * inv;
    vec3 tb = (vMax - uCamPos) * inv;
    vec3 tn = min(ta, tb);
    vec3 tf = max(ta, tb);
    float tNear = max(max(tn.x, tn.y), tn.z);
    float tFar = min(min(tf.x, tf.y), tf.z);
    if (tNear < tFar && tFar > 0.0) {
      vec3 n = tNear == tn.x ? vec3(-sign(rd.x), 0.0, 0.0) : tNear == tn.y ? vec3(0.0, -sign(rd.y), 0.0) : vec3(0.0, 0.0, -sign(rd.z));
      col += uColor * (n.y > 0.5 ? 1.0 : 0.55 + 0.35 * max(dot(n, uKeyDir), 0.0));
      hits += 1.0;
    }
  }
  // A pixel only grazed by the outline may miss every ray; it takes the roof's colour.
  col = hits > 0.0 ? col / hits : uColor;
  gl_FragColor = vec4(col * cov, cov);
}
`;

/**
 * Small solid boxes (pods, the pending pod). Each is drawn as a screen rectangle fitted to its
 * outline: coverage is the exact distance to the outline, and eight rays a pixel shade the
 * faces. Drawn after the strokes, back to front from `viewpoint`, with no depth test: a solid
 * always sits over the linework behind it.
 */
export class SolidLayer {
  readonly mesh: InstancedMesh;
  private readonly material: ShaderMaterial;
  private readonly geometry: BufferGeometry;

  constructor(
    solids: { pos: Vec3; size: Vec3; t: number }[],
    color: Vec3,
    viewpoint: Vec3,
    order: number = ORDER.solids,
  ) {
    // One screen-space rectangle per solid; the vertex shader fits it to the box's outline.
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0], 3));
    this.material = new ShaderMaterial({
      vertexShader: SOLID_VERT,
      fragmentShader: SOLID_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uKeyDir: shared.uKeyDir,
        uCamPos: shared.uCamPos,
        uInvViewProj: shared.uInvViewProj,
        uResolution: shared.uResolution,
        uColor: { value: new Color(...color) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
    });
    const d2 = (p: Vec3) => (p[0] - viewpoint[0]) ** 2 + (p[1] - viewpoint[1]) ** 2 + (p[2] - viewpoint[2]) ** 2;
    const sorted = [...solids].sort((a, b) => d2(b.pos) - d2(a.pos));
    this.mesh = new InstancedMesh(this.geometry, this.material, sorted.length);
    const m = new Matrix4();
    const aT = new Float32Array(sorted.length);
    sorted.forEach((s, i) => {
      m.makeScale(s.size[0], s.size[1], s.size[2]).setPosition(s.pos[0], s.pos[1], s.pos[2]);
      this.mesh.setMatrixAt(i, m);
      aT[i] = s.t;
    });
    this.geometry.setAttribute('aT', new InstancedBufferAttribute(aT, 1));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
  }

  setColor(c: Vec3): void {
    (this.material.uniforms.uColor.value as Color).setRGB(c[0], c[1], c[2]);
  }

  setTime(t: number): void {
    this.material.uniforms.uTime.value = t;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * The plotter's order for a box: round the footprint, raise the corners, close the roof.
 * `t` and `dur` are the box's slot in scene seconds.
 */
export function plotBox(n: BoxSpec, t: number, dur: number, width: number, color: Vec3 = INK.line): Stroke[] {
  const x0 = n.x - n.w / 2;
  const x1 = n.x + n.w / 2;
  const z0 = n.z - n.d / 2;
  const z1 = n.z + n.d / 2;
  // Lifted off the sheet by a hair so a stroke never lies in the ground's plane.
  const y0 = (n.y ?? 0) + 0.15;
  const y1 = (n.y ?? 0) + n.h;
  const base: Vec3[] = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y0, z1],
    [x0, y0, z1],
  ];
  const top: Vec3[] = base.map((p) => [p[0], y1, p[2]]);
  const out: Stroke[] = [];
  for (let i = 0; i < 4; i++) {
    out.push({ a: base[i], b: base[(i + 1) % 4], t0: t + dur * 0.1 * i, t1: t + dur * 0.1 * (i + 1), color, width });
  }
  for (let i = 0; i < 4; i++) {
    out.push({ a: base[i], b: top[i], t0: t + dur * 0.4, t1: t + dur * 0.62, color, width });
  }
  for (let i = 0; i < 4; i++) {
    out.push({ a: top[i], b: top[(i + 1) % 4], t0: t + dur * 0.62 + dur * 0.08 * i, t1: t + dur * 0.62 + dur * 0.08 * (i + 1) + 0.02, color, width });
  }
  return out;
}

/** A closed outline through the given corners, drawn corner to corner over [t, t + dur]. */
export function plotLoop(
  corners: Vec3[],
  t: number,
  dur: number,
  style: Pick<Stroke, 'color' | 'width' | 'dash' | 'period' | 'out'>,
): Stroke[] {
  const n = corners.length;
  return corners.map((c, i) => ({
    a: c,
    b: corners[(i + 1) % n],
    t0: t + (dur / n) * i,
    t1: t + (dur / n) * (i + 1),
    ...style,
  }));
}
