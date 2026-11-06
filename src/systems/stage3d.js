// The 3D stage: a real room drawn with WebGL2, the chapter's cast standing in it
// as depth-sorted billboards, one sun with a shadow map, ACES tonemapping.
//
// The cast never becomes geometry — the art pack stays 2D (see docs/3d.md). What
// changes is the format of the stage: perspective camera, ground contact, light
// and shadow, and a render target that goes up to 4K.
//
// Everything that decides *where* things are is a pure function, so
// tools/stage3d-check.mjs can test the staging without a GPU.

import {
  add,
  buffer,
  canvasTexture,
  compose,
  contextOf,
  cross,
  dot,
  lookAt,
  multiply,
  normal,
  orthographic,
  perspective,
  program,
  scale,
  shadowTarget,
  sub,
} from './gl.js';

/* ---------- tuning ---------- */

const ROOM = { width: 6.8, height: 2.6, backZ: -2.6, frontZ: 3.4 };
const EYE = [0, 1.3, 3.2];
const LOOK = [0, 0.74, -2.6];
const FOV = (40 * Math.PI) / 180;
const SHADOW_SIZE = 2048;
const MAX_CAST = 12;

// `.obj[data-size]` heights in styles/main.css, as a fraction of the stage box.
const SIZE = { sm: 0.16, md: 0.24, lg: 0.38, xl: 0.52 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ---------- palettes: one look per chapter backdrop ---------- */

export const PALETTES = {
  nursery: {
    wall: [0.26, 0.22, 0.3],
    wallPattern: 1,
    floor: [0.3, 0.22, 0.15],
    floorPattern: 2,
    rug: [0.3, 0.16, 0.19],
    trim: [0.36, 0.32, 0.34],
    wood: [0.28, 0.19, 0.12],
    sunDir: [0.42, 0.66, -0.62],
    sunColor: [0.72, 0.86, 1.05],
    sunStrength: 3.2,
    fillStrength: 0.62,
    ambSky: [0.26, 0.3, 0.4],
    ambGround: [0.14, 0.12, 0.12],
    lamp: [1.55, 0.86, 0.42],
    lampStrength: 4.6,
    window: [1.5, 1.7, 2.1],
    exposure: 1.24,
  },
  yard: {
    wall: [0.16, 0.26, 0.16],
    wallPattern: 3,
    floor: [0.16, 0.24, 0.12],
    floorPattern: 4,
    rug: [0.3, 0.25, 0.14],
    trim: [0.3, 0.34, 0.26],
    wood: [0.3, 0.24, 0.16],
    sunDir: [0.2, 0.72, -0.66],
    sunColor: [1.5, 1.32, 0.95],
    sunStrength: 3.0,
    fillStrength: 0.85,
    ambSky: [0.24, 0.34, 0.42],
    ambGround: [0.12, 0.14, 0.1],
    lamp: [1.1, 0.8, 0.5],
    lampStrength: 0.6,
    window: [2.0, 2.2, 2.4],
    exposure: 1.1,
  },
  kindergarten: {
    wall: [0.32, 0.27, 0.3],
    wallPattern: 1,
    floor: [0.3, 0.24, 0.19],
    floorPattern: 2,
    rug: [0.2, 0.24, 0.3],
    trim: [0.4, 0.36, 0.34],
    wood: [0.3, 0.22, 0.15],
    sunDir: [0.1, 0.86, -0.5],
    sunColor: [1.05, 1.1, 1.0],
    sunStrength: 2.2,
    fillStrength: 0.7,
    ambSky: [0.2, 0.21, 0.24],
    ambGround: [0.11, 0.1, 0.11],
    lamp: [1.2, 1.1, 0.95],
    lampStrength: 2.4,
    window: [1.3, 1.45, 1.5],
    exposure: 1.12,
  },
  classroom: {
    wall: [0.22, 0.24, 0.24],
    wallPattern: 1,
    floor: [0.26, 0.2, 0.15],
    floorPattern: 2,
    rug: [0.18, 0.2, 0.2],
    trim: [0.3, 0.33, 0.32],
    wood: [0.26, 0.19, 0.13],
    sunDir: [0.72, 0.5, -0.48],
    sunColor: [1.3, 1.18, 0.92],
    sunStrength: 2.8,
    fillStrength: 0.68,
    ambSky: [0.18, 0.21, 0.23],
    ambGround: [0.1, 0.1, 0.1],
    lamp: [1.2, 1.05, 0.8],
    lampStrength: 1.6,
    window: [1.6, 1.6, 1.5],
    exposure: 1.12,
  },
  evening: {
    wall: [0.16, 0.17, 0.26],
    wallPattern: 1,
    floor: [0.16, 0.14, 0.16],
    floorPattern: 2,
    rug: [0.16, 0.15, 0.24],
    trim: [0.24, 0.24, 0.3],
    wood: [0.2, 0.15, 0.13],
    sunDir: [-0.3, 0.5, -0.8],
    sunColor: [0.4, 0.5, 0.9],
    sunStrength: 1.2,
    fillStrength: 0.3,
    ambSky: [0.14, 0.17, 0.32],
    ambGround: [0.08, 0.08, 0.13],
    lamp: [1.5, 0.95, 0.55],
    lampStrength: 5.4,
    window: [0.55, 0.7, 1.35],
    exposure: 1.2,
  },
};

/* ---------- camera ---------- */

/** Camera basis for an aspect, with a little drift for parallax. */
export function cameraFor(aspect, drift = { x: 0, y: 0, z: 0 }) {
  const eye = [EYE[0] + (drift.x || 0), EYE[1] + (drift.y || 0), EYE[2] + (drift.z || 0)];
  const target = [LOOK[0], LOOK[1], LOOK[2]];
  const forward = normal(sub(target, eye));
  const right = normal(cross(forward, [0, 1, 0]));
  const up = normal(cross(right, forward));
  return {
    eye,
    target,
    forward,
    right,
    up,
    fov: FOV,
    aspect,
    view: lookAt(eye, target),
    projection: perspective(FOV, aspect, 0.1, 40),
  };
}

/** Ray through a point given in stage percentages (y grows downwards). */
export function rayFor(camera, xPercent, yPercent) {
  const sx = (xPercent / 100) * 2 - 1;
  const sy = 1 - (yPercent / 100) * 2;
  const th = Math.tan(camera.fov / 2);
  return normal(
    add(add(scale(camera.right, sx * th * camera.aspect), scale(camera.up, sy * th)), camera.forward),
  );
}

/**
 * Where a cast member stands. Grounded entries are found by dropping the stage
 * ray onto the floor, so a figure at y=94% stands close to the lens and one at
 * y=84% further back; anything above the horizon (sun, moon, the icon cards)
 * gets pinned to the back wall instead.
 */
export function castPlacement(entry, camera) {
  const dir = rayFor(camera, entry.x, entry.y);
  let point = null;
  if (dir[1] < -1e-4) {
    const t = -camera.eye[1] / dir[1];
    const hit = add(camera.eye, scale(dir, t));
    if (hit[2] < ROOM.frontZ && hit[2] > ROOM.backZ) point = hit;
  }
  if (!point) {
    const t = (ROOM.backZ - camera.eye[2]) / (dir[2] || -1e-4);
    point = add(camera.eye, scale(dir, Math.max(t, 0.5)));
  }
  const origin = [
    clamp(point[0], -ROOM.width / 2 + 0.15, ROOM.width / 2 - 0.15),
    clamp(point[1], 0, ROOM.height - 0.04),
    clamp(point[2], ROOM.backZ + 0.06, ROOM.frontZ - 0.4),
  ];
  const depth = Math.max(dot(sub(origin, camera.eye), camera.forward), 0.5);
  const stageHeight = 2 * Math.tan(camera.fov / 2) * depth;
  const height = (SIZE[entry.size] || SIZE.md) * stageHeight;
  return { origin, height, depth, grounded: origin[1] < 0.02 };
}

/** Canvas size for a given on-screen box, capped to a rendering budget. */
/** Canvas size for a box: device pixels, unless an exact height was asked for. */
export function resolutionFor(cssWidth, cssHeight, dpr = 1, cap = 1440, exact = false) {
  const w = Math.max(1, cssWidth);
  const h = Math.max(1, cssHeight);
  const devicePixels = Math.round(h * Math.min(dpr, 2));
  const height = Math.max(1, exact ? cap : Math.min(devicePixels, cap));
  return { width: Math.max(1, Math.round(height * (w / h))), height };
}

/**
 * `?render=1080|1440|2160|4k` — the cap, and whether it was asked for explicitly.
 * An explicit ask supersamples: 4K is a screenshot setting, not a default, and
 * no 880 px stage reaches 2160 lines on its own.
 */
export function renderAsk(search = '') {
  const match = /[?&]render=([a-z0-9]+)/i.exec(search || '');
  const value = match ? match[1].toLowerCase() : '';
  if (value === '4k' || value === '2160' || value === 'native') return { cap: 2160, exact: true };
  if (value === '1080') return { cap: 1080, exact: true };
  if (value === '1440') return { cap: 1440, exact: true };
  return { cap: 1440, exact: false };
}

/** The cap alone, for callers that only care about the number. */
export function renderCap(search = '') {
  return renderAsk(search).cap;
}

/* ---------- the set ---------- */

const box = (center, size, look, rot = 0) => ({ center, size, rot, ...look });

/**
 * The room the chapter is played in: shell, window, door, crib, table, rug.
 * Every piece is an axis-aligned box, which is all one shader and one VBO need.
 */
export function roomPlan(p, bg = 'nursery') {
  const W = ROOM.width;
  const H = ROOM.height;
  const back = ROOM.backZ;
  const midZ = (back + ROOM.frontZ) / 2;
  const depth = ROOM.frontZ - back;

  const wall = { pattern: p.wallPattern, color: p.wall, rough: 0.95 };
  const floor = { pattern: p.floorPattern, color: p.floor, rough: 0.7 };
  const trim = { pattern: 4, color: p.trim, rough: 0.6 };
  const wood = { pattern: 4, color: p.wood, rough: 0.62 };
  const glass = { pattern: 0, color: p.window, rough: 1, glow: 1 };

  const boxes = [
    // shell: floor slab, back wall, sides, ceiling
    box([0, -0.05, midZ], [W, 0.1, depth], floor),
    box([0, H / 2, back - 0.03], [W, H, 0.06], wall),
    box([-W / 2 - 0.03, H / 2, midZ], [0.06, H, depth], wall),
    box([W / 2 + 0.03, H / 2, midZ], [0.06, H, depth], wall),
    box([0, H + 0.03, midZ], [W, 0.06, depth], wall),
    // skirting along the back wall, which is what makes a wall meet a floor
    box([0, 0.06, back + 0.02], [W, 0.12, 0.05], trim),

    // window, right of centre, with a sill deep enough to catch light
    box([1.55, 1.72, back - 0.01], [1.06, 0.92, 0.02], glass),
    box([1.55, 2.2, back + 0.02], [1.2, 0.07, 0.08], trim),
    box([1.55, 1.24, back + 0.02], [1.2, 0.07, 0.08], trim),
    box([0.99, 1.72, back + 0.02], [0.07, 0.92, 0.08], trim),
    box([2.11, 1.72, back + 0.02], [0.07, 0.92, 0.08], trim),
    box([1.55, 1.72, back + 0.01], [0.04, 0.92, 0.05], trim),
    box([1.55, 1.72, back + 0.01], [1.06, 0.04, 0.05], trim),
    box([1.55, 1.18, back + 0.08], [1.3, 0.06, 0.2], trim),

    // door on the left of the back wall
    box([-2.15, 1.02, back + 0.03], [0.94, 2.04, 0.05], wood),
    box([-2.15, 2.08, back + 0.04], [1.06, 0.09, 0.1], trim),
    box([-2.65, 1.02, back + 0.04], [0.06, 2.04, 0.1], trim),
    box([-1.65, 1.02, back + 0.04], [0.06, 2.04, 0.1], trim),
    box([-1.79, 1.02, back + 0.1], [0.05, 0.05, 0.05], trim),

    // shelf with two board books
    box([2.62, 1.95, back + 0.22], [0.92, 0.05, 0.2], wood),
    box([2.44, 2.07, back + 0.22], [0.09, 0.22, 0.15], { pattern: 0, color: [0.4, 0.16, 0.14], rough: 0.75 }),
    box([2.58, 2.05, back + 0.22], [0.07, 0.18, 0.14], { pattern: 0, color: [0.16, 0.3, 0.38], rough: 0.75 }),

    // crib: base, mattress, four posts, two rails and the bars a baby sees
    box([-2.35, 0.4, -1.5], [1.34, 0.14, 0.78], wood),
    box([-2.35, 0.53, -1.5], [1.26, 0.14, 0.7], { pattern: 3, color: [0.32, 0.3, 0.29], rough: 0.92 }),
    box([-2.99, 0.66, -1.86], [0.07, 0.86, 0.07], wood),
    box([-1.71, 0.66, -1.86], [0.07, 0.86, 0.07], wood),
    box([-2.99, 0.66, -1.14], [0.07, 0.86, 0.07], wood),
    box([-1.71, 0.66, -1.14], [0.07, 0.86, 0.07], wood),
    box([-2.35, 0.95, -1.86], [1.34, 0.06, 0.06], wood),
    box([-2.35, 0.95, -1.14], [1.34, 0.06, 0.06], wood),

    // table on the right, and the mug left on it
    box([2.0, 0.61, -1.0], [1.05, 0.06, 0.6], wood),
    box([1.56, 0.29, -1.24], [0.06, 0.58, 0.06], wood),
    box([2.44, 0.29, -1.24], [0.06, 0.58, 0.06], wood),
    box([1.56, 0.29, -0.76], [0.06, 0.58, 0.06], wood),
    box([2.44, 0.29, -0.76], [0.06, 0.58, 0.06], wood),
    box([1.78, 0.69, -1.0], [0.11, 0.11, 0.11], { pattern: 0, color: [0.5, 0.46, 0.4], rough: 0.35 }),

    // rug, the one soft surface in the room
    box([-0.1, 0.012, -0.35], [3.0, 0.02, 1.9], { pattern: 3, color: p.rug, rough: 0.96 }),

    // hanging lamp: the warm practical the nursery is lit by
    box([-0.35, 2.42, -1.05], [0.02, 0.4, 0.02], trim),
    box([-0.35, 2.1, -1.05], [0.28, 0.22, 0.28], { pattern: 0, color: [0.95, 0.78, 0.52], rough: 0.45, glow: 0.85 }),

    // two blocks on the floor, so the room reads as played in
    box([-0.95, 0.07, 0.55], [0.14, 0.14, 0.14], { pattern: 4, color: [0.46, 0.28, 0.2], rough: 0.6 }),
    box([-0.62, 0.05, 0.78], [0.1, 0.1, 0.1], { pattern: 4, color: [0.24, 0.34, 0.4], rough: 0.6 }),
  ];

  // the crib's bars: only the near side, the far side is behind them anyway
  for (let i = 0; i < 6; i += 1) {
    boxes.push(box([-2.9 + i * 0.22, 0.74, -1.86], [0.035, 0.42, 0.035], wood));
  }

  if (bg === 'classroom') {
    boxes.push(
      box([0, 1.5, back + 0.04], [2.4, 1.2, 0.05], { pattern: 0, color: [0.06, 0.13, 0.11], rough: 0.85 }),
      box([0, 0.88, back + 0.09], [2.4, 0.05, 0.1], trim),
    );
  }

  return boxes;
}

/** Where the lamp hangs, in world space. */
export const LAMP = [-0.35, 2.0, -1.05];

/* ---------- geometry ---------- */

/** 36 interleaved position/normal vertices: one unit cube, flat faces. */
export function cubeGeometry() {
  const faces = [
    { n: [0, 0, 1], v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
    { n: [0, 0, -1], v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
    { n: [1, 0, 0], v: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] },
    { n: [-1, 0, 0], v: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] },
    { n: [0, 1, 0], v: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
    { n: [0, -1, 0], v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
  ];
  const order = [0, 1, 2, 0, 2, 3];
  const out = new Float32Array(36 * 6);
  let at = 0;
  for (const face of faces) {
    for (const index of order) {
      const v = face.v[index];
      out[at++] = v[0];
      out[at++] = v[1];
      out[at++] = v[2];
      out[at++] = face.n[0];
      out[at++] = face.n[1];
      out[at++] = face.n[2];
    }
  }
  return out;
}

/** A billboard quad: x in [-0.5, 0.5], y in [0, 1], so its base sits on the floor. */
export function quadGeometry() {
  const v = [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 0], [0.5, 1], [-0.5, 1]];
  return new Float32Array(v.flat());
}

/* ---------- shaders ---------- */

export const SHADOW_GLSL = `
float shadowAt(sampler2D map, vec4 lc) {
  vec3 p = lc.xyz / lc.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  vec2 texel = 1.0 / vec2(textureSize(map, 0));
  float sum = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      float d = texture(map, p.xy + vec2(float(x), float(y)) * texel * 1.4).r;
      sum += (p.z - 0.0035 > d) ? 0.0 : 1.0;
    }
  }
  return sum / 9.0;
}
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise2(p); p *= 2.03; a *= 0.5; }
  return s;
}
`;

export const SURFACE_VS = `#version 300 es
in vec3 aPos;
in vec3 aNrm;
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform mat4 uLightVP;
out vec3 vWorld;
out vec3 vNrm;
out vec4 vLight;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vNrm = mat3(uModel) * aNrm;
  vLight = uLightVP * world;
  gl_Position = uViewProj * world;
}`;

export const SURFACE_FS = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNrm;
in vec4 vLight;
uniform vec3 uAlbedo;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFillDir;
uniform vec3 uFillColor;
uniform vec3 uAmbSky;
uniform vec3 uAmbGround;
uniform vec3 uLampPos;
uniform vec3 uLampColor;
uniform vec3 uEye;
uniform vec3 uTint;
uniform float uRough;
uniform float uPattern;
uniform float uGlow;
uniform float uExposure;
uniform sampler2D uShadow;
out vec4 fragColor;
${SHADOW_GLSL}
void main() {
  vec3 N = normalize(vNrm);
  vec3 V = normalize(uEye - vWorld);
  vec3 albedo = uAlbedo;
  float rough = uRough;
  vec2 plane = abs(N.y) > 0.6 ? vWorld.xz : vec2(vWorld.x + vWorld.z, vWorld.y);

  if (uPattern < 0.5) {
    // flat paint or plastic
    albedo *= 0.97 + 0.06 * fbm(plane * 9.0);
  } else if (uPattern < 1.5) {
    // plaster: broad mottling, matte
    float n = fbm(plane * 3.4);
    albedo *= 0.86 + 0.28 * n;
    rough = clamp(rough - 0.08 + 0.1 * n, 0.4, 1.0);
  } else if (uPattern < 2.5) {
    // floorboards: seams every 42 cm, grain along the boards
    float plank = 0.42;
    float row = floor(plane.x / plank);
    float off = hash21(vec2(row, 3.7)) * 0.7;
    float edge = abs(fract(plane.x / plank + 0.5) - 0.5) * plank;
    float seam = smoothstep(0.004, 0.02, edge);
    float grain = fbm(vec2((plane.x + off) * 6.0, plane.y * 1.1));
    albedo *= (0.72 + 0.42 * grain) * (0.7 + 0.3 * seam) * (0.86 + 0.28 * hash21(vec2(row, 1.3)));
    rough = clamp(0.46 + 0.4 * grain, 0.28, 1.0);
  } else if (uPattern < 3.5) {
    // woven cloth
    float weave = noise2(plane * 150.0) * 0.14 + noise2(plane * 26.0) * 0.2;
    albedo *= 0.84 + weave;
    rough = clamp(rough, 0.75, 1.0);
  } else {
    // painted wood, foliage, anything with fine grain
    float g = fbm(plane * 14.0);
    albedo *= 0.9 + 0.2 * g;
  }

  float sh = shadowAt(uShadow, vLight);
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 sun = uSunColor * ndl * sh;
  // the window itself is the second light: it is what lifts a room that the
  // ceiling would otherwise leave completely dark
  vec3 fill = uFillColor * max(dot(N, uFillDir), 0.0);
  vec3 sky = uAmbSky * (0.55 + 0.45 * N.y);
  vec3 bounce = uAmbGround * (0.55 - 0.45 * N.y);

  vec3 toLamp = uLampPos - vWorld;
  float lampDist = length(toLamp);
  float lampFall = 1.0 / (1.0 + 1.9 * lampDist * lampDist);
  vec3 lamp = uLampColor * lampFall * max(dot(N, toLamp / max(lampDist, 1e-3)), 0.0);

  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), mix(6.0, 200.0, 1.0 - rough)) * (1.0 - rough) * 0.55 * sh;

  vec3 color = albedo * (sun + fill + sky + bounce + lamp) + uSunColor * spec * 0.4;
  color += albedo * uGlow * 2.4 + uTint;

  // an emissive panel is a light, not a surface: shading it lets the frame cast
  // hatching across the glass, which reads as dirt on the window
  if (uGlow > 0.5) color = albedo * uGlow * 2.4 + uTint;

  color = pow(aces(color * uExposure), vec3(1.0 / 2.2));
  color += (hash21(gl_FragCoord.xy * 0.83) - 0.5) / 255.0;
  fragColor = vec4(color, 1.0);
}`;

export const BILLBOARD_VS = `#version 300 es
in vec2 aPos;
uniform vec3 uOrigin;
uniform vec3 uRight;
uniform mat4 uViewProj;
uniform mat4 uLightVP;
uniform float uWidth;
uniform float uHeight;
uniform float uFlip;
out vec2 vUv;
out vec4 vLight;
out vec3 vWorld;
void main() {
  vec3 world = uOrigin + uRight * (aPos.x * uWidth * uFlip) + vec3(0.0, aPos.y * uHeight, 0.0);
  vWorld = world;
  vUv = vec2(aPos.x + 0.5, aPos.y);
  vLight = uLightVP * vec4(world, 1.0);
  gl_Position = uViewProj * vec4(world, 1.0);
}`;

export const BILLBOARD_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vLight;
in vec3 vWorld;
uniform sampler2D uTex;
uniform sampler2D uShadow;
uniform vec3 uFacing;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFillDir;
uniform vec3 uFillColor;
uniform vec3 uAmbSky;
uniform vec3 uAmbGround;
uniform vec3 uLampPos;
uniform vec3 uLampColor;
uniform vec3 uTint;
uniform float uGlow;
uniform float uExposure;
out vec4 fragColor;
${SHADOW_GLSL}
void main() {
  vec4 texel = texture(uTex, vUv);
  if (texel.a < 0.4) discard;

  // the artwork is sRGB: go to linear so the light it receives is physical
  vec3 base = pow(texel.rgb, vec3(2.2));
  float sh = shadowAt(uShadow, vLight);
  float ndl = 0.42 + 0.58 * max(dot(uFacing, uSunDir), 0.0);
  vec3 lit = uAmbSky * 0.62 + uAmbGround * 0.28 + uSunColor * ndl * sh * 0.8;
  lit += uFillColor * (0.35 + 0.65 * max(dot(uFacing, uFillDir), 0.0));

  vec3 toLamp = uLampPos - vWorld;
  float lampDist = length(toLamp);
  lit += uLampColor * (1.0 / (1.0 + 2.4 * lampDist * lampDist)) * 0.85;

  vec3 color = base * (lit + uTint) + base * uGlow * 1.6;
  color = pow(aces(color * uExposure), vec3(1.0 / 2.2));
  fragColor = vec4(color, 1.0);
}`;

export const DEPTH_VS = `#version 300 es
in vec3 aPos;
uniform mat4 uModel;
uniform mat4 uLightVP;
void main() {
  gl_Position = uLightVP * uModel * vec4(aPos, 1.0);
}`;

export const DEPTH_FS = `#version 300 es
precision highp float;
void main() {}`;

export const DEPTH_SPRITE_VS = `#version 300 es
in vec2 aPos;
uniform vec3 uOrigin;
uniform vec3 uRight;
uniform mat4 uLightVP;
uniform float uWidth;
uniform float uHeight;
uniform float uFlip;
out vec2 vUv;
void main() {
  vec3 world = uOrigin + uRight * (aPos.x * uWidth * uFlip) + vec3(0.0, aPos.y * uHeight, 0.0);
  vUv = vec2(aPos.x + 0.5, aPos.y);
  gl_Position = uLightVP * vec4(world, 1.0);
}`;

export const DEPTH_SPRITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
void main() {
  if (texture(uTex, vUv).a < 0.45) discard;
}`;

export const POST_VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const POST_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uVignette;
out vec4 fragColor;
void main() {
  vec2 d = (vUv - 0.5) * vec2(1.0, 0.94);
  float v = smoothstep(0.16, 0.82, length(d) * 1.45);
  fragColor = vec4(vec3(0.035, 0.028, 0.07), v * uVignette);
}`;
/* ---------- the renderer ---------- */

const ZERO = [0, 0, 0];
// how a beat's answer settles, lifted from the CSS classes the beats already set
const TINT_GOOD = [0.05, 0.16, 0.14];
const TINT_WRONG = [0.24, 0.04, 0.04];
const STATE_GLOW = { focus: 0.3, speaking: 0.1, tap: 0.06 };

/**
 * Mount a 3D stage. Returns null when this browser cannot do WebGL2, which is
 * the signal for the caller to keep the plain CSS stage — the game never depends
 * on 3D being available.
 */
export function createStage3D({ cast = [], bg = 'nursery', search = '', doc } = {}) {
  const host = doc || (typeof document === 'undefined' ? null : document);
  if (!host) return null;

  const canvas = host.createElement('canvas');
  canvas.className = 'stage3d';
  canvas.setAttribute('aria-hidden', 'true');

  const gl = contextOf(canvas);
  if (!gl) return null;

  let surface = null;
  let depthSolid = null;
  let depthSprite = null;
  let billboard = null;
  let post = null;
  try {
    surface = program(gl, SURFACE_VS, SURFACE_FS);
    depthSolid = program(gl, DEPTH_VS, DEPTH_FS);
    depthSprite = program(gl, DEPTH_SPRITE_VS, DEPTH_SPRITE_FS);
    billboard = program(gl, BILLBOARD_VS, BILLBOARD_FS);
    post = program(gl, POST_VS, POST_FS);
  } catch (error) {
    // a driver that cannot compile this is a driver that gets the 2D stage back
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('stage3d: falling back to the 2D stage —', error && error.message ? error.message : error);
    }
    return null;
  }

  const palette = PALETTES[bg] || PALETTES.nursery;
  const models = roomPlan(palette, bg).map((entry) => ({
    ...entry,
    model: compose(entry.center, entry.rot || 0, entry.size),
  }));
  const cube = buffer(gl, cubeGeometry());
  const quad = buffer(gl, quadGeometry());
  const screenQuad = buffer(gl, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));

  const lightDir = normal(palette.sunDir);
  const lightCenter = [0, 1.0, -0.2];
  const lightVP = multiply(
    orthographic(-5, 5, -5, 5, 1, 12),
    lookAt(add(lightCenter, scale(lightDir, 6)), lightCenter),
  );

  const shadow = shadowTarget(gl, SHADOW_SIZE) || depthOnlyFallback();
  const sunColor = scale(palette.sunColor, palette.sunStrength);
  const lampColor = scale(palette.lamp, palette.lampStrength);
  // light spilling in from the window, no shadow map: the cheap version of bounce
  const fillDir = normal([0.3, 0.34, -0.9]);
  const fillColor = scale(palette.window, palette.fillStrength || 0.6);

  const slots = cast.slice(0, MAX_CAST).map((entry) => ({
    entry,
    node: null,
    texture: null,
    aspect: 1,
    origin: [0, 0, 0],
    width: 0.5,
    height: 1,
    facing: [0, 0, 1],
    glow: 0,
    tint: ZERO,
    hidden: true,
  }));

  const view = host.defaultView || null;
  const drift = { x: 0, y: 0, z: 0 };
  const pointer = { x: 0.5, y: 0.5, active: false };
  let disposed = false;
  let frames = 0;
  let width = 1;
  let height = 1;
  let raf = 0;
  const ask = renderAsk(search);
  const cap = ask.cap;
  const reduceMotion = Boolean(
    view && typeof view.matchMedia === 'function' && view.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  /** 1x1 depth texture at max depth: no occluders, so the stage is simply lit. */
  function depthOnlyFallback() {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, 1, 1, 0,
      gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, new Uint32Array([0xffffffff]),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return { fbo: null, texture, size: 1 };
  }

  function bindAttribs(progRef, handle, layout) {
    gl.bindBuffer(gl.ARRAY_BUFFER, handle);
    for (const [name, size, offset, stride] of layout) {
      const at = progRef.attrib(name);
      if (at < 0) continue;
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, size, gl.FLOAT, false, stride, offset);
    }
  }

  const cubeLayout = [['aPos', 3, 0, 24], ['aNrm', 3, 12, 24]];
  const quadLayout = [['aPos', 2, 0, 8]];

  /* ---------- cast: mirror the DOM the beats already drive ---------- */

  function bind(nodes) {
    if (disposed) return;
    for (const slot of slots) {
      const node = nodes && nodes.get ? nodes.get(slot.entry.id) : null;
      slot.node = node || null;
      const source = node && typeof node.querySelector === 'function' ? node.querySelector('canvas') : null;
      if (!source || !source.width || !source.height) continue;
      slot.aspect = source.width / source.height;
      if (slot.texture) gl.deleteTexture(slot.texture);
      slot.texture = canvasTexture(gl, source);
    }
    resize();
  }

  function has(slot, name) {
    const node = slot.node;
    return Boolean(node && node.classList && node.classList.contains(name));
  }

  /* ---------- sizing ---------- */

  function resize() {
    if (disposed) return;
    const box = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    const cssWidth = Math.round(box && box.width ? box.width : canvas.clientWidth || 0);
    const cssHeight = Math.round(box && box.height ? box.height : canvas.clientHeight || 0);
    if (!cssWidth || !cssHeight) return;
    const size = resolutionFor(cssWidth, cssHeight, (view && view.devicePixelRatio) || 1, cap, ask.exact);
    if (size.width === width && size.height === height) return;
    width = size.width;
    height = size.height;
    canvas.width = width;
    canvas.height = height;
    if (canvas.dataset) canvas.dataset.pixels = `${width}x${height}`;
  }

  /* ---------- per-frame staging ---------- */

  let cameraRight = [1, 0, 0];

  function stageCast(camera, seconds) {
    for (const slot of slots) {
      const placed = castPlacement(slot.entry, camera);
      const bob = !reduceMotion && has(slot, 'is-speaking') ? Math.sin(seconds * 6.4) * 0.012 : 0;
      slot.origin = [placed.origin[0], placed.origin[1] + bob, placed.origin[2]];
      slot.height = placed.height;
      slot.width = placed.height * slot.aspect;
      slot.facing = normal(sub(camera.eye, slot.origin));
      slot.hidden = !slot.texture || has(slot, 'is-hidden');
      slot.glow = has(slot, 'is-focus')
        ? STATE_GLOW.focus
        : has(slot, 'is-speaking')
          ? STATE_GLOW.speaking
          : has(slot, 'is-tap')
            ? STATE_GLOW.tap
            : 0;
      slot.tint = has(slot, 'is-good') ? TINT_GOOD : has(slot, 'is-wrong') ? TINT_WRONG : ZERO;
    }
  }

  function setSprite(progRef, slot) {
    gl.uniform3fv(progRef.uniform('uOrigin'), slot.origin);
    gl.uniform3fv(progRef.uniform('uRight'), cameraRight);
    gl.uniform1f(progRef.uniform('uWidth'), slot.width);
    gl.uniform1f(progRef.uniform('uHeight'), slot.height);
    gl.uniform1f(progRef.uniform('uFlip'), slot.entry.flip ? -1 : 1);
  }

  /* ---------- passes ---------- */

  function drawShadowPass() {
    if (!shadow.fbo) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadow.fbo);
    gl.viewport(0, 0, shadow.size, shadow.size);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    depthSolid.use();
    gl.uniformMatrix4fv(depthSolid.uniform('uLightVP'), false, lightVP);
    bindAttribs(depthSolid, cube, cubeLayout);
    for (const item of models) {
      gl.uniformMatrix4fv(depthSolid.uniform('uModel'), false, item.model);
      gl.drawArrays(gl.TRIANGLES, 0, 36);
    }

    // the cast casts too: alpha tested, so a figure leaves a silhouette, not a card
    depthSprite.use();
    gl.disable(gl.CULL_FACE);
    gl.uniformMatrix4fv(depthSprite.uniform('uLightVP'), false, lightVP);
    gl.uniform1i(depthSprite.uniform('uTex'), 0);
    bindAttribs(depthSprite, quad, quadLayout);
    for (const slot of slots) {
      if (slot.hidden) continue;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, slot.texture);
      setSprite(depthSprite, slot);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  function drawRoom(camera, viewProj) {
    surface.use();
    gl.uniformMatrix4fv(surface.uniform('uViewProj'), false, viewProj);
    gl.uniformMatrix4fv(surface.uniform('uLightVP'), false, lightVP);
    gl.uniform3fv(surface.uniform('uSunDir'), lightDir);
    gl.uniform3fv(surface.uniform('uSunColor'), sunColor);
    gl.uniform3fv(surface.uniform('uFillDir'), fillDir);
    gl.uniform3fv(surface.uniform('uFillColor'), fillColor);
    gl.uniform3fv(surface.uniform('uAmbSky'), palette.ambSky);
    gl.uniform3fv(surface.uniform('uAmbGround'), palette.ambGround);
    gl.uniform3fv(surface.uniform('uLampPos'), LAMP);
    gl.uniform3fv(surface.uniform('uLampColor'), lampColor);
    gl.uniform3fv(surface.uniform('uEye'), camera.eye);
    gl.uniform3fv(surface.uniform('uTint'), ZERO);
    gl.uniform1f(surface.uniform('uExposure'), palette.exposure);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadow.texture);
    gl.uniform1i(surface.uniform('uShadow'), 0);
    bindAttribs(surface, cube, cubeLayout);

    for (const item of models) {
      gl.uniformMatrix4fv(surface.uniform('uModel'), false, item.model);
      gl.uniform3fv(surface.uniform('uAlbedo'), item.color);
      gl.uniform1f(surface.uniform('uRough'), item.rough);
      gl.uniform1f(surface.uniform('uPattern'), item.pattern);
      gl.uniform1f(surface.uniform('uGlow'), item.glow || 0);
      gl.drawArrays(gl.TRIANGLES, 0, 36);
    }
  }

  function drawCast(camera, viewProj) {
    billboard.use();
    gl.disable(gl.CULL_FACE);
    gl.uniformMatrix4fv(billboard.uniform('uViewProj'), false, viewProj);
    gl.uniformMatrix4fv(billboard.uniform('uLightVP'), false, lightVP);
    gl.uniform3fv(billboard.uniform('uSunDir'), lightDir);
    gl.uniform3fv(billboard.uniform('uSunColor'), sunColor);
    gl.uniform3fv(billboard.uniform('uFillDir'), fillDir);
    gl.uniform3fv(billboard.uniform('uFillColor'), fillColor);
    gl.uniform3fv(billboard.uniform('uAmbSky'), palette.ambSky);
    gl.uniform3fv(billboard.uniform('uAmbGround'), palette.ambGround);
    gl.uniform3fv(billboard.uniform('uLampPos'), LAMP);
    gl.uniform3fv(billboard.uniform('uLampColor'), lampColor);
    gl.uniform1f(billboard.uniform('uExposure'), palette.exposure);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadow.texture);
    gl.uniform1i(billboard.uniform('uShadow'), 0);
    gl.uniform1i(billboard.uniform('uTex'), 1);
    bindAttribs(billboard, quad, quadLayout);

    for (const slot of slots) {
      if (slot.hidden) continue;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, slot.texture);
      setSprite(billboard, slot);
      gl.uniform3fv(billboard.uniform('uFacing'), slot.facing);
      gl.uniform1f(billboard.uniform('uGlow'), slot.glow);
      gl.uniform3fv(billboard.uniform('uTint'), slot.tint);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  function drawVignette() {
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    post.use();
    gl.uniform1f(post.uniform('uVignette'), 0.7);
    bindAttribs(post, screenQuad, quadLayout);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
  }

  /* ---------- frame ---------- */

  function render(seconds) {
    const aspect = width / Math.max(height, 1);
    if (!reduceMotion) {
      const t = seconds;
      const aimX = pointer.active ? (pointer.x - 0.5) * 0.42 : Math.sin(t * 0.13) * 0.15;
      const aimY = pointer.active ? (0.5 - pointer.y) * 0.22 : Math.sin(t * 0.19) * 0.045;
      const aimZ = pointer.active ? 0 : Math.sin(t * 0.11) * 0.09;
      drift.x += (aimX - drift.x) * 0.05;
      drift.y += (aimY - drift.y) * 0.05;
      drift.z += (aimZ - drift.z) * 0.05;
    }

    const camera = cameraFor(aspect, drift);
    cameraRight = camera.right;
    const viewProj = multiply(camera.projection, camera.view);
    stageCast(camera, seconds);

    drawShadowPass();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.018, 0.016, 0.032, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);

    drawRoom(camera, viewProj);
    drawCast(camera, viewProj);
    drawVignette();

    frames += 1;
    if (canvas.dataset && frames % 30 === 0) canvas.dataset.frames = String(frames);
  }

  const requestFrame =
    view && typeof view.requestAnimationFrame === 'function'
      ? (cb) => view.requestAnimationFrame(cb)
      : (cb) => setTimeout(() => cb(Date.now()), 16);
  const cancelFrame =
    view && typeof view.cancelAnimationFrame === 'function'
      ? (id) => view.cancelAnimationFrame(id)
      : (id) => clearTimeout(id);

  function tick(now) {
    if (disposed) return;
    raf = requestFrame(tick);
    if (host.hidden) return; // a background tab should not spend the GPU
    resize();
    if (width < 2 || height < 2) return;
    render((now || 0) / 1000);
  }

  /* ---------- input: the camera leans, it never moves the layout ---------- */

  function onPointer(event) {
    const box = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    if (!box || !box.width || !box.height) return;
    pointer.x = clamp((event.clientX - box.left) / box.width, 0, 1);
    pointer.y = clamp((event.clientY - box.top) / box.height, 0, 1);
    pointer.active = true;
  }

  function onPointerOut() {
    pointer.active = false;
  }

  if (view && typeof view.addEventListener === 'function') {
    view.addEventListener('pointermove', onPointer, { passive: true });
    view.addEventListener('pointerdown', onPointer, { passive: true });
    view.addEventListener('resize', resize);
  }
  if (host.addEventListener === 'function') host.addEventListener('pointerleave', onPointerOut);
  if (view && typeof view.ResizeObserver === 'function') {
    new view.ResizeObserver(resize).observe(canvas);
  }
  if (canvas.addEventListener) {
    canvas.addEventListener('webglcontextlost', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      // hand the screen back to the 2D stage instead of leaving a dead box
      const parent = canvas.parentElement;
      if (parent && parent.classList) parent.classList.remove('stage--3d');
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelFrame(raf);
    if (view && typeof view.removeEventListener === 'function') {
      view.removeEventListener('pointermove', onPointer);
      view.removeEventListener('pointerdown', onPointer);
      view.removeEventListener('resize', resize);
    }
    if (host.removeEventListener === 'function') host.removeEventListener('pointerleave', onPointerOut);
    for (const slot of slots) if (slot.texture) gl.deleteTexture(slot.texture);
    gl.deleteBuffer(cube);
    gl.deleteBuffer(quad);
    gl.deleteBuffer(screenQuad);
    gl.deleteTexture(shadow.texture);
    if (shadow.fbo) gl.deleteFramebuffer(shadow.fbo);
    for (const progRef of [surface, depthSolid, depthSprite, billboard, post]) progRef.dispose();
    if (canvas.parentNode && typeof canvas.parentNode.removeChild === 'function') {
      canvas.parentNode.removeChild(canvas);
    }
  }

  resize();
  raf = requestFrame(tick);

  return {
    el: canvas,
    bind,
    resize,
    dispose,
    get frames() {
      return frames;
    },
    get pixels() {
      return { width, height };
    },
  };
}

