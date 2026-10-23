/**
 * The case study, drawn: Karpenter keeping up with load, as white plotter linework on the
 * survey sheet. Structure from /work/karpenter-autoscaling; nothing here is a measurement.
 *
 *   0.0–0.7  the running cluster draws itself in as the cloud breaks
 *   0.8      a pod arrives that fits no node (amber: the one warm colour, for the pending state)
 *   1.0–2.2  Karpenter provisions a node for it, edge by edge
 *   2.2–2.5  the node is ready and the pod lands on it
 *   3.0–4.8  under load the field grows past 100 nodes, from the middle out
 *
 * Every edge is one instance of a screen-space line, clipped to its own draw progress, so
 * the whole drawing is one draw call and runs backwards as smoothly as forwards.
 */
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  ShaderMaterial,
  Vector2,
} from 'three';
import { lin, type Vec3 } from '../world';
import { BEATS, layout, type NodeBox } from '../site';
import { shared } from './uniforms';

const LINE = lin('#eaf1f4');
const SIGNAL = lin('#f5a524');

interface Seg {
  a: Vec3;
  b: Vec3;
  t0: number;
  t1: number;
  color: Vec3;
  width: number;
  dash: number;
}

function boxEdges(n: NodeBox, out: Seg[]): void {
  const x0 = n.x - n.w / 2;
  const x1 = n.x + n.w / 2;
  const z0 = n.z - n.d / 2;
  const z1 = n.z + n.d / 2;
  const y0 = 0.15;
  const y1 = n.h;
  const base: Vec3[] = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y0, z1],
    [x0, y0, z1],
  ];
  const top: Vec3[] = base.map((p) => [p[0], y1, p[2]]);
  const w = n.group === 'scale' ? 1.3 : 1.75;
  const T = n.t;
  const D = n.dur;
  // The plotter goes round the footprint, raises the corners, then closes the roof.
  for (let i = 0; i < 4; i++) {
    out.push({ a: base[i], b: base[(i + 1) % 4], t0: T + D * 0.1 * i, t1: T + D * 0.1 * (i + 1), color: LINE, width: w, dash: 0 });
  }
  for (let i = 0; i < 4; i++) {
    out.push({ a: base[i], b: top[i], t0: T + D * 0.4, t1: T + D * 0.62, color: LINE, width: w, dash: 0 });
  }
  for (let i = 0; i < 4; i++) {
    out.push({ a: top[i], b: top[(i + 1) % 4], t0: T + D * 0.62 + D * 0.08 * i, t1: T + D * 0.62 + D * 0.08 * (i + 1) + 0.02, color: LINE, width: w, dash: 0 });
  }
}

const LINE_VERT = /* glsl */ `
attribute vec3 iA;
attribute vec3 iB;
attribute vec2 iT;
attribute vec4 iStyle;
attribute float iDash;
uniform float uTime;
uniform vec2 uViewport;
uniform float uDpr;
uniform vec3 uCamPos;
uniform float uFogDensity;
varying float vAcross;
varying float vHalf;
varying vec3 vColor;
varying float vFog;
varying float vAlong;
varying float vDash;
varying float vHead;
void main() {
  float p = clamp((uTime - iT.x) / max(iT.y - iT.x, 1e-4), 0.0, 1.0);
  vec3 b = mix(iA, iB, p);
  vec4 ca = projectionMatrix * viewMatrix * vec4(iA, 1.0);
  vec4 cb = projectionMatrix * viewMatrix * vec4(b, 1.0);
  vec2 sa = ca.xy / ca.w * uViewport * 0.5;
  vec2 sb = cb.xy / cb.w * uViewport * 0.5;
  vec2 d = sb - sa;
  float len = length(d);
  vec2 dir = len > 1e-3 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float hw = iStyle.w * uDpr * 0.5 + 0.75;
  float endSide = position.x;
  vec4 c = endSide < 0.5 ? ca : cb;
  vec2 off = nrm * position.y * hw + dir * (endSide < 0.5 ? -hw : hw);
  c.xy += off / (uViewport * 0.5) * c.w;
  gl_Position = p <= 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : c;
  vAcross = position.y * hw;
  vHalf = iStyle.w * uDpr * 0.5;
  vColor = iStyle.rgb;
  vec3 mid = mix(iA, b, endSide);
  float dist = length(mid - uCamPos);
  vFog = 1.0 - exp(-dist * uFogDensity * 1.6);
  vAlong = length(b - iA) * endSide;
  vDash = iDash;
  vHead = p < 1.0 ? endSide : 0.0;
}
`;

const LINE_FRAG = /* glsl */ `
uniform vec3 uHaze;
uniform float uIntensity;
varying float vAcross;
varying float vHalf;
varying vec3 vColor;
varying float vFog;
varying float vAlong;
varying float vDash;
varying float vHead;
void main() {
  float a = clamp(vHalf + 0.5 - abs(vAcross), 0.0, 1.0);
  if (vDash > 0.0) {
    // Dash-dot, as for a boundary on a site plan; plain dashes for the plumb line.
    float u = mod(vAlong, vDash * 2.6) / vDash;
    float on = step(u, 1.4) + step(1.8, u) * step(u, 2.0);
    a *= on;
  }
  if (a <= 0.003) discard;
  vec3 col = mix(vColor * uIntensity, uHaze, vFog);
  // The pen: the growing end of a line is brighter, like wet ink.
  col *= 1.0 + 1.4 * smoothstep(0.85, 1.0, vHead);
  gl_FragColor = vec4(col * a, a);
}
`;

const FILL_VERT = /* glsl */ `
attribute float aT;
attribute float aDur;
uniform float uTime;
varying float vOpacity;
varying vec3 vNormalW;
varying float vH;
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vOpacity = smoothstep(aT + aDur * 0.85, aT + aDur * 1.2, uTime);
  vNormalW = normalize(mat3(instanceMatrix) * normal);
  vH = position.y + 0.5;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FILL_FRAG = /* glsl */ `
uniform vec3 uKeyDir;
uniform vec3 uTint;
uniform float uAlpha;
varying float vOpacity;
varying vec3 vNormalW;
varying float vH;
void main() {
  float lit = 0.6 + 0.4 * max(dot(normalize(vNormalW), uKeyDir), 0.0);
  float a = uAlpha * vOpacity * (vNormalW.y > 0.5 ? 1.25 : 0.8 + 0.2 * vH);
  if (a <= 0.002) discard;
  gl_FragColor = vec4(uTint * lit * a, a);
}
`;

const POD_VERT = /* glsl */ `
attribute float aT;
uniform float uTime;
varying float vOn;
varying vec3 vNormalW;
void main() {
  float on = smoothstep(aT, aT + 0.12, uTime);
  vOn = on;
  vec3 pos = position * mix(0.2, 1.0, on);
  vec4 w = modelMatrix * instanceMatrix * vec4(pos, 1.0);
  vNormalW = normalize(mat3(instanceMatrix) * normal);
  gl_Position = on <= 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * w;
}
`;

const POD_FRAG = /* glsl */ `
uniform vec3 uKeyDir;
uniform vec3 uColor;
uniform vec3 uHaze;
uniform vec3 uCamPos;
varying float vOn;
varying vec3 vNormalW;
void main() {
  vec3 n = normalize(vNormalW);
  float lit = n.y > 0.5 ? 1.0 : 0.55 + 0.35 * max(dot(n, uKeyDir), 0.0);
  gl_FragColor = vec4(uColor * lit, 1.0);
}
`;

export class Blueprint {
  readonly group = new Group();
  readonly anchors: { pending: Vec3; node: Vec3; field: Vec3; site: Vec3 };
  readonly nodeCount: number;
  private readonly lineMat: ShaderMaterial;
  private readonly fillMat: ShaderMaterial;
  private readonly podMat: ShaderMaterial;
  private readonly pendingMat: ShaderMaterial;
  private readonly pending: Mesh;
  private readonly pendingStart: Vec3;
  private readonly pendingEnd: Vec3;
  private readonly disposables: { dispose(): void }[] = [];
  readonly nodes: NodeBox[];
  private time = 0;

  constructor() {
    const { nodes, newNode, pendingPod } = layout();
    this.nodes = nodes;
    this.nodeCount = nodes.length;
    const segs: Seg[] = [];
    for (const n of nodes) boxEdges(n, segs);
    // The site boundary, dash-dot, drawn with the first nodes.
    const b = { x0: -166, x1: 166, z0: -104, z1: 104 };
    const corners: Vec3[] = [
      [b.x0, 0.2, b.z0],
      [b.x1, 0.2, b.z0],
      [b.x1, 0.2, b.z1],
      [b.x0, 0.2, b.z1],
    ];
    for (let i = 0; i < 4; i++) {
      segs.push({ a: corners[i], b: corners[(i + 1) % 4], t0: 0.0 + i * 0.12, t1: 0.12 + i * 0.12, color: LINE, width: 1.1, dash: 3.2 });
    }
    // Pending: a plumb line from the waiting pod down to the empty lot.
    const lot: Vec3 = [pendingPod[0], 0.2, pendingPod[2]];
    segs.push({ a: [pendingPod[0], pendingPod[1] - 1.4, pendingPod[2]], b: lot, t0: BEATS.pending + 0.85, t1: BEATS.pending + 1.0, color: SIGNAL, width: 1.1, dash: 1.1 });
    // The empty lot itself, outlined in signal until the node is drawn around it.
    const lx0 = newNode.x - newNode.w / 2;
    const lx1 = newNode.x + newNode.w / 2;
    const lz0 = newNode.z - newNode.d / 2;
    const lz1 = newNode.z + newNode.d / 2;
    const lotC: Vec3[] = [
      [lx0, 0.25, lz0],
      [lx1, 0.25, lz0],
      [lx1, 0.25, lz1],
      [lx0, 0.25, lz1],
    ];
    for (let i = 0; i < 4; i++) {
      segs.push({ a: lotC[i], b: lotC[(i + 1) % 4], t0: 0.9 + i * 0.04, t1: 0.94 + i * 0.04, color: SIGNAL, width: 1.0, dash: 1.6 });
    }

    // Lines: one instanced quad per segment.
    const quad = new BufferGeometry();
    quad.setAttribute('position', new Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    const geo = new InstancedBufferGeometry();
    geo.setAttribute('position', quad.getAttribute('position'));
    const A = new Float32Array(segs.length * 3);
    const B = new Float32Array(segs.length * 3);
    const T = new Float32Array(segs.length * 2);
    const S = new Float32Array(segs.length * 4);
    const D = new Float32Array(segs.length);
    segs.forEach((s, i) => {
      A.set(s.a, i * 3);
      B.set(s.b, i * 3);
      T.set([s.t0, s.t1], i * 2);
      S.set([...s.color, s.width], i * 4);
      D[i] = s.dash;
    });
    geo.setAttribute('iA', new InstancedBufferAttribute(A, 3));
    geo.setAttribute('iB', new InstancedBufferAttribute(B, 3));
    geo.setAttribute('iT', new InstancedBufferAttribute(T, 2));
    geo.setAttribute('iStyle', new InstancedBufferAttribute(S, 4));
    geo.setAttribute('iDash', new InstancedBufferAttribute(D, 1));
    geo.instanceCount = segs.length;
    this.lineMat = new ShaderMaterial({
      vertexShader: LINE_VERT,
      fragmentShader: LINE_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uViewport: { value: new Vector2(1, 1) },
        uDpr: { value: 1 },
        uCamPos: shared.uCamPos,
        uFogDensity: shared.uFogDensity,
        uHaze: shared.uHaze,
        uIntensity: { value: 1.25 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      premultipliedAlpha: true,
    });
    const lines = new Mesh(geo, this.lineMat);
    lines.frustumCulled = false;
    lines.renderOrder = 4;
    this.disposables.push(geo, quad, this.lineMat);

    // Node faces: faint fills that arrive once the edges are closed.
    const box = new BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    this.fillMat = new ShaderMaterial({
      vertexShader: FILL_VERT,
      fragmentShader: FILL_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uKeyDir: shared.uKeyDir,
        uTint: { value: new Color(0.75, 0.82, 0.9) },
        uAlpha: { value: 0.07 },
      },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      premultipliedAlpha: true,
    });
    const fills = new InstancedMesh(box, this.fillMat, nodes.length);
    const m = new Matrix4();
    const aT = new Float32Array(nodes.length);
    const aDur = new Float32Array(nodes.length);
    nodes.forEach((n, i) => {
      m.makeScale(n.w, n.h, n.d).setPosition(n.x, 0, n.z);
      fills.setMatrixAt(i, m);
      aT[i] = n.t;
      aDur[i] = n.dur;
    });
    box.setAttribute('aT', new InstancedBufferAttribute(aT, 1));
    box.setAttribute('aDur', new InstancedBufferAttribute(aDur, 1));
    fills.frustumCulled = false;
    fills.renderOrder = 2;
    this.disposables.push(box, this.fillMat);

    // Pods: small solid blocks on the roofs, arriving just after their node.
    const podBox = new BoxGeometry(1.9, 1.3, 1.9);
    podBox.translate(0, 0.65, 0);
    const podList: { x: number; y: number; z: number; t: number }[] = [];
    for (const n of nodes) {
      const cols = Math.floor((n.w - 3) / 3.4);
      const rows = Math.floor((n.d - 3) / 3.4);
      let k = 0;
      for (let r = 0; r < rows && k < n.pods; r++) {
        for (let c = 0; c < cols && k < n.pods; c++, k++) {
          podList.push({
            x: n.x - n.w / 2 + 3.2 + c * 3.4,
            y: n.h,
            z: n.z - n.d / 2 + 3.2 + r * 3.4,
            t: n.t + n.dur + 0.04 + k * 0.012,
          });
        }
      }
    }
    this.podMat = new ShaderMaterial({
      vertexShader: POD_VERT,
      fragmentShader: POD_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uKeyDir: shared.uKeyDir,
        uColor: { value: new Color(...LINE.map((v) => v * 0.86)) },
        uHaze: shared.uHaze,
        uCamPos: shared.uCamPos,
      },
    });
    const pods = new InstancedMesh(podBox, this.podMat, podList.length);
    const podT = new Float32Array(podList.length);
    podList.forEach((p, i) => {
      m.makeTranslation(p.x, p.y, p.z);
      pods.setMatrixAt(i, m);
      podT[i] = p.t;
    });
    podBox.setAttribute('aT', new InstancedBufferAttribute(podT, 1));
    pods.frustumCulled = false;
    pods.renderOrder = 3;
    this.disposables.push(podBox, this.podMat);

    // The pending pod: amber while it waits, white once it has landed.
    const pgeo = new BoxGeometry(2.1, 1.5, 2.1);
    this.pendingMat = new ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vN;
        void main() { vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform vec3 uKeyDir;
        varying vec3 vN;
        void main() {
          float lit = vN.y > 0.5 ? 1.0 : 0.6 + 0.4 * max(dot(vN, uKeyDir), 0.0);
          gl_FragColor = vec4(uColor * lit, 1.0);
        }
      `,
      uniforms: { uColor: { value: new Color(...SIGNAL) }, uKeyDir: shared.uKeyDir },
    });
    this.pending = new Mesh(pgeo, this.pendingMat);
    this.pending.frustumCulled = false;
    this.pending.renderOrder = 3;
    this.pendingStart = pendingPod;
    this.pendingEnd = [pendingPod[0], newNode.h + 0.8, pendingPod[2]];
    this.disposables.push(pgeo, this.pendingMat);

    this.group.add(fills, pods, this.pending, lines);
    this.anchors = {
      pending: pendingPod,
      node: [newNode.x + newNode.w / 2, newNode.h, newNode.z - newNode.d / 2],
      field: [150, 9, -96],
      site: [-166, 0, 104],
    };
    this.update(0, 0);
  }

  setViewport(w: number, h: number, dpr: number): void {
    (this.lineMat.uniforms.uViewport.value as Vector2).set(w, h);
    this.lineMat.uniforms.uDpr.value = dpr;
  }

  /** Nodes fully drawn by scene time t: the live figure for the node counter. */
  drawnNodes(t: number): number {
    let k = 0;
    for (const n of this.nodes) if (t >= n.t + n.dur) k++;
    return k;
  }

  update(t: number, cameraY: number): void {
    this.time = t;
    this.group.visible = cameraY < 2200;
    this.lineMat.uniforms.uTime.value = t;
    this.fillMat.uniforms.uTime.value = t;
    this.podMat.uniforms.uTime.value = t;
    const show = t >= BEATS.pending + 0.75;
    this.pending.visible = show;
    // Hover while waiting, then settle onto the new node once it is ready.
    const land = Math.min(1, Math.max(0, (t - BEATS.ready) / 0.3));
    const e = land * land * (3 - 2 * land);
    const bob = land > 0 ? 0 : Math.sin(t * 9) * 0.25;
    this.pending.position.set(
      this.pendingStart[0],
      this.pendingStart[1] + (this.pendingEnd[1] - this.pendingStart[1]) * e + bob,
      this.pendingStart[2],
    );
    const c = land >= 1 ? LINE : SIGNAL;
    (this.pendingMat.uniforms.uColor.value as Color).setRGB(c[0], c[1], c[2]);
  }

  get sceneTime(): number {
    return this.time;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
