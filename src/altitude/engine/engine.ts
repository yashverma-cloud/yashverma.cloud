/**
 * The live scene: renderer, camera, clouds, ground, one drawing and the composite, with
 * adaptive quality. Loaded only after the page has rendered. What is drawn (a DrawingScene)
 * and how the camera moves (a Director) come from the page, so one engine serves the home
 * page's descent, each case study's opening scene and the style guide.
 */
import { HalfFloatType, Matrix4, PerspectiveCamera, RGBAFormat, Scene, Vector3, WebGLRenderer, WebGLRenderTarget } from 'three';
import { FOV, type CameraState, type Orientation } from '../world';
import { Composite } from './composite';
import { createGround } from './ground';
import { generateCloudNoise, type CloudNoise } from './noise';
import { RaymarchClouds } from './raymarch';
import type { Director, DrawingScene } from './scene';
import type { CloudQuality } from './types';
import { applyDawn, shared } from './uniforms';

export type Tier = 'high' | 'mid' | 'low' | 'ultra' | 'poster';

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
  tier: Tier;
  scene: DrawingScene;
  director: Director;
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
  readonly scene: DrawingScene;
  readonly director: Director;
  private readonly canvas: HTMLCanvasElement;
  private readonly world = new Scene();
  private readonly sceneRT: WebGLRenderTarget;
  private readonly composite = new Composite();
  private readonly ground: ReturnType<typeof createGround>;
  private noise: CloudNoise | null = null;
  private clouds: RaymarchClouds | null = null;
  private tier: Tier;
  private quality: CloudQuality;
  private dpr = 1;
  private readonly capture: boolean;
  private readonly dprOverride: number;
  private target = 0;
  private progress = 0;
  private sceneTime = 0;
  /** Negative: the director's clock runs the drawing; otherwise the drawing is pinned here. */
  private sceneTimeOverride = -1;
  private frame = 0;
  private emaMs = 16.7;
  private slowFor = 0;
  private readonly viewProj = new Matrix4();
  private readonly prevViewProj = new Matrix4();
  private readonly tmp = new Vector3();
  private state: CameraState;
  private orientation: Orientation = 'landscape';
  private drift = { yaw: 0, pitch: 0, y: 0 };
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
    this.tier = opts.tier;
    this.quality = { ...TIERS[opts.tier].clouds };
    this.scene = opts.scene;
    this.director = opts.director;
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
    // No depth buffer: the drawing is painted in order (kit.ts) and the ground lies beneath it.
    this.sceneRT = new WebGLRenderTarget(1, 1, { type: HalfFloatType, format: RGBAFormat, depthBuffer: false });
    this.ground = createGround(1);
    this.world.add(this.ground.group);
    this.world.add(this.scene.group);
    this.state = this.director.camera(0, 'landscape');
  }

  /** Builds the noise and compiles every shader. Resolves when the first frame can be drawn. */
  async init(): Promise<void> {
    if (this.director.clouds) {
      this.noise = generateCloudNoise(this.renderer);
      this.clouds = new RaymarchClouds(this.noise, this.quality);
    }
    this.resize();
    applyDawn(0);
    this.updateCamera(0);
    await this.renderer.compileAsync(this.world, this.camera);
    // Draw a few frames off-screen so the clouds have history before anyone sees them.
    for (let i = 0; i < (this.clouds ? 4 : 1); i++) this.draw(0);
  }

  setTier(tier: Tier): void {
    this.tier = tier;
    this.quality = { ...TIERS[tier].clouds };
    this.clouds?.setQuality(this.quality);
    this.resize();
  }

  /** Progress through the page, 0 to 1 (or to the director's `end`). */
  setProgress(p: number, immediate = false): void {
    this.target = Math.min(this.director.end ?? 1, Math.max(0, p));
    if (immediate || this.capture) this.progress = this.target;
  }

  /** Pins the drawing's clock; a negative value hands it back to the director. */
  setSceneTime(t: number): void {
    this.sceneTimeOverride = t;
  }

  get cameraState(): CameraState {
    return this.state;
  }

  get drawingTime(): number {
    return this.sceneTime;
  }

  get viewportOrientation(): Orientation {
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
    this.scene.setViewport(bw, bh, this.dpr, this.camera.near);
    this.clouds?.resize(bw, bh);
  }

  /** Projects a world point to CSS pixels; `visible` is false behind the camera or off screen. */
  project(p: [number, number, number], out: { x: number; y: number; visible: boolean }): void {
    this.tmp.set(p[0], p[1], p[2]).project(this.camera);
    out.x = (this.tmp.x * 0.5 + 0.5) * this.cssW;
    out.y = (-this.tmp.y * 0.5 + 0.5) * this.cssH;
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
    this.state = this.director.camera(this.progress, this.orientation);
    const s = this.state;
    // A slow idle sway, strongest where nothing else moves.
    if (!this.capture) {
      const t = performance.now() / 1000;
      const calm = this.director.drift(this.progress);
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
    applyDawn(s.dawn, s.sun);
    const w = this.director.weather(this.progress);
    shared.uBreak.value.set(...w.deck);
    shared.uWispClear.value.set(...w.wisps);
    shared.uSite.value.set(...w.site);
    // Below the deck the light is brighter; the exposure keeps it from blowing out.
    this.exposure = 1.05 - s.dawn * 0.22;
  }

  private draw(dt: number): void {
    this.updateCamera(dt);
    shared.uFrame.value = this.frame++;
    if (!this.capture) shared.uTime.value += dt;
    this.sceneTime = this.sceneTimeOverride >= 0 ? this.sceneTimeOverride : this.director.clock(this.progress);
    this.scene.update(this.sceneTime, this.state);
    this.ground.group.visible = this.director.groundVisible(this.state);

    const t0 = performance.now();
    this.clouds?.render(this.renderer);
    const t1 = performance.now();

    this.renderer.setRenderTarget(this.sceneRT);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear(true, false, false);
    this.renderer.render(this.world, this.camera);
    const t2 = performance.now();

    const u = this.composite.uniforms;
    this.composite.setInputs(this.clouds?.texture ?? null, this.clouds?.resolution ?? { w: 1, h: 1 }, this.sceneRT.texture);
    u.uCloudsOn.value = this.clouds ? 1 : 0;
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
  }

  /** One frame, driven by the page's own clock so copy and scene stay in step. */
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
    if (this.clouds && q.scale > 0.28) q.scale = Math.round((q.scale - 0.06) * 100) / 100;
    else if (this.clouds && q.steps > 24) q.steps -= 8;
    else if (this.clouds && q.lightSteps > 2) q.lightSteps -= 1;
    else if (this.dpr > 0.8) {
      TIERS[this.tier] = { ...TIERS[this.tier], dpr: Math.max(0.75, this.dpr - 0.25) };
      this.resize();
      return;
    } else return;
    this.clouds?.setQuality(q);
  }

  stats(): FrameStats {
    const r = this.clouds?.resolution ?? { w: 0, h: 0 };
    return {
      fps: this.fps,
      ms: this.emaMs,
      cloudRes: this.clouds ? `${r.w}×${r.h}` : 'off',
      drawRes: `${this.canvas.width}×${this.canvas.height}`,
      dpr: this.dpr,
      tier: this.tier,
      steps: this.quality.steps,
      gpu: this.gpu,
      cpuMs: { ...this.cpu },
    };
  }

  /** Capture mode: renders `frames` frames at progress `p` and drawing time `t`. */
  renderAt(p: number, t = -1, frames = 1, time = 0): void {
    this.setProgress(p, true);
    this.sceneTimeOverride = t;
    shared.uTime.value = time;
    for (let i = 0; i < frames; i++) this.draw(1 / 60);
  }

  /** Renders one frame now, at the current progress (used when nothing is scrolling). */
  renderNow(): void {
    this.draw(0);
  }

  dispose(): void {
    this.clouds?.dispose();
    this.noise?.dispose();
    this.sceneRT.dispose();
    this.ground.dispose();
    this.scene.dispose();
    this.renderer.dispose();
  }
}
