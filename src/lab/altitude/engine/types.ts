import type { Texture, WebGLRenderer } from 'three';

/** Knobs the adaptive quality loop turns. Not every method uses every knob. */
export interface CloudQuality {
  /** Cloud buffer size as a fraction of the drawing buffer, per axis. */
  scale: number;
  /** 1 marches every pixel each frame; 2 marches one in four and reprojects the rest. */
  interleave: 1 | 2;
  steps: number;
  lightSteps: number;
  detail: boolean;
  /** Weight of a fresh sample against history; lower is smoother and slower to react. */
  freshBlend: number;
}

/**
 * A cloud renderer. Each draws premultiplied cloud colour into its own buffer, with
 * coverage in alpha, so the composite treats both methods identically.
 */
export interface CloudMethod {
  readonly name: 'raymarch' | 'billboard';
  readonly texture: Texture;
  readonly resolution: { w: number; h: number };
  setQuality(q: CloudQuality): void;
  resize(width: number, height: number): void;
  reset(): void;
  render(renderer: WebGLRenderer): void;
  dispose(): void;
}
