/**
 * The WebGL hero scene — CLAUDE.md hero spec, design/notes.md §6.
 *
 * Camera match
 * ------------
 * The poster projects with  sx = KX(x - y),  sy = KY(x + y) - S·z,  KX = 0.866S, KY = 0.5S.
 * A standard isometric orthographic camera (looking from (1,1,1) at the origin) produces
 * exactly that shape: its screen basis gives (X - Z) horizontally and 0.816Y - 0.408(X + Z)
 * vertically, and both the horizontal:vertical ratio (1.732) and the ground:height ratio
 * (0.5) match the poster's. Only scale and centre have to be solved for, which is what
 * PX_PER_UNIT and the group offset below do.
 *
 * World mapping: three.X = x, three.Y = z (up), three.Z = y (ground).
 */

import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';

import {
  INGRESS,
  NODE_OFFSETS,
  POD_SLOT_OFFSETS,
  SCALE,
  VIEWBOX,
  ZONES,
} from './geometry';
import type { SimState, Simulation } from './simulation';

const TOKENS = {
  line: new Color('#eaf1f4'),
  muted: new Color('#8fa9c4'),
  rule: new Color('#5580b0'),
  signal: new Color('#f5a524'),
  deep: new Color('#0c2442'),
};

const PLATE_H = 1;
const NODE_H = 0.26;
const NODE_Z = 0.34;
const POD_H = 0.062;
const POD_Z = 0.1;

/** SVG pixels per projected world unit — see the camera-match note above. */
const PX_PER_UNIT = (0.866 * SCALE) / Math.SQRT1_2;

const MAX_DPR_POINTER = 1.75;
const MAX_DPR_TOUCH = 1.5;
const PARTICLES_POINTER = 28;
const PARTICLES_TOUCH = 14;
const PARTICLE_TRANSIT_MS = 2400;

interface Options {
  mount: HTMLElement;
  sim: Simulation;
  reduced: boolean;
}

interface NodeSlot {
  id: string;
  zone: string;
  /** World position of the node's centre, on the ground plane. */
  x: number;
  y: number;
}

/** Edges of an axis-aligned box, as line segments, for the blueprint wireframe. */
function boxEdges(hx: number, hy: number, hz: number): number[] {
  const c = [
    [-hx, 0, -hy],
    [hx, 0, -hy],
    [hx, 0, hy],
    [-hx, 0, hy],
    [-hx, hz, -hy],
    [hx, hz, -hy],
    [hx, hz, hy],
    [-hx, hz, hy],
  ];
  const pairs = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const out: number[] = [];
  for (const [a, b] of pairs) out.push(...c[a]!, ...c[b]!);
  return out;
}

function ringEdges(h: number): number[] {
  const c = [
    [-h, 0, -h],
    [h, 0, -h],
    [h, 0, h],
    [-h, 0, h],
  ];
  const out: number[] = [];
  for (let i = 0; i < 4; i += 1) out.push(...c[i]!, ...c[(i + 1) % 4]!);
  return out;
}

export function createScene({ mount, sim, reduced }: Options): (() => void) | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }

  const touch = window.matchMedia('(hover: none)').matches;
  const maxDpr = touch ? MAX_DPR_TOUCH : MAX_DPR_POINTER;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.setClearAlpha(0);
  mount.appendChild(renderer.domElement);

  const scene = new Scene();
  const world = new Group();
  scene.add(world);

  // --- Camera ---------------------------------------------------------------
  const aspect = VIEWBOX.w / VIEWBOX.h;
  const frustumW = VIEWBOX.w / PX_PER_UNIT;
  const frustumH = frustumW / aspect;
  const camera = new OrthographicCamera(
    -frustumW / 2,
    frustumW / 2,
    frustumH / 2,
    -frustumH / 2,
    -100,
    100,
  );
  const isoDir = new Vector3(1, 1, 1).normalize();
  camera.position.copy(isoDir.clone().multiplyScalar(30));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  // Shift the world so the poster's viewBox centre lands at screen centre.
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const centreX = (VIEWBOX.x + VIEWBOX.w / 2) / PX_PER_UNIT;
  const centreY = (VIEWBOX.y + VIEWBOX.h / 2) / PX_PER_UNIT;
  world.position.addScaledVector(right, -centreX);
  world.position.addScaledVector(up, centreY);

  // --- Layout ---------------------------------------------------------------
  const slots: NodeSlot[] = [];
  for (const zone of ZONES) {
    NODE_OFFSETS.forEach((offset, i) => {
      slots.push({
        id: `${zone.id}-${i}`,
        zone: zone.id,
        x: zone.d + offset,
        y: -zone.d - offset,
      });
    });
  }

  // --- Static linework: plates, ingress, links ------------------------------
  const staticVerts: number[] = [];
  for (const zone of ZONES) {
    const ring = ringEdges(PLATE_H);
    for (let i = 0; i < ring.length; i += 3) {
      staticVerts.push(ring[i]! + zone.d, ring[i + 1]!, ring[i + 2]! - zone.d);
    }
  }
  {
    const ring = ringEdges(INGRESS.h);
    for (let i = 0; i < ring.length; i += 3) {
      staticVerts.push(ring[i]! + INGRESS.cx, ring[i + 1]!, ring[i + 2]! + INGRESS.cy);
    }
  }
  const staticGeom = new BufferGeometry();
  staticGeom.setAttribute('position', new Float32BufferAttribute(staticVerts, 3));
  const staticLines = new LineSegments(
    staticGeom,
    new LineBasicMaterial({ color: TOKENS.rule, transparent: true, opacity: 0.85 }),
  );
  world.add(staticLines);

  // Ingress -> zone links, one segment per zone so they can dim independently.
  const linkVerts: number[] = [];
  const linkZones: string[] = [];
  for (const zone of ZONES) {
    linkVerts.push(
      INGRESS.cx, 0, INGRESS.cy + INGRESS.h,
      zone.d, 0, -zone.d - PLATE_H,
    );
    linkZones.push(zone.id);
  }
  const linkGeom = new BufferGeometry();
  linkGeom.setAttribute('position', new Float32BufferAttribute(linkVerts, 3));
  const linkMat = new LineBasicMaterial({ color: TOKENS.rule, transparent: true, opacity: 0.7 });
  const links = new LineSegments(linkGeom, linkMat);
  world.add(links);

  // --- Nodes: one instanced wireframe group, one draw call ------------------
  const nodeEdgeGeom = new BufferGeometry();
  nodeEdgeGeom.setAttribute(
    'position',
    new Float32BufferAttribute(boxEdges(NODE_H, NODE_H, NODE_Z), 3),
  );
  // Nodes are a solid body plus its edges, matching the poster — pure wireframe reads as
  // noise once nine of them overlap. The fill is very slightly inset so it cannot z-fight
  // with its own edges.
  const nodeFillGeom = new BoxGeometry(NODE_H * 2, NODE_Z, NODE_H * 2);
  nodeFillGeom.translate(0, NODE_Z / 2, 0);
  const nodeObjects = new Map<string, { edges: LineSegments; fill: Mesh }>();
  for (const slot of slots) {
    const edges = new LineSegments(
      nodeEdgeGeom,
      new LineBasicMaterial({ color: TOKENS.line, transparent: true }),
    );
    edges.position.set(slot.x, 0, slot.y);
    edges.renderOrder = 2;

    const fill = new Mesh(
      nodeFillGeom,
      new MeshBasicMaterial({ color: TOKENS.deep, transparent: true, opacity: 0.95 }),
    );
    fill.position.set(slot.x, 0, slot.y);
    fill.scale.setScalar(0.985);
    fill.renderOrder = 1;

    world.add(fill);
    world.add(edges);
    nodeObjects.set(slot.id, { edges, fill });
  }

  // --- Pods: one instanced group, one draw call -----------------------------
  // Solid blocks in the line colour, as the poster draws them.
  const podGeom = new BoxGeometry(POD_H * 2, POD_Z, POD_H * 2);
  podGeom.translate(0, POD_Z / 2, 0);
  const podMat = new MeshBasicMaterial({ color: TOKENS.line });
  const podSlotsTotal = slots.length * POD_SLOT_OFFSETS.length;
  const pods = new InstancedMesh(podGeom, podMat, podSlotsTotal);
  pods.instanceMatrix.setUsage(DynamicDrawUsage);
  pods.frustumCulled = false;
  pods.renderOrder = 3;
  world.add(pods);

  const podSlotIndex: Array<{ node: string; slot: number; x: number; y: number }> = [];
  for (const slot of slots) {
    POD_SLOT_OFFSETS.forEach(([dx, dy], i) => {
      podSlotIndex.push({ node: slot.id, slot: i, x: slot.x + dx, y: slot.y + dy });
    });
  }
  const slotById = new Map(slots.map((s) => [s.id, s]));

  /**
   * Pods lift off the failed node and arc to their new home rather than teleporting —
   * seeing the workload move is the point of the whole sequence.
   */
  interface PodFlight {
    index: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    start: number;
  }
  const flights: PodFlight[] = [];
  const POD_FLIGHT_MS = 900;
  const POD_FLIGHT_STAGGER = 150;
  let prevFilled: boolean[] = podSlotIndex.map(() => false);

  // --- Request particles: instanced, one draw call --------------------------
  const particleCount = reduced ? 0 : touch ? PARTICLES_TOUCH : PARTICLES_POINTER;
  const particleMat = new LineBasicMaterial({
    color: TOKENS.line,
    transparent: true,
    opacity: 0.9,
  });
  let particles: InstancedMesh | null = null;
  const dummy = new Object3D();
  const particleState: Array<{ zone: string; t: number }> = [];

  if (particleCount > 0) {
    const geom = new BufferGeometry();
    geom.setAttribute('position', new Float32BufferAttribute(boxEdges(0.045, 0.045, 0.045), 3));
    particles = new InstancedMesh(geom as BufferGeometry, particleMat, particleCount);
    particles.instanceMatrix.setUsage(DynamicDrawUsage);
    particles.frustumCulled = false;
    world.add(particles);
    for (let i = 0; i < particleCount; i += 1) {
      const zone = ZONES[i % ZONES.length]!;
      particleState.push({ zone: zone.id, t: Math.random() });
    }
  }

  // --- State ----------------------------------------------------------------
  let current: SimState = sim.snapshot();
  const unsubscribe = sim.subscribe((state) => {
    current = state;
    applyState(state);
  });

  function applyState(state: SimState): void {
    for (const node of state.nodes) {
      const obj = nodeObjects.get(node.id);
      if (!obj) continue;
      const edge = obj.edges.material as LineBasicMaterial;
      const fill = obj.fill.material as MeshBasicMaterial;
      if (node.status === 'failed') {
        edge.color.copy(TOKENS.signal);
        edge.opacity = 1;
        fill.color.copy(TOKENS.deep);
        obj.fill.visible = true;
      } else if (node.status === 'provisioning') {
        // Wireframe first, then solid — the replacement is visibly being built.
        edge.color.copy(TOKENS.muted);
        edge.opacity = 0.6;
        obj.fill.visible = false;
      } else {
        edge.color.copy(TOKENS.line);
        edge.opacity = 1;
        fill.color.copy(TOKENS.deep);
        obj.fill.visible = true;
      }
    }

    // Pods are placed by capacity slot; an unfilled slot is scaled to nothing rather than
    // removed, so the instance count and the draw call never change.
    const filledNow = podSlotIndex.map((entry) => {
      const node = state.nodes.find((n) => n.id === entry.node);
      return Boolean(node && entry.slot < node.pods);
    });

    // Slots that just filled while a node is down are arrivals from that node.
    const source = state.affected ? slotById.get(state.affected) : undefined;
    if (source) {
      let launched = 0;
      podSlotIndex.forEach((entry, i) => {
        if (filledNow[i] && !prevFilled[i] && entry.node !== state.affected) {
          flights.push({
            index: i,
            fromX: source.x,
            fromY: source.y,
            toX: entry.x,
            toY: entry.y,
            start: performance.now() + launched * POD_FLIGHT_STAGGER,
          });
          launched += 1;
        }
      });
    }
    prevFilled = filledNow;

    podSlotIndex.forEach((entry, i) => {
      dummy.position.set(entry.x, NODE_Z, entry.y);
      dummy.scale.setScalar(filledNow[i] ? 1 : 0.0001);
      dummy.updateMatrix();
      pods.setMatrixAt(i, dummy.matrix);
    });
    pods.instanceMatrix.needsUpdate = true;
  }

  /** Advances any in-flight pods. Called from the frame loop, after applyState. */
  function stepFlights(now: number): void {
    if (flights.length === 0) return;
    for (let i = flights.length - 1; i >= 0; i -= 1) {
      const f = flights[i]!;
      const t = (now - f.start) / POD_FLIGHT_MS;
      if (t < 0) {
        // Staggered and not yet away: hold it out of sight at the source.
        dummy.position.set(f.fromX, NODE_Z, f.fromY);
        dummy.scale.setScalar(0.0001);
      } else if (t >= 1) {
        flights.splice(i, 1);
        continue;
      } else {
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        dummy.position.set(
          f.fromX + (f.toX - f.fromX) * eased,
          NODE_Z + Math.sin(Math.PI * t) * 0.55,
          f.fromY + (f.toY - f.fromY) * eased,
        );
        dummy.scale.setScalar(1);
      }
      dummy.updateMatrix();
      pods.setMatrixAt(f.index, dummy.matrix);
    }
    pods.instanceMatrix.needsUpdate = true;
  }

  // --- Render loop ----------------------------------------------------------
  let raf = 0;
  let running = true;
  let last = performance.now();
  let slowFrames = 0;
  let degraded = false;

  function resize(): void {
    const rect = mount.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    renderer.setSize(rect.width, rect.height, false);
  }

  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = now - last;
    last = now;

    // Adaptive quality: sustained sub-50fps drops the particle count once.
    if (!degraded && dt > 20) {
      slowFrames += 1;
      if (slowFrames > 100 && particles) {
        particles.count = Math.max(4, Math.floor(particles.count / 2));
        degraded = true;
      }
    } else if (dt <= 20) {
      slowFrames = Math.max(0, slowFrames - 1);
    }

    if (particles && !reduced) {
      const step = dt / PARTICLE_TRANSIT_MS;
      for (let i = 0; i < particles.count; i += 1) {
        const p = particleState[i]!;
        p.t += step;
        if (p.t > 1) p.t -= 1;
        const zone = ZONES.find((z) => z.id === p.zone)!;
        const zoneNodes = current.nodes.filter((n) => n.zone === zone.id);
        const alive = zoneNodes.some((n) => n.status === 'ready');
        const sx = INGRESS.cx;
        const sy = INGRESS.cy + INGRESS.h;
        const ex = zone.d;
        const ey = -zone.d - PLATE_H;
        dummy.position.set(sx + (ex - sx) * p.t, 0.02, sy + (ey - sy) * p.t);
        dummy.scale.setScalar(alive ? 1 : 0.0001);
        dummy.updateMatrix();
        particles.setMatrixAt(i, dummy.matrix);
      }
      particles.instanceMatrix.needsUpdate = true;
    }

    stepFlights(now);

    // Camera breath: pointer devices only, off under reduced motion.
    if (!reduced && !touch) {
      const t = now / 12000;
      world.rotation.y = Math.sin(t * Math.PI * 2) * 0.026;
    }

    renderer.render(scene, camera);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(mount);
  resize();
  raf = requestAnimationFrame(frame);

  function stop(): void {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
  }
  function play(): void {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  const onVisibility = (): void => (document.hidden ? stop() : play());
  document.addEventListener('visibilitychange', onVisibility);

  const inView = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) entry.isIntersecting ? play() : stop();
    },
    { threshold: 0 },
  );
  inView.observe(mount);

  // --- Teardown -------------------------------------------------------------
  return function destroy(): void {
    stop();
    unsubscribe();
    observer.disconnect();
    inView.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    scene.traverse((obj: Object3D) => {
      const disposable = obj as unknown as {
        geometry?: { dispose(): void };
        material?: { dispose(): void } | Array<{ dispose(): void }>;
      };
      disposable.geometry?.dispose();
      const material = disposable.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
}
