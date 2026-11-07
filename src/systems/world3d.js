// The walkable world, planned in three dimensions — and planned purely.
//
// src/content/rooms.js describes a room as an 18x12 ASCII map plus a list of
// hotspots; src/systems/world.js owns what "solid" means. This module answers
// the other question: what does that map *look like* as a place? Tiles become
// metres, wall runs become boxes, hotspots become props with a real height, and
// a third-person camera follows the player through it.
//
// Nothing here touches GL, the DOM or the clock, so tools/world3d-check.mjs can
// assert the whole set without a GPU.

import { THEMES } from './tiles.js';
import { PALETTES } from './stage3d.js';
import { add, cross, lookAt, multiply, normal, perspective, scale, sub } from './gl.js';

/* ---------- scale ---------- */

export const TILE = 0.62; // metres per room tile: an 18x12 room is 11.2 x 7.4 m
export const WALL_H = 3.05;
export const FENCE_H = 0.95;
export const SKIRT_H = 0.3;
// The game is played through the character's eyes, so these are eye heights and
// not camera offsets: a five-year-old sees the room from 1.34 m, and a baby on
// the floor from 0.62 m, which is what makes chapter one feel low and clumsy.
export const EYE_CHILD = 1.34;
export const EYE_BABY = 0.62;
export const VIEW_FOV = (68 * Math.PI) / 180; // vertical, the usual first-person width
export const NEAR = 0.045;
export const FAR = 60;
export const PITCH_LIMIT = (78 * Math.PI) / 180;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ---------- colours ---------- */

/** '#4a3550' -> linear rgb, because the shaders light in linear space. */
export function hexToLinear(hex) {
  const clean = String(hex || '').replace('#', '');
  if (clean.length < 6) return [0.5, 0.5, 0.5];
  const channel = (at) => {
    const value = parseInt(clean.slice(at, at + 2), 16) / 255;
    return Number.isFinite(value) ? Math.pow(value, 2.2) : 0.5;
  };
  return [channel(0), channel(2), channel(4)];
}

const shade = (hex, k) => hexToLinear(hex).map((c) => clamp(c * k, 0, 4));

/* ---------- light ---------- */

/**
 * One palette per theme, shared with the beat stage so a chapter cannot change
 * colour between the room you walk around in and the scene you talk in.
 */
export function lightFor(room) {
  const base = PALETTES[room.theme] || PALETTES.nursery;
  const indoor = isIndoor(room);
  // Indoors the sun cannot reach the floor, so the key light is the window: it
  // rakes in low from the far wall instead of dropping straight through the
  // ceiling, which is what gives a room its long soft shadows.
  const keyDir = indoor ? normal([0.52, 0.5, -0.7]) : normal(base.sunDir);
  return {
    sunDir: keyDir,
    sunColor: scale(base.sunColor, base.sunStrength * (indoor ? 0.72 : 0.8)),
    // The fill stands where the player stands — in front of the back wall — so
    // it lights the surface the camera actually looks at. A window behind the
    // wall cannot light that wall; the room's own air does. Outside it is the
    // sky itself, which is everywhere above the horizon.
    fillDir: normal([0.3, 0.34, 0.9]),
    fillColor: scale(base.window, (base.fillStrength || 0.6) * (indoor ? 1.5 : 0.45)),
    ambSky: scale(base.ambSky, indoor ? 1.6 : 1.1),
    ambGround: scale(base.ambGround, indoor ? 1.4 : 1),
    lampColor: scale(base.lamp, indoor ? base.lampStrength : base.lampStrength * 0.5),
    exposure: base.exposure * (indoor ? 1.08 : 1),
    indoor,
  };
}

/** Where the practical light hangs: a ceiling lamp, or a street lamp outside. */
export function lampFor(room) {
  const bounds = roomBounds(room);
  if (isIndoor(room)) return [0, WALL_H - 0.45, 0];
  const lamp = (room.furniture || []).find((entry) => entry.sprite === 'lamp');
  if (lamp) {
    const centre = gridToWorld(room, lamp.x, lamp.y);
    return [centre[0], 2.1, centre[2]];
  }
  return [bounds.halfW * 0.5, 2.4, -bounds.halfH * 0.5];
}

/* ---------- the finished set ---------- */

/**
 * Sky gradients, horizon to zenith. These are not the room palettes: a wall is
 * a surface that catches light, a sky is the thing that emits it, so it gets its
 * own colours and a glow that bypasses the shading.
 */
const SKY = {
  yard: ['#bcd7ea', '#7fb0d8', '#48709f'],
  evening: ['#6f5f8d', '#3c3360', '#141029'],
};

/** Six stacked slabs stand in for a gradient sky: horizon up to zenith. */
function skyPlan(theme, bounds) {
  const colors = SKY[theme] || SKY.yard;
  const far = bounds.halfH + 9;
  const horizon = hexToLinear(colors[0]);
  const middle = hexToLinear(colors[1]);
  const zenith = hexToLinear(colors[2]);
  const mix = (a, b, t) => a.map((channel, index) => channel + (b[index] - channel) * t);
  const bands = 14;
  const out = [];
  // below the horizon, so no gap can ever open between the ground and the sky
  let y = -2.4;
  for (let i = 0; i < bands; i += 1) {
    const t = i / (bands - 1);
    const color = t < 0.5 ? mix(horizon, middle, t * 2) : mix(middle, zenith, (t - 0.5) * 2);
    const height = 0.8 + i * 0.55;
    out.push({
      kind: 'sky',
      noShadow: true,
      center: [0, y + height / 2, -far - i * 0.3],
      size: [bounds.width * 8, height, 0.2],
      color,
      pattern: 0,
      rough: 1,
      glow: 0.45,
    });
    y += height;
  }

  // a dusk needs stars: a dozen small emissive chips in front of the gradient
  if (theme === 'evening') {
    for (let i = 0; i < 14; i += 1) {
      const spread = bounds.width / 2;
      const x = (((i * 37) % 17) / 16 - 0.5) * 2 * spread;
      const height = 3.4 + ((i * 53) % 11) * 0.5;
      out.push({
        kind: 'star',
        noShadow: true,
        center: [x, height, -far + 0.4],
        size: [0.12, 0.12, 0.04],
        color: [0.8, 0.86, 1.1],
        pattern: 0,
        rough: 1,
        glow: 0.9,
      });
    }
  }

  return out;
}

/**
 * Everything the renderer needs to draw a chapter's room, in metres: surfaces
 * (floor, walls, glazing, decals, ceiling), props, plants and the light.
 */
export function setPlan(room) {
  const theme = THEMES[room.theme] || THEMES.nursery;
  const bounds = roomBounds(room);
  const indoor = isIndoor(room);

  const surfaces = [
    // the floor slab: one box, one draw call
    {
      kind: 'floor',
      center: [0, -0.06, 0],
      size: [bounds.width, 0.12, bounds.depth],
      color: hexToLinear(indoor ? theme.floor : theme.floorB),
      pattern: indoor ? 2 : 4,
      rough: indoor ? 0.72 : 0.9,
    },
  ];

  for (const piece of wallPlan(room)) {
    if (piece.kind === 'fence') {
      for (const post of PROP_GEOMETRY.fence(piece.size[0], piece.size[2])) {
        surfaces.push({
          ...post,
          kind: 'prop',
          center: [piece.center[0] + post.center[0], post.center[1], piece.center[2] + post.center[2]],
        });
      }
      continue;
    }
    if (piece.kind === 'window') {
      const [cx, , cz] = piece.center;
      const [sw, , sd] = piece.size;
      // daytime glass is sky, evening glass is a lamp across the street
      const glass = room.theme === 'evening' ? [1.1, 0.72, 0.32] : [0.8, 0.92, 1.25];
      // glazing in the middle, wall above and below: a window is an opening in
      // something solid, not a bright sticker on it
      const sillH = 1.05;
      const glassH = 1.3;
      const headY = sillH + glassH;
      surfaces.push({
        kind: 'window',
        center: [cx, sillH + glassH / 2, cz],
        size: [sw * 0.96, glassH, sd * 0.55],
        color: glass,
        pattern: 0,
        rough: 1,
        glow: 1.1,
      });
      surfaces.push({
        kind: 'wall',
        center: [cx, sillH / 2, cz],
        size: [sw, sillH, sd],
        color: hexToLinear(theme.wall),
        pattern: 1,
        rough: 0.95,
      });
      surfaces.push({
        kind: 'wall',
        center: [cx, headY + (WALL_H - headY) / 2, cz],
        size: [sw, WALL_H - headY, sd],
        color: hexToLinear(theme.wall),
        pattern: 1,
        rough: 0.95,
      });
      // mullion, head and sill: three boxes that make the glass read as a frame
      surfaces.push({
        kind: 'frame',
        center: [cx, sillH + glassH / 2, cz + sd * 0.16],
        size: [0.06, glassH, sd * 0.34],
        color: hexToLinear(theme.wallDark),
        pattern: 4,
        rough: 0.6,
      });
      surfaces.push({
        kind: 'frame',
        center: [cx, headY, cz + sd * 0.16],
        size: [sw * 1.02, 0.08, sd * 0.34],
        color: hexToLinear(theme.wallDark),
        pattern: 4,
        rough: 0.6,
      });
      surfaces.push({
        kind: 'frame',
        center: [cx, sillH + 0.02, cz + sd * 0.24],
        size: [sw * 1.06, 0.09, sd * 0.5],
        color: hexToLinear(theme.wallDark),
        pattern: 4,
        rough: 0.6,
      });
      continue;
    }
    surfaces.push({
      ...piece,
      color:
        piece.kind === 'wall'
          ? shade(indoor ? theme.wall : theme.wallDark, indoor ? 1.7 : 1)
          : hexToLinear(theme.wallTop),
      pattern: indoor ? 1 : 4,
      rough: piece.kind === 'wall' ? 0.95 : 0.8,
    });
  }

  for (const piece of decalPlan(room)) {
    const color =
      piece.kind === 'rug'
        ? hexToLinear(theme.rug)
        : piece.kind === 'chalk'
          ? hexToLinear(theme.accent)
          : shade(theme.floorB, piece.kind === 'puddle' ? 1.25 : 0.82);
    surfaces.push({ ...piece, color, pattern: piece.kind === 'rug' ? 3 : 0, rough: 0.9 });
  }

  // ceiling: only indoors, and only above the walls, so it closes the silhouette
  if (indoor) {
    surfaces.push({
      kind: 'ceiling',
      noShadow: true, // it would shadow the whole room; a ceiling is not a roof
      center: [0, WALL_H + 0.05, 0],
      size: [bounds.width, 0.1, bounds.depth],
      color: hexToLinear(theme.wallDark),
      pattern: 1,
      rough: 1,
    });
  } else {
    // a horizon needs land under it: the yard continues past the fence
    surfaces.push({
      kind: 'ground',
      center: [0, -0.16, -bounds.halfH - bounds.depth * 2.2],
      size: [bounds.width * 9, 0.12, bounds.depth * 5],
      color: hexToLinear(theme.floorB),
      pattern: 4,
      rough: 0.95,
    });
  }

  // furniture that has no sprite becomes boxes, in the prop's own frame
  const props = propPlan(room);
  for (const prop of props) {
    if (prop.kind !== 'geometry') continue;
    const recipe = PROP_GEOMETRY[prop.sprite];
    if (!recipe) continue;
    for (const piece of recipe(prop.footprint[0], prop.footprint[1])) {
      surfaces.push({
        ...piece,
        kind: 'prop',
        center: [prop.center[0] + piece.center[0], piece.center[1], prop.center[2] + piece.center[2]],
      });
    }
  }

  return {
    theme: room.theme,
    indoor,
    bounds,
    light: lightFor(room),
    lamp: lampFor(room),
    surfaces,
    props,
    plants: plantPlan(room),
    sky: indoor ? [] : skyPlan(room.theme, bounds),
  };
}

/* ---------- grid <-> world ---------- */

export function roomSize(room) {
  return { w: room.map[0].length, h: room.map.length };
}

/** Centre of a tile in metres. Row 0 is the far wall, so +z is towards the lens. */
export function gridToWorld(room, tx, ty) {
  const { w, h } = roomSize(room);
  return [(tx + 0.5 - w / 2) * TILE, 0, (ty + 0.5 - h / 2) * TILE];
}

/** A floating-point room position (x/y in tiles, as world.js speaks it) in metres. */
export function posToWorld(room, pos) {
  const { w, h } = roomSize(room);
  return [(pos.x - w / 2) * TILE, 0, (pos.y - h / 2) * TILE];
}

/** Metres back to a tile, for a click on the floor. */
export function worldToGrid(room, x, z) {
  const { w, h } = roomSize(room);
  return { tx: Math.floor(x / TILE + w / 2), ty: Math.floor(z / TILE + h / 2) };
}

export function roomBounds(room) {
  const { w, h } = roomSize(room);
  return {
    halfW: (w * TILE) / 2,
    halfH: (h * TILE) / 2,
    width: w * TILE,
    depth: h * TILE,
  };
}


/* ---------- tiles ---------- */

export const INDOOR_THEMES = new Set(['nursery', 'kindergarten', 'classroom']);

export function isIndoor(room) {
  return INDOOR_THEMES.has(room.theme);
}

/** Tile character at a grid position, or '#' outside the map. */
export function tileAt(room, tx, ty) {
  const { w, h } = roomSize(room);
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return '#';
  return room.map[ty][tx] || '.';
}

/**
 * Maximal horizontal runs of the given tile characters per row, split whenever
 * the character changes. Walls are built from these, so a solid 18-tile wall
 * costs one box instead of eighteen — and a window in that wall stays its own
 * run, which is the whole point.
 */
export function runsOf(room, chars) {
  const { w, h } = roomSize(room);
  const want = new Set(chars);
  const runs = [];
  for (let ty = 0; ty < h; ty += 1) {
    let start = -1;
    let current = '';
    for (let tx = 0; tx <= w; tx += 1) {
      const char = tx < w ? room.map[ty][tx] : '';
      if (start !== -1 && char !== current) {
        runs.push({ ty, tx: start, length: tx - start, char: current });
        start = -1;
      }
      if (start === -1 && want.has(char)) {
        start = tx;
        current = char;
      }
    }
  }
  return runs;
}

/**
 * The walls of the room. Indoors they are full height except the south row,
 * which is only a skirt — a wall between the lens and the player would hide the
 * game. Outdoors the same rows become a fence, and `w` rows become glazing.
 */
export function wallPlan(room) {
  const { h } = roomSize(room);
  const indoor = isIndoor(room);
  const pieces = [];

  for (const run of runsOf(room, ['#', 'w'])) {
    const south = run.ty === h - 1;
    const height = indoor ? (south ? SKIRT_H : WALL_H) : south ? 0.12 : FENCE_H;
    const centre = gridToWorld(room, run.tx + run.length / 2 - 0.5, run.ty);
    const windowRun = run.char === 'w';
    const kind = windowRun
      ? 'window'
      : !indoor && !south
        ? 'fence' // outside, the edge of the map is a fence you can see through
        : south && !indoor
          ? 'kerb'
          : 'wall';
    pieces.push({
      kind,
      center: [centre[0], height / 2, centre[2]],
      size: [run.length * TILE, height, TILE * 0.92],
    });
  }
  return pieces;
}

/** Thin slabs laid on the floor: rugs, mats, puddles, chalk. */
export function decalPlan(room) {
  const legend = room.legend || {};
  const chars = Object.keys(legend).filter((key) => key !== 'p' && key !== 'w');
  return runsOf(room, chars).map((run) => {
    const centre = gridToWorld(room, run.tx + run.length / 2 - 0.5, run.ty);
    return {
      kind: legend[run.char],
      center: [centre[0], 0.011, centre[2]],
      size: [run.length * TILE * 0.98, 0.02, TILE * 0.92],
    };
  });
}

/* ---------- props ---------- */

/**
 * Heights in metres. A figure is a person's height; a prop is what it measures
 * in a room with a 2.55 m ceiling. Anything unlisted falls back to its
 * footprint, so a new sprite in the content file still looks sane.
 */
export const SPRITE_HEIGHT = {
  baby: 0.78,
  child: 1.06,
  mama: 1.62,
  papa: 1.7,
  teacher: 1.62,
  friend: 1.12,
  dog: 0.6,
  cat: 0.4,
  bird: 0.22,
  tree: 2.6,
  house: 2.2,
  fence: 0.95,
  crib: 0.95,
  dresser: 1.05,
  mobile: 1.95,
  snack: 0.6,
  signs: 1.25,
  shelf: 1.5,
  table: 0.74,
  board: 1.25,
  lamp: 1.9,
  flowers: 0.42,
  flower: 0.5,
  bottle: 0.3,
  ball: 0.28,
  book: 0.2,
  apple: 0.18,
  bread: 0.16,
  milk: 0.24,
};

/** Sprites that belong on the floor as a pool of light, not standing up. */
export const PATCH_SPRITES = new Set(['sunlight', 'moonpatch']);

/* ---------- furniture as geometry ---------- */

/**
 * The art pack painted people and animals, not furniture, so a room's crib and
 * chalkboard have no sprite to stand up. They get boxes instead — which is what
 * a 3D room wants anyway: volume, occlusion and a shadow of the right shape.
 *
 * A recipe gets the prop's footprint in metres and returns boxes in the prop's
 * own frame, with y measured up from the floor.
 */
const MATERIAL = {
  wood: { color: hexToLinear('#7a5334'), pattern: 4, rough: 0.72 },
  dark: { color: hexToLinear('#3b2a1e'), pattern: 4, rough: 0.8 },
  paint: { color: hexToLinear('#b9aed6'), pattern: 0, rough: 0.55 },
  white: { color: hexToLinear('#e8e3f3'), pattern: 3, rough: 0.92 },
  cloth: { color: hexToLinear('#8f4a68'), pattern: 3, rough: 0.96 },
  metal: { color: hexToLinear('#8d97a8'), pattern: 0, rough: 0.34 },
  leaf: { color: hexToLinear('#4c7a4a'), pattern: 4, rough: 0.86 },
  glass: { color: hexToLinear('#cfe4ff'), pattern: 0, rough: 0.2, glow: 0.35 },
  chalk: { color: hexToLinear('#2f6a55'), pattern: 0, rough: 0.86 },
  petal: { color: hexToLinear('#f08fb4'), pattern: 0, rough: 0.7 },
  paper: { color: hexToLinear('#f7f3ff'), pattern: 0, rough: 0.9 },
  bulb: { color: hexToLinear('#ffe9bd'), pattern: 0, rough: 0.4, glow: 1 },
};

const bar = (x, y, z, size, material) => ({ center: [x, y, z], size, ...MATERIAL[material] });

export const PROP_GEOMETRY = {
  crib: (sx, sz) => {
    const out = [
      bar(0, 0.44, 0, [sx * 0.95, 0.1, sz * 0.95], 'wood'),
      bar(0, 0.52, 0, [sx * 0.86, 0.1, sz * 0.86], 'cloth'),
    ];
    const px = sx / 2 - 0.06;
    const pz = sz / 2 - 0.06;
    for (const x of [-px, px]) {
      for (const z of [-pz, pz]) out.push(bar(x, 0.48, z, [0.07, 0.96, 0.07], 'wood'));
    }
    out.push(bar(0, 0.9, -pz, [sx * 0.95, 0.06, 0.06], 'wood'));
    out.push(bar(0, 0.9, pz, [sx * 0.95, 0.06, 0.06], 'wood'));
    for (let i = 0; i < 5; i += 1) {
      out.push(bar(-sx * 0.36 + (i * sx * 0.72) / 4, 0.72, pz, [0.03, 0.34, 0.03], 'wood'));
    }
    return out;
  },
  dresser: (sx, sz) => [
    bar(0, 0.5, 0, [sx * 0.92, 1.0, sz * 0.86], 'wood'),
    bar(0, 0.3, sz * 0.44, [sx * 0.8, 0.02, 0.02], 'dark'),
    bar(0, 0.55, sz * 0.44, [sx * 0.8, 0.02, 0.02], 'dark'),
    bar(0, 0.8, sz * 0.44, [sx * 0.8, 0.02, 0.02], 'dark'),
    bar(-sx * 0.2, 0.44, sz * 0.46, [0.05, 0.05, 0.03], 'metal'),
    bar(sx * 0.2, 0.44, sz * 0.46, [0.05, 0.05, 0.03], 'metal'),
    bar(0, 1.03, 0, [sx * 0.98, 0.05, sz * 0.9], 'white'),
  ],
  mobile: (sx) => {
    const arm = sx * 0.42;
    return [
      bar(0, 2.25, 0, [0.02, 0.62, 0.02], 'dark'),
      bar(0, 1.94, 0, [arm * 2, 0.03, 0.03], 'dark'),
      bar(-arm, 1.82, 0, [0.1, 0.1, 0.1], 'petal'),
      bar(0, 1.78, 0, [0.12, 0.12, 0.12], 'paint'),
      bar(arm, 1.82, 0, [0.1, 0.1, 0.1], 'white'),
    ];
  },
  shelf: (sx, sz) => {
    const out = [
      bar(-sx * 0.46, 0.75, 0, [0.05, 1.5, sz * 0.9], 'wood'),
      bar(sx * 0.46, 0.75, 0, [0.05, 1.5, sz * 0.9], 'wood'),
    ];
    for (const y of [0.42, 0.85, 1.28, 1.48]) out.push(bar(0, y, 0, [sx * 0.96, 0.04, sz * 0.9], 'wood'));
    for (let i = 0; i < 4; i += 1) {
      out.push(bar(-sx * 0.3 + i * sx * 0.2, 0.98, 0, [0.05, 0.22, sz * 0.6], i % 2 ? 'paint' : 'petal'));
    }
    return out;
  },
  board: (sx) => [
    bar(0, 0.95, 0, [sx * 0.94, 0.86, 0.06], 'chalk'),
    bar(0, 0.95, -0.04, [sx * 0.94, 0.86, 0.02], 'dark'),
    bar(-sx * 0.36, 0.26, 0, [0.06, 0.52, 0.06], 'wood'),
    bar(sx * 0.36, 0.26, 0, [0.06, 0.52, 0.06], 'wood'),
    bar(0, 0.5, 0.06, [sx * 0.9, 0.04, 0.08], 'wood'),
    bar(-sx * 0.16, 1.12, 0.05, [0.22, 0.14, 0.02], 'paper'),
  ],

  table: (sx, sz) => {
    const out = [bar(0, 0.72, 0, [sx * 0.94, 0.07, sz * 0.9], 'wood')];
    for (const x of [-sx * 0.4, sx * 0.4]) {
      for (const z of [-sz * 0.36, sz * 0.36]) out.push(bar(x, 0.35, z, [0.06, 0.7, 0.06], 'wood'));
    }
    out.push(bar(-sx * 0.2, 0.79, 0, [0.16, 0.07, 0.16], 'white'));
    out.push(bar(sx * 0.16, 0.78, -sz * 0.1, [0.2, 0.05, 0.14], 'paper'));
    return out;
  },
  fence: (sx) => {
    const out = [];
    const posts = Math.max(2, Math.round(sx / 0.5));
    for (let i = 0; i < posts; i += 1) {
      const x = -sx / 2 + 0.08 + (i * (sx - 0.16)) / Math.max(1, posts - 1);
      out.push(bar(x, 0.48, 0, [0.09, 0.96, 0.09], 'wood'));
    }
    out.push(bar(0, 0.72, 0, [sx * 0.98, 0.08, 0.05], 'wood'));
    out.push(bar(0, 0.36, 0, [sx * 0.98, 0.08, 0.05], 'wood'));
    return out;
  },
  lamp: () => [
    bar(0, 0.06, 0, [0.34, 0.12, 0.34], 'dark'),
    bar(0, 1.05, 0, [0.09, 2.1, 0.09], 'dark'),
    bar(0, 2.16, 0, [0.26, 0.12, 0.26], 'metal'),
    bar(0, 2.05, 0, [0.18, 0.18, 0.18], 'bulb'),
  ],
  flowers: (sx, sz) => {
    const out = [bar(0, 0.16, 0, [sx * 0.96, 0.32, sz * 0.9], 'dark')];
    const colors = ['petal', 'white', 'paint', 'petal'];
    for (let i = 0; i < 4; i += 1) {
      const x = -sx * 0.3 + i * sx * 0.2;
      const z = (i % 2 ? 0.1 : -0.1) * sz;
      out.push(bar(x, 0.4, z, [0.14, 0.18, 0.14], colors[i]));
      out.push(bar(x, 0.24, z, [0.04, 0.2, 0.04], 'leaf'));
    }
    return out;
  },
  bottle: () => [
    bar(0, 0.1, 0, [0.1, 0.2, 0.1], 'glass'),
    bar(0, 0.24, 0, [0.05, 0.08, 0.05], 'glass'),
    bar(0, 0.3, 0, [0.07, 0.04, 0.07], 'petal'),
  ],
  tree: (sx, sz) => [
    bar(0, 1.1, 0, [0.26, 2.2, 0.26], 'wood'),
    bar(0, 2.4, 0, [sx * 0.78, 0.9, sz * 0.78], 'leaf'),
    bar(0, 3.0, 0, [sx * 0.52, 0.6, sz * 0.52], 'leaf'),
  ],
  snack: (sx, sz) => [
    bar(0, 0.52, 0, [sx * 0.9, 0.06, sz * 0.85], 'wood'),
    bar(-sx * 0.36, 0.26, -sz * 0.3, [0.05, 0.52, 0.05], 'wood'),
    bar(sx * 0.36, 0.26, -sz * 0.3, [0.05, 0.52, 0.05], 'wood'),
    bar(-sx * 0.36, 0.26, sz * 0.3, [0.05, 0.52, 0.05], 'wood'),
    bar(sx * 0.36, 0.26, sz * 0.3, [0.05, 0.52, 0.05], 'wood'),
    bar(-sx * 0.18, 0.58, 0, [0.16, 0.05, 0.16], 'white'),
    bar(sx * 0.2, 0.58, 0.04, [0.14, 0.06, 0.12], 'paper'),
  ],
  signs: (sx) => [
    bar(-sx * 0.19, 0.62, 0, [0.06, 1.24, 0.06], 'wood'),
    bar(sx * 0.19, 0.62, 0, [0.06, 1.24, 0.06], 'wood'),
    bar(0, 1.02, 0.03, [sx * 0.82, 0.34, 0.02], 'paper'),
    bar(0, 0.64, 0.03, [sx * 0.82, 0.34, 0.02], 'petal'),
  ],
  house: (sx, sz) => [
    bar(0, 0.9, 0, [sx * 0.94, 1.8, sz * 0.9], 'wood'),
    bar(0, 1.95, 0, [sx * 1.06, 0.3, sz * 1.02], 'dark'),
    bar(0, 2.2, 0, [sx * 0.9, 0.24, sz * 0.86], 'dark'),
    bar(sx * 0.18, 0.5, sz * 0.46, [0.34, 1.0, 0.04], 'dark'),
    bar(-sx * 0.28, 1.1, sz * 0.46, [0.24, 0.28, 0.04], 'bulb'),
    bar(sx * 0.24, 1.35, sz * 0.46, [0.18, 0.2, 0.04], 'bulb'),
  ],
};

/** Does this sprite become geometry instead of a billboard? */
export function hasGeometry(sprite) {
  return Object.prototype.hasOwnProperty.call(PROP_GEOMETRY, sprite);
}

export function propKind(object) {
  if (PATCH_SPRITES.has(object.sprite)) return 'patch';
  if (hasGeometry(object.sprite)) return 'geometry';
  if ((SPRITE_HEIGHT[object.sprite] || 0) >= 1.0) return 'figure';
  return 'prop';
}

/** Every hotspot and every piece of furniture, placed in metres. */
export function propPlan(room) {
  const out = [];
  for (const object of [...(room.furniture || []), ...room.objects]) {
    const w = object.w || 1;
    const h = object.h || 1;
    const centre = gridToWorld(room, object.x + w / 2 - 0.5, object.y + h / 2 - 0.5);
    const kind = propKind(object);
    const height = SPRITE_HEIGHT[object.sprite] || Math.max(w, h) * TILE * 0.9;
    out.push({
      id: object.id,
      sprite: object.sprite,
      kind,
      hotspot: Boolean(object.beats),
      center: centre,
      footprint: [w * TILE, h * TILE],
      width: kind === 'patch' ? w * TILE : height,
      height: kind === 'patch' ? 0.02 : height,
      depth: h * TILE,
    });
  }
  return out;
}

/** Decorative plants: the map's `p` tiles, which are paint-only in 2D. */
export function plantPlan(room) {
  const { w, h } = roomSize(room);
  const spots = [];
  for (let ty = 0; ty < h; ty += 1) {
    for (let tx = 0; tx < w; tx += 1) {
      if (room.map[ty][tx] !== 'p') continue;
      const centre = gridToWorld(room, tx, ty);
      spots.push({ center: [centre[0], 0, centre[2]], height: SPRITE_HEIGHT.flower, sprite: 'flower' });
    }
  }
  return spots;
}

/* ---------- camera ---------- */

/**
 * First person. `yaw` 0 looks towards +z, the near wall of the map, so the room
 * turns around the player instead of the camera hanging behind them. `bob` is
 * the step in metres and `sway` the lens lean; both move the eye, never the
 * composition. The caller owns yaw and pitch, because turning is gameplay.
 */
export function cameraForEye(pos, opts = {}) {
  const {
    yaw = 0,
    pitch = 0,
    eye = EYE_CHILD,
    aspect = 1.6,
    bob = 0,
    sway = { x: 0, y: 0 },
    fov = VIEW_FOV,
  } = opts;
  const eyePos = [pos[0] + (sway.x || 0), eye + bob + (sway.y || 0), pos[2]];
  const flat = Math.cos(pitch);
  const forward = normal([Math.sin(yaw) * flat, Math.sin(pitch), Math.cos(yaw) * flat]);
  const target = add(eyePos, forward);
  const right = normal(cross(forward, [0, 1, 0]));
  const up = normal(cross(right, forward));
  return {
    eye: eyePos,
    target,
    forward,
    right,
    up,
    yaw,
    pitch,
    fov,
    aspect,
    view: lookAt(eyePos, target),
    projection: perspective(fov, aspect, NEAR, FAR),
  };
}

/** Eye height for a room's actor: a baby on the floor, a child on their feet. */
export function eyeFor(room) {
  return room && room.actor === 'baby' ? EYE_BABY : EYE_CHILD;
}

/** The view angle a body faces, for the tile-grid directions. */
export function yawForDir(dir) {
  if (dir === 'up') return Math.PI;
  if (dir === 'left') return -Math.PI / 2;
  if (dir === 'right') return Math.PI / 2;
  return 0; // 'down', towards the near wall
}

/** The tile-grid direction a view angle is closest to. */
export function dirForYaw(yaw) {
  const turn = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (turn < Math.PI / 4 || turn >= (Math.PI * 7) / 4) return 'down';
  if (turn < (Math.PI * 3) / 4) return 'right';
  if (turn < (Math.PI * 5) / 4) return 'up';
  return 'left';
}

/** Yaw and pitch from one point to another — what a hot spot's gaze wants. */
export function lookAtPoint(from, to) {
  const dx = to[0] - from[0];
  const dy = (to[1] || 0) - (from[1] || 0);
  const dz = to[2] - from[2];
  const flat = Math.hypot(dx, dz) || 1;
  return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, flat) };
}

/** Keep a pitch inside the neck's range instead of rolling the horizon over. */
export function clampPitch(pitch) {
  return clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
}

/** Ray through a point of the canvas, given in 0..1 screen space. */
export function rayFromScreen(camera, sx, sy) {
  const ndcX = sx * 2 - 1;
  const ndcY = 1 - sy * 2;
  const th = Math.tan(camera.fov / 2);
  return normal(
    add(add(scale(camera.right, ndcX * th * camera.aspect), scale(camera.up, ndcY * th)), camera.forward),
  );
}

/** Where a click on the canvas meets the floor, in metres (null if it misses). */
export function floorHit(camera, sx, sy) {
  const dir = rayFromScreen(camera, sx, sy);
  if (dir[1] > -1e-4) return null;
  const t = -camera.eye[1] / dir[1];
  if (t <= 0 || t > 60) return null;
  return add(camera.eye, scale(dir, t));
}

/** Project a world point to canvas percentages, for the DOM hotspot labels. */
export function projectPoint(camera, point) {
  const view = multiply(camera.projection, camera.view);
  const x = view[0] * point[0] + view[4] * point[1] + view[8] * point[2] + view[12];
  const y = view[1] * point[0] + view[5] * point[1] + view[9] * point[2] + view[13];
  const w = view[3] * point[0] + view[7] * point[1] + view[11] * point[2] + view[15];
  if (!(w > 0.001)) return { x: 50, y: 50, visible: false, depth: Infinity };
  const ndcX = x / w;
  const ndcY = y / w;
  return {
    x: (ndcX * 0.5 + 0.5) * 100,
    y: (1 - (ndcY * 0.5 + 0.5)) * 100,
    visible: Math.abs(ndcX) <= 1.15 && Math.abs(ndcY) <= 1.15,
    depth: -w,
  };
}

/** Nearest hotspot within `reach` metres of a point, for pointer picking. */
export function propAt(props, point, reach = TILE) {
  let best = null;
  for (const prop of props) {
    if (!prop.hotspot) continue;
    const dx = prop.center[0] - point[0];
    const dz = prop.center[2] - point[2];
    const distance = Math.hypot(dx, dz);
    if (distance > Math.max(reach, prop.depth * 0.75)) continue;
    if (!best || distance < best.distance) best = { prop, distance };
  }
  return best ? best.prop : null;
}

/**
 * Which sprite the player wears. The rooms say `actor`; the art pack only ever
 * painted a baby and a child, and a missing name must never blank the player.
 */
export function actorSprite(room) {
  return room.actor === 'baby' ? 'baby' : 'friend';
}

export function actorHeight(room) {
  return room.actor === 'baby' ? SPRITE_HEIGHT.baby : SPRITE_HEIGHT.child;
}

/**
 * Eye height as a fraction of stature. It is how a camera height becomes a body:
 * the lens sits in the actor's head, so the body has to be tall enough to hold it.
 * A child carries their eyes higher up their own body than an adult does, and a
 * baby higher still, which is why one ratio is not enough.
 */
const EYE_RATIO = { adult: 0.935, child: 0.905, baby: 0.86 };

/** How tall the player's body is, given the eye the chapter plays from. */
export function actorBodyHeight(room) {
  const baby = Boolean(room && room.actor === 'baby');
  const ratio = baby ? EYE_RATIO.baby : EYE_RATIO.child;
  return Math.round((eyeFor(room) / ratio) * 100) / 100;
}

