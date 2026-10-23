/**
 * GLSL shared by the cloud methods, the ground and the composite. GLSL ES 3.00.
 */

export const HEADER = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler3D;
`;

export const COMMON = /* glsl */ `
#define PI 3.14159265359
float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec3 saturate(vec3 x) { return clamp(x, 0.0, 1.0); }
vec4 saturate(vec4 x) { return clamp(x, 0.0, 1.0); }
float remap(float v, float l0, float h0, float l1, float h1) {
  return l1 + (v - l0) * (h1 - l1) / (h0 - l0);
}
// Interleaved gradient noise (Jimenez), animated per frame. Cheap and well distributed,
// so temporal accumulation converges quickly; stands in for a blue-noise texture.
float ign(vec2 p, float frame) {
  p += 5.588238 * mod(frame, 64.0);
  return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y));
}
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 hash3(ivec3 c) { return vec3(pcg3d(uvec3(c))) * (1.0 / 4294967295.0); }
`;

/**
 * The sky, its haze and the aerial perspective. Palette uniforms come from world.ts.
 * `uSunDir` is the visible sun, which stays below the horizon until late in the descent.
 * Order in a shader: SKY_UNIFORMS, then HAZE, then SKY.
 */
export const SKY_UNIFORMS = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uSkyCol;
uniform vec3 uHorizon;
uniform vec3 uSunward;
uniform vec3 uGlow;
uniform vec3 uHaze;
uniform vec3 uSunDir;
uniform float uGlowI;
`;

export const SKY = /* glsl */ `
float sunAzimuth(vec3 dir) {
  vec2 h = normalize(dir.xz + vec2(1e-5));
  vec2 s = normalize(uSunDir.xz + vec2(1e-5));
  return dot(h, s) * 0.5 + 0.5;
}

vec3 horizonColor(vec3 dir) {
  float az = sunAzimuth(dir);
  return mix(uHorizon, uSunward, pow(az, 3.2));
}

vec3 skyColor(vec3 dir) {
  float y = max(dir.y, 0.0);
  float az = sunAzimuth(dir);
  vec3 c = mix(uHorizon, uSkyCol, smoothstep(0.0, 0.25, pow(y, 0.7)));
  c = mix(c, uZenith, smoothstep(0.15, 0.95, y));
  // The twilight band: thin, all along the horizon, strongest toward the sun.
  float band = exp(-y * 34.0) * (0.28 + 0.72 * pow(az, 2.2));
  c = mix(c, uSunward, band);
  c += uGlow * uGlowI * pow(az, 5.0) * exp(-y * 9.0) * 0.55;
  float cs = dot(dir, uSunDir);
  c += uGlow * uGlowI * 0.35 * pow(max(cs, 0.0), 60.0);
  c += uGlow * uGlowI * 1.6 * pow(max(cs, 0.0), 900.0);
  // The disc, once it has cleared the horizon.
  float disc = smoothstep(0.99986, 0.99994, cs) * smoothstep(-0.004, 0.004, dir.y);
  c += vec3(1.0, 0.86, 0.66) * 14.0 * disc * step(-0.01, uSunDir.y);
  if (dir.y < 0.0) c = mix(c, hazeColor0(dir), smoothstep(0.0, -0.035, dir.y));
  return c;
}
`;

/** Aerial perspective colour, declared before SKY so the sky can blend into it below the horizon. */
export const HAZE = /* glsl */ `
vec3 hazeColor0(vec3 dir) {
  vec2 h = normalize(dir.xz + vec2(1e-5));
  vec2 s = normalize(uSunDir.xz + vec2(1e-5));
  float az = dot(h, s) * 0.5 + 0.5;
  // What the sky looks like just above the horizon in this direction, a little cooler.
  vec3 band = mix(uHorizon, uSunward, 0.3 + 0.7 * az * az);
  return mix(uHaze, band, 0.22 + 0.38 * pow(az, 3.0));
}
`;

/** Neutral tone mapping (Khronos PBR Neutral): keeps hue, so the palette survives. */
export const TONEMAP = /* glsl */ `
vec3 neutral(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
vec3 toSRGB(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
`;
