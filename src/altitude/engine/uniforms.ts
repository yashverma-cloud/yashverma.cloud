/**
 * Uniforms shared by every pass. Materials hold references to these objects, so the engine
 * updates each value once per frame and every shader sees it.
 */
import { Color, Matrix4, Vector2, Vector3, Vector4 } from 'three';
import { keyElevation, LAYERS, palette, sunElevation, SUN_AZIMUTH, type Vec3 } from '../world';

const v3 = () => ({ value: new Vector3() });
const col = () => ({ value: new Color() });

export const shared = {
  uZenith: col(),
  uSkyCol: col(),
  uHorizon: col(),
  uSunward: col(),
  uGlow: col(),
  uHaze: col(),
  uGround: col(),
  uKeyCol: col(),
  uAmbTop: col(),
  uAmbBottom: col(),
  uSunDir: v3(),
  uKeyDir: v3(),
  uGlowI: { value: 1 },
  uStarsI: { value: 1 },
  uFogDensity: { value: 0.00009 },
  uTime: { value: 0 },
  uFrame: { value: 0 },
  uCamPos: v3(),
  uInvViewProj: { value: new Matrix4() },
  uViewProj: { value: new Matrix4() },
  uPrevViewProj: { value: new Matrix4() },
  uResolution: { value: new Vector2(1, 1) },
  uGeo: { value: LAYERS.map((l) => new Vector4(l.bottom, l.top, l.coverage, l.density)) },
  uShp: {
    value: LAYERS.map(
      (l) => new Vector4(1 / l.shapePeriod, 1 / l.detailPeriod, l.type, 1 / l.weatherPeriod),
    ),
  },
  /** The weather, set by the director every frame (engine/scene.ts): the deck's break, the
   *  wisps' clearing (x, z, radius, feather) and the survey grid under the drawing. */
  uBreak: { value: new Vector4(0, 0, 0, 1) },
  uWispClear: { value: new Vector4(0, 0, 0, 1) },
  uSite: { value: new Vector4(0, 0, 0, 0) },
  /** How strongly the survey grid is drawn, 0 to 1 (the director's weather). */
  uGridI: { value: 1 },
};

export type SharedUniforms = typeof shared;

function direction(azimuthDeg: number, elevationDeg: number, out: Vector3): Vector3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

function setColor(c: Color, v: Vec3, scale = 1): void {
  c.setRGB(v[0] * scale, v[1] * scale, v[2] * scale);
}

/** Applies the dawn palette to the shared uniforms; `sun` sets the visible disc's elevation apart from the dawn. */
export function applyDawn(dawn: number, sun?: number): void {
  const p = palette(dawn);
  setColor(shared.uZenith.value, p.zenith);
  setColor(shared.uSkyCol.value, p.sky);
  setColor(shared.uHorizon.value, p.horizon);
  setColor(shared.uSunward.value, p.sunward);
  setColor(shared.uGlow.value, p.glow);
  setColor(shared.uHaze.value, p.haze);
  setColor(shared.uGround.value, p.ground);
  setColor(shared.uKeyCol.value, p.key, p.keyI);
  setColor(shared.uAmbTop.value, p.ambTop, p.ambI);
  setColor(shared.uAmbBottom.value, p.ambBottom, p.ambI);
  shared.uGlowI.value = p.glowI;
  shared.uStarsI.value = p.starsI;
  direction(SUN_AZIMUTH, sun ?? sunElevation(dawn), shared.uSunDir.value);
  direction(SUN_AZIMUTH, keyElevation(dawn), shared.uKeyDir.value);
}
