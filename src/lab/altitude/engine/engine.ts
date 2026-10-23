/**
 * The live scene: renderer, camera on the descent, clouds, ground, the drawing and the
 * composite, with adaptive quality. Loaded only after the page has rendered (main.ts).
 */
import {
  HalfFloatType,
  Matrix4,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { cameraAt, FOV, sceneClockAt, type CameraState } from '../world';
import { Blueprint } from './blueprint';
import { BillboardClouds } from './billboard';
import { Composite } from './composite';
import { createGround } from './ground';
import { generateCloudNoise, type CloudNoise } from './noise';
import { RaymarchClouds } from './raymarch';
import type { CloudMethod, CloudQuality } from './types';
import { applyDawn, shared } from './uniforms';

export type Tier = 'high' | 'mid' | 'low' | 'ultra' | 'poster';
export type MethodName = 'raymarch' | 'billboard';

interface TierSpec {
  dpr: number;
  maxPixels: number;
  clouds: CloudQuality;
}

export const TIERS: Record<Tier, TierSpec> = {
  ultra: {
    dpr: 2,
    maxPixels: 9e6,
    clouds: { scale: 1, interleave: 1, steps: 96, lightSteps: 6, detail: true, freshBlend: 0.08 },
  },
  // Offline poster renders: generous, and given many frames to converge.
  poster: {
    dpr: 1,
    maxPixels: 9e6,
    clouds: { scale: 0.62, interleave: 1, steps: 80, lightSteps: 6, detail: true, freshBlend: 0.1 },
  },
  high: {
    dpr: 1.75,
    maxPixels: 4.2e6,
    clouds: { scale: 0.5, interleave: 2, steps: 56, lightSteps: 5, detail: true, freshBlend: 0.32 },
  },
  mid: {
    dpr: 1.5,
    maxPixels: 2.4e6,
    clouds: { scale: 0.42, interleave: 2, steps: 40, lightSteps: 4, detail: true, freshBlend: 0.35 },
  },
  low: {
    dpr: 1.25,
    maxPixels: 1.3e6,
    clouds: { scale: 0.34, interleave: 2, steps: 30, lightSteps: 3, detail: false, freshBlend: 0.4 },
  },
};

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  method: MethodName;
  tier: Tier;
  /** Capture mode: no idle drift, no smoothing, frames rendered on request. */
  capture?: boolean;
  /** Forces the drawing buffer's pixel ratio (measurement only). */
  dpr?: number;
}

export interface FrameStats {
  fps: number;
  ms: number;
  cloudRes: string;
  drawRes: string;
  dpr: number;
  tier: Tier;
  method: MethodName;
  steps: number;
  gpu: string;
  cpuMs: { clouds: number; scene: number; composite: number };
}

/** Guesses a starting tier from the device; adaptive quality takes it from there. */
export function guessTier(gl: WebGL2RenderingContext | null): Tier {
  let gpu = '';
  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
  }
  const coarse = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const weakGpu = /Mali-(4|T|G3|G5[0-9])|Adreno \(TM\) ([3-5]\d\d|6[01]\d)|PowerVR|SwiftShader|llvmpipe|Intel\(R\) (HD|UHD) Graphics [1-6]\d\d\b/i.test(gpu);
  if (weakGpu || cores <= 4 || memory <= 3) return 'low';
  if (coarse) return 'mid';
  return 'high';
}

export class AltitudeEngine {
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly blueprint: Blueprint;
  private readonly canvas: HTMLCanvasElement;
  private readonly scene = new Scene();
  private readonly sceneRT: WebGLRenderTarget;
  private readonly composite = new Composite();
  private readonly ground: ReturnType<typeof createGround>;
  private noise!: CloudNoise;
  private clouds!: CloudMethod;
  private methodName: MethodName;
  private tier: Tier;
  private quality: CloudQuality;
  private dpr = 1;
  private readonly capture: boolean;
  private readonly dprOverride: number;
  private target = 0;
  private progress = 0;
  private sceneTime = 0;
  /** Negative: derive the drawing's clock from the flight. */
  private sceneTimeOverride = -1;
  private frame = 0;
  private emaMs = 16.7;
  private slowFor = 0;
  private readonly viewProj = new Matrix4();
  private readonly prevViewProj = new Matrix4();
  private readonly tmp = new Vector3();
  private state: CameraState;
  private orientation: 'landscape' | 'portrait' = 'landscape';
  private drift = { yaw: 0, pitch: 0, y: 0 };
  private listeners: ((s: AltitudeEngine) => void)[] = [];
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 0;
  private gpu = '';
  private readonly cpu = { clouds: 0, scene: 0, composite: 0 };
  /** Exposure follows the light: pre-dawn is kept dark, sunrise is held back. */
  exposure = 1;
  scrims = {
    a: [0.25, 0.5, 0.3, 0.25] as [number, number, number, number],
    b: [0.75, 0.5, 0.3, 0.25] as [number, number, number, number],
    strength: [0, 0] as [number, number],
  };

  constructor(opts: EngineOptions) {
    this.canvas = opts.canvas;
    this.capture = !!opts.capture;
    this.dprOverride = opts.dpr ?? 0;
    this.methodName = opts.method;
    this.tier = opts.tier;
    this.quality = { ...TIERS[opts.tier].clouds };
    this.renderer = new WebGLRenderer({
      canvas: opts.canvas,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: this.capture,
    });
    this.renderer.autoClear = false;
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    this.gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
    this.camera = new PerspectiveCamera(FOV.landscape, 1, 2, 140000);
    this.sceneRT = new WebGLRenderTarget(1, 1, { type: HalfFloatType, format: RGBAFormat, depthBuffer: true });
    this.ground = createGround(1);
    this.scene.add(this.ground.group);
    this.blueprint = new Blueprint();
    this.scene.add(this.blueprint.group);
    this.state = cameraAt(0, 'landscape');
  }

  /** Builds the noise and compiles every shader. Resolves when the first frame can be drawn. */
  async init(): Promise<void> {
    this.noise = generateCloudNoise(this.renderer);
    this.clouds = this.makeMethod(this.methodName);
    this.resize();
    applyDawn(0);
    this.updateCamera(0);
    await this.renderer.compileAsync(this.scene, this.camera);
    // Draw a few frames off-screen so the clouds have history before anyone sees them.
    for (let i = 0; i < 4; i++) this.draw(0);
  }

  private makeMethod(name: MethodName): CloudMethod {
    const m =
      name === 'raymarch'
        ? new RaymarchClouds(this.noise, this.quality)
        : new BillboardClouds(this.renderer, this.noise, this.quality, this.camera);
    m.resize(this.canvas.width, this.canvas.height);
    return m;
  }

  get method(): MethodName {
    return this.methodName;
  }

  setMethod(name: MethodName): void {
    if (name === this.methodName) return;
    this.clouds.dispose();
    this.methodName = name;
    this.clouds = this.makeMethod(name);
  }

  setTier(tier: Tier): void {
    this.tier = tier;
    this.quality = { ...TIERS[tier].clouds };
    this.clouds.setQuality(this.quality);
    this.resize();
  }

  /** Scroll progress through the page, 0 to 1. */
  setProgress(p: number, immediate = false): void {
    this.target = Math.min(1, Math.max(0, p));
    if (immediate || this.capture) this.progress = this.target;
  }

  /** Pins the drawing's clock (capture); a negative value hands it back to the flight. */
  setSceneTime(t: number): void {
    this.sceneTimeOverride = t;
  }

  onFrame(fn: (s: AltitudeEngine) => void): void {
    this.listeners.push(fn);
  }

  get cameraState(): CameraState {
    return this.state;
  }

  get drawingTime(): number {
    return this.sceneTime;
  }

  get viewportOrientation(): 'landscape' | 'portrait' {
    return this.orientation;
  }

  /** CSS size of the canvas, read on resize only: reading it per frame forces a layout. */
  private cssW = 1;
  private cssH = 1;

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.cssW = w;
    this.cssH = h;
    const spec = TIERS[this.tier];
    const device = window.devicePixelRatio || 1;
    this.dpr = Math.min(device, spec.dpr, Math.sqrt(spec.maxPixels / (w * h)));
    this.dpr = this.dprOverride > 0 ? this.dprOverride : Math.max(this.dpr, 0.5);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.orientation = w / h < 1 ? 'portrait' : 'landscape';
    this.camera.fov = FOV[this.orientation];
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const bw = this.canvas.width;
    const bh = this.canvas.height;
    this.sceneRT.setSize(bw, bh);
    shared.uResolution.value.set(bw, bh);
    this.ground.setDpr(this.dpr);
    this.blueprint.setViewport(bw, bh, this.dpr);
    this.clouds?.resize(bw, bh);
  }

  /** Projects a world point to CSS pixels; z > 1 means behind the camera. */
  project(p: [number, number, number], out: { x: number; y: number; visible: boolean }): void {
    this.tmp.set(p[0], p[1], p[2]).project(this.camera);
    const w = this.cssW;
    const h = this.cssH;
    out.x = (this.tmp.x * 0.5 + 0.5) * w;
    out.y = (-this.tmp.y * 0.5 + 0.5) * h;
    out.visible = this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.2 && Math.abs(this.tmp.y) < 1.2;
  }

  /** Screen height of the horizon in CSS pixels from the top. */
  horizonY(): number {
    const half = (this.camera.fov / 2) * (Math.PI / 180);
    const pitch = ((this.state.pitch + this.drift.pitch) * Math.PI) / 180;
    const ndc = Math.tan(-pitch) / Math.tan(half);
    return ((1 - ndc) / 2) * this.cssH;
  }

  private updateCamera(dt: number): void {
    if (!this.capture) {
      const k = 1 - Math.exp(-dt * 7);
      this.progress += (this.target - this.progress) * k;
      if (Math.abs(this.target - this.progress) < 1e-5) this.progress = this.target;
    }
    this.state = cameraAt(this.progress, this.orientation);
    const s = this.state;
    // A slow idle sway, strongest above the clouds where there is nothing else moving.
    if (!this.capture) {
      const t = performance.now() / 1000;
      const calm = 1 - Math.min(1, this.progress / 0.5) * 0.6;
      this.drift.yaw = Math.sin(t * 0.07) * 0.9 * calm;
      this.drift.pitch = Math.sin(t * 0.053 + 1.3) * 0.25 * calm;
      this.drift.y = Math.sin(t * 0.045 + 0.4) * 18 * calm;
    }
    const yaw = ((s.yaw + this.drift.yaw) * Math.PI) / 180;
    const pitch = ((s.pitch + this.drift.pitch) * Math.PI) / 180;
    this.camera.position.set(s.pos[0], s.pos[1] + this.drift.y, s.pos[2]);
    this.camera.rotation.set(pitch, -yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld(true);
    this.prevViewProj.copy(this.viewProj);
    this.viewProj.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    shared.uPrevViewProj.value.copy(this.prevViewProj);
    shared.uViewProj.value.copy(this.viewProj);
    shared.uInvViewProj.value.copy(this.viewProj).invert();
    shared.uCamPos.value.copy(this.camera.position);
    applyDawn(s.dawn);
    // Below the deck the light is brighter; the exposure keeps it from blowing out.
    this.exposure = 1.05 - s.dawn * 0.22;
  }

  private draw(dt: number): void {
    this.updateCamera(dt);
    shared.uFrame.value = this.frame++;
    if (!this.capture) shared.uTime.value += dt;
    this.sceneTime = this.sceneTimeOverride >= 0 ? this.sceneTimeOverride : sceneClockAt(this.progress);
    this.blueprint.update(this.sceneTime, this.state.pos[1]);
    // Above the cloud sea the ground is hidden; skip its shading entirely.
    this.ground.group.visible = this.state.pos[1] < 1950;

    const t0 = performance.now();
    this.clouds.render(this.renderer);
    const t1 = performance.now();

    this.renderer.setRenderTarget(this.sceneRT);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear(true, true, false);
    this.renderer.render(this.scene, this.camera);
    const t2 = performance.now();

    const u = this.composite.uniforms;
    this.composite.setInputs(this.clouds.texture, this.clouds.resolution, this.sceneRT.texture);
    // Nine taps per pixel is the composite's main cost; weaker tiers take one.
    u.uBicubic.value = this.tier === 'mid' || this.tier === 'low' ? 0 : 1;
    u.uExposure.value = this.exposure;
    (u.uScrimA.value as { set: (...n: number[]) => void }).set(...this.scrims.a);
    (u.uScrimB.value as { set: (...n: number[]) => void }).set(...this.scrims.b);
    (u.uScrimStrength.value as { set: (...n: number[]) => void }).set(...this.scrims.strength);
    this.composite.pass.render(this.renderer, null);
    const t3 = performance.now();
    // Main-thread cost of each pass (command submission, not GPU time).
    this.cpu.clouds += (t1 - t0 - this.cpu.clouds) * 0.1;
    this.cpu.scene += (t2 - t1 - this.cpu.scene) * 0.1;
    this.cpu.composite += (t3 - t2 - this.cpu.composite) * 0.1;
    for (const fn of this.listeners) fn(this);
  }

  /** One frame, driven by the page's own clock (live.ts) so copy and scene stay in step. */
  tick(dt: number): void {
    this.track(dt);
    this.draw(dt);
  }


  /** Steps quality down if frames stay slow; never thrashes back up. */
  private track(dt: number): void {
    const ms = dt * 1000;
    this.emaMs += (ms - this.emaMs) * 0.08;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    if (this.capture) return;
    if (this.emaMs > 21) this.slowFor += dt;
    else this.slowFor = Math.max(0, this.slowFor - dt * 0.5);
    if (this.slowFor > 1.5) {
      this.slowFor = 0;
      this.stepDown();
    }
  }

  private stepDown(): void {
    const q = this.quality;
    if (q.scale > 0.28) q.scale = Math.round((q.scale - 0.06) * 100) / 100;
    else if (q.steps > 24) q.steps -= 8;
    else if (q.lightSteps > 2) q.lightSteps -= 1;
    else if (this.dpr > 0.8) {
      TIERS[this.tier] = { ...TIERS[this.tier], dpr: Math.max(0.75, this.dpr - 0.25) };
      this.resize();
      return;
    } else return;
    this.clouds.setQuality(q);
  }

  stats(): FrameStats {
    const r = this.clouds.resolution;
    return {
      fps: this.fps,
      ms: this.emaMs,
      cloudRes: `${r.w}×${r.h}`,
      drawRes: `${this.canvas.width}×${this.canvas.height}`,
      dpr: this.dpr,
      tier: this.tier,
      method: this.methodName,
      steps: this.quality.steps,
      gpu: this.gpu,
      cpuMs: { ...this.cpu },
    };
  }

  /** Capture mode: renders `frames` frames at progress `p` and scene time `t`. */
  renderAt(p: number, t = -1, frames = 1, time = 0): void {
    this.setProgress(p, true);
    this.sceneTimeOverride = t;
    shared.uTime.value = time;
    for (let i = 0; i < frames; i++) this.draw(1 / 60);
  }

  dispose(): void {
    this.clouds?.dispose();
    this.noise?.dispose();
    this.sceneRT.dispose();
    this.ground.dispose();
    this.blueprint.dispose();
    this.renderer.dispose();
  }
}
