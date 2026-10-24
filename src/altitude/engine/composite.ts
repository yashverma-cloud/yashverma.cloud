/**
 * The final pass, at full resolution: sky, then the ground and the drawing, then the clouds
 * (upsampled with a Catmull-Rom filter), tone-mapped and dithered. Dithering matters here:
 * an 8-bit display bands a pre-dawn gradient badly without it.
 */
import { GLSL3, RawShaderMaterial, Vector2, Vector4, type Texture } from 'three';
import { COMMON, HAZE, HEADER, SKY, SKY_UNIFORMS, TONEMAP } from './glsl';
import { FullscreenPass, FULLSCREEN_VERT } from './pass';
import { shared } from './uniforms';

const FRAG = /* glsl */ `
${HEADER}
${COMMON}
${SKY_UNIFORMS}
${HAZE}
${SKY}
${TONEMAP}
uniform sampler2D uClouds;
uniform vec2 uCloudRes;
uniform sampler2D uScene;
uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
uniform vec2 uResolution;
uniform float uExposure;
uniform float uFrame;
uniform vec4 uScrimA;
uniform vec4 uScrimB;
uniform vec2 uScrimStrength;
uniform float uCloudsOn;
uniform float uBicubic;
out vec4 oColor;

// Catmull-Rom in nine bilinear taps (after TheRealMJP). Sharper than bilinear without
// the blockiness of point sampling, which matters at quarter resolution.
vec4 catmullRom(sampler2D tex, vec2 uv, vec2 res) {
  vec2 sp = uv * res;
  vec2 tp1 = floor(sp - 0.5) + 0.5;
  vec2 f = sp - tp1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 tp0 = (tp1 - 1.0) / res;
  vec2 tp3 = (tp1 + 2.0) / res;
  vec2 tp12 = (tp1 + w2 / w12) / res;
  vec4 r = vec4(0.0);
  r += texture(tex, vec2(tp0.x, tp0.y)) * w0.x * w0.y;
  r += texture(tex, vec2(tp12.x, tp0.y)) * w12.x * w0.y;
  r += texture(tex, vec2(tp3.x, tp0.y)) * w3.x * w0.y;
  r += texture(tex, vec2(tp0.x, tp12.y)) * w0.x * w12.y;
  r += texture(tex, vec2(tp12.x, tp12.y)) * w12.x * w12.y;
  r += texture(tex, vec2(tp3.x, tp12.y)) * w3.x * w12.y;
  r += texture(tex, vec2(tp0.x, tp3.y)) * w0.x * w3.y;
  r += texture(tex, vec2(tp12.x, tp3.y)) * w12.x * w3.y;
  r += texture(tex, vec2(tp3.x, tp3.y)) * w3.x * w3.y;
  return r;
}

float scrim(vec2 uv, vec4 s) {
  vec2 d = (uv - s.xy) / max(s.zw, vec2(1e-3));
  return exp(-dot(d, d) * 1.6);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec4 w = uInvViewProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize(w.xyz / w.w - uCamPos);
  vec3 col = skyColor(rd);
  vec4 s = texture(uScene, uv);
  col = s.rgb + col * (1.0 - s.a);
  if (uCloudsOn > 0.5) {
    vec4 c = uBicubic > 0.5 ? max(catmullRom(uClouds, uv, uCloudRes), vec4(0.0)) : texture(uClouds, uv);
    c.a = min(c.a, 1.0);
    col = c.rgb + col * (1.0 - c.a);
  }
  // Burn-in behind text blocks, as a printer would: a soft local darkening, never a panel.
  float burn = scrim(uv, uScrimA) * uScrimStrength.x + scrim(uv, uScrimB) * uScrimStrength.y;
  col *= 1.0 - clamp(burn, 0.0, 0.7);
  col = neutral(col * uExposure);
  col = toSRGB(col);
  col += (ign(gl_FragCoord.xy, uFrame) - 0.5) / 255.0;
  oColor = vec4(col, 1.0);
}
`;

export class Composite {
  readonly pass: FullscreenPass;
  readonly uniforms: Record<string, { value: unknown }>;

  constructor() {
    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uZenith: shared.uZenith,
        uSkyCol: shared.uSkyCol,
        uHorizon: shared.uHorizon,
        uSunward: shared.uSunward,
        uGlow: shared.uGlow,
        uHaze: shared.uHaze,
        uSunDir: shared.uSunDir,
        uGlowI: shared.uGlowI,
        uInvViewProj: shared.uInvViewProj,
        uCamPos: shared.uCamPos,
        uFrame: shared.uFrame,
        uResolution: shared.uResolution,
        uClouds: { value: null },
        uCloudRes: { value: new Vector2(1, 1) },
        uScene: { value: null },
        uExposure: { value: 1 },
        uScrimA: { value: new Vector4(0.2, 0.5, 0.3, 0.2) },
        uScrimB: { value: new Vector4(0.8, 0.5, 0.3, 0.2) },
        uScrimStrength: { value: new Vector2(0, 0) },
        uCloudsOn: { value: 1 },
        uBicubic: { value: 1 },
      },
    });
    this.pass = new FullscreenPass(material);
    this.uniforms = material.uniforms;
  }

  setInputs(clouds: Texture | null, cloudRes: { w: number; h: number }, scene: Texture): void {
    this.uniforms.uClouds.value = clouds;
    (this.uniforms.uCloudRes.value as Vector2).set(cloudRes.w, cloudRes.h);
    this.uniforms.uScene.value = scene;
  }
}
