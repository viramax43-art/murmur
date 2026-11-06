// The figures check — the character art, asserted in Node, without a canvas.
//
// A figure is rasterized into a grid of material names and tones, so the art can
// be measured: does a person have a face, a silhouette and shading, does a walk
// cycle actually move the legs, do two calls agree, and is the drawing sixteen
// times the detail of the 12x12 painted map it replaces. The canvas wrapper is
// the only part this file cannot reach, which is the point.

import { SPRITES } from '../src/systems/sprites.js';
import { ROOMS } from '../src/content/rooms.js';
import {
  FIGURE_SPECS,
  figureBox,
  figureFrames,
  figureGrid,
  figureLayers,
  figureNames,
  hasFigure,
} from '../src/systems/figures.js';
import { actorSprite } from '../src/systems/world3d.js';

const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
};
const names = figureNames();
const cells = (grid) => grid.mat.reduce((sum, mat) => (mat ? sum + 1 : sum), 0);
const count = (grid, mat) => grid.mat.reduce((sum, cell) => (cell === mat ? sum + 1 : sum), 0);
const diff = (a, b) => {
  let changed = 0;
  for (let i = 0; i < a.mat.length; i += 1) if (a.mat[i] !== b.mat[i]) changed += 1;
  return changed;
};
const solid = (grid, x, y) => Boolean(grid.mat[y * grid.width + x]);

/* ---------- the cast ---------- */
//
// Every body the game puts on a stage or in a room has to be drawn by something:
// a living name in the sprite maps without a spec would silently fall back to a
// twelve-pixel mosaic.

const LIVING = ['mama', 'papa', 'baby', 'teacher', 'friend', 'dog', 'cat', 'bird'];
for (const name of LIVING) {
  check(Object.prototype.hasOwnProperty.call(SPRITES, name), `${name}: the painted sprite should still exist as the fallback`);
  check(hasFigure(name), `${name}: a living sprite needs a figure spec`);
}
for (const name of names) {
  const spec = FIGURE_SPECS[name];
  check(Boolean(spec.box && spec.box.length === 2), `${name}: a spec needs a two-number box`);
  const [w, h] = spec.box;
  check(w >= 24 && h >= 22, `${name}: ${w}x${h} is too small a grid to hold any detail`);
  const builds = ['person', 'dog', 'cat', 'bird'];
  check(builds.includes(spec.build), `${name}: unknown build ${spec.build}`);
  check(Boolean(spec.hair), `${name}: no colour for hair or fur`);
  check(figureBox(name).join('x') === `${w}x${h}`, `${name}: figureBox disagrees with the spec`);
}
check(!hasFigure('ball'), 'the ball is a prop, not a figure');
check(figureBox('nobody') === null, 'an unknown name should have no box');

/* ---------- every room body is drawable ---------- */
//
// A room's hotspot sprites and its player are what the 3D scene puts in front of
// the lens; if one of them had neither art nor a figure, the card would be blank.

const roomBodies = new Set();
for (const room of Object.values(ROOMS)) {
  for (const object of [...(room.furniture || []), ...room.objects]) {
    if (object.sprite && hasFigure(object.sprite)) roomBodies.add(object.sprite);
  }
  roomBodies.add(actorSprite(room));
}
for (const kind of ['baby', 'child']) {
  const room = Object.values(ROOMS).find((entry) => entry.actor === kind);
  if (room) check(hasFigure(actorSprite(room)), `the ${kind} player needs a figure`);
}
check(roomBodies.size >= 3, `only ${roomBodies.size} figure bodies appear in the rooms`);


/* ---------- a body looks like a body ---------- */
//
// The painted maps are one 12x12 grid per sprite, and a twelfth of a body per
// cell is exactly what makes them a mosaic at stage size. A figure is authored on
// a far finer grid and cropped to the silhouette, so the number that matters is
// the cells it actually occupies against the cells the painted map occupies.

const paintedCells = (name) => SPRITES[name].join('').split('').filter((c) => c !== '.').length;

for (const name of names) {
  const front = figureLayers(name, { view: 'front' });
  const filled = cells(front);
  const painted = paintedCells(name);
  const factor = filled / painted;
  const person = FIGURE_SPECS[name].build === 'person';
  const want = person ? 8 : 4;
  check(
    factor >= want,
    `${name}: ${filled} cells is only ${factor.toFixed(1)}x the painted map's ${painted} (want ${want}x)`,
  );
  check(filled < front.width * front.height, `${name}: the whole box is filled — the silhouette was not cropped`);
  check(front.width <= FIGURE_SPECS[name].box[0], `${name}: the crop should never widen the box`);

  // head at the top, feet on the ground: the body sits in the box it was given
  let firstRow = front.height;
  let lastRow = -1;
  for (let y = 0; y < front.height; y += 1) {
    for (let x = 0; x < front.width; x += 1) {
      if (!solid(front, x, y)) continue;
      if (y < firstRow) firstRow = y;
      if (y > lastRow) lastRow = y;
    }
  }
  check(firstRow <= front.height * 0.2, `${name}: the head starts ${firstRow} rows down a ${front.height} row box`);
  check(lastRow >= front.height * 0.88, `${name}: the feet stop ${lastRow} rows down a ${front.height} row box`);
  check(count(front, 'ink') > 40, `${name}: ${count(front, 'ink')} ink cells is not an outline`);

  // shading: a figure is drawn with at least two tones of one material
  const tones = new Set();
  for (let i = 0; i < front.mat.length; i += 1) if (front.mat[i]) tones.add(`${front.mat[i]}${front.tone[i]}`);
  check(tones.size >= 12, `${name}: only ${tones.size} material/tone pairs — that is a flat drawing`);

  // a person has a face; an animal has eyes even if it has no mouth
  if (person) {
    check(count(front, 'skin') > 100, `${name}: barely any skin for a face and hands`);
    check(count(front, 'white') > 0, `${name}: no eye whites`);
    check(count(front, 'iris') > 0, `${name}: no irises`);
    check(count(front, 'mouth') > 0, `${name}: no mouth`);
    check(count(front, 'top') > 100, `${name}: no clothes`);
  } else {
    check(count(front, 'white') > 0, `${name}: an animal still needs an eye`);
    check(count(front, 'top') > 10, `${name}: no second fur tone`);
  }
}

/* ---------- the views and the walk cycle ---------- */
//
// Facing the camera, facing away and facing sideways cannot be the same drawing,
// and a walk cycle that does not move is not a walk cycle. Only a person is ever
// seen from four sides in this game (the player walks; an animal stands or sits
// as a prop in one three-quarter view), and only bodies with a cycle are asked
// for one.

for (const name of names) {
  const person = FIGURE_SPECS[name].build === 'person';
  const front = figureLayers(name, { view: 'front' });
  const idle = figureLayers(name, { view: 'front' });

  if (person) {
    const back = figureLayers(name, { view: 'back' });
    const side = figureLayers(name, { view: 'side' });
    check(diff(front, back) > 40, `${name}: the back view is the front view`);
    check(diff(front, side) > 40, `${name}: the side view is the front view`);
    check(back.width === front.width, `${name}: views must share the crop, or the billboard would jump`);

    const frames = [0, 1, 2, 3].map((frame) => figureLayers(name, { view: 'side', pose: 'walk', frame }));
    for (let i = 0; i < 3; i += 1) {
      check(diff(frames[i], frames[i + 1]) > 8, `${name}: walk frames ${i} and ${i + 1} are the same drawing`);
    }
    check(diff(frames[0], frames[2]) > 20, `${name}: opposite steps should be different drawings`);

    const walk = figureLayers(name, { view: 'front', pose: 'walk', frame: 0 });
    check(diff(idle, walk) > 8, `${name}: the walk pose is the standing pose`);

    const lean = figureLayers(name, { pose: 'lean' });
    check(diff(idle, lean) > 8, `${name}: leaning over is drawn like standing up`);
  } else {
    const steps = [0, 1, 2, 3].map((frame) => figureLayers(name, { pose: 'walk', frame }));
    const moved = steps.some((step, i) => i > 0 && diff(steps[0], step) > 4);
    if (FIGURE_SPECS[name].build === 'dog') check(moved, `${name}: a dog walking should move its legs`);
  }
}

/* ---------- determinism ---------- */
//
// The art is generated, so it must generate the same bytes every time: the cache
// is an optimisation, not a source of truth.

for (const name of names) {
  const a = figureGrid(name, { view: 'front' });
  const b = figureGrid(name, { view: 'front' });
  check(a.width === b.width && a.height === b.height, `${name}: two calls disagree on the size`);
  check(a.data.length === a.width * a.height * 4, `${name}: the RGBA buffer does not match the grid`);
  let opaque = 0;
  let transparent = 0;
  for (let i = 3; i < a.data.length; i += 4) {
    if (a.data[i] === 255) opaque += 1;
    else if (a.data[i] === 0) transparent += 1;
  }
  check(opaque + transparent === a.width * a.height, `${name}: alpha is neither 0 nor 255 somewhere`);
  check(opaque === cells(figureLayers(name, { view: 'front' })), `${name}: the pixels and the materials disagree`);
  check(transparent > 0, `${name}: a cropped figure should still have air around it`);
  check(b.data.every((value, i) => value === a.data[i]), `${name}: the same call gave different pixels`);
}

/* ---------- the canvas wrapper, without a canvas ---------- */
//
// In Node there is no document, so the wrapper must return null instead of
// throwing: that is what lets every tool in tools/ import this module.

check(figureFrames('mama').every((entry) => entry === null), 'without a document, figureFrames returns nulls');
check(typeof globalThis.document === 'undefined', 'this check is meant to run without a DOM');

if (problems.length) {
  console.error(`figures: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const totals = names.map((name) => cells(figureLayers(name)));
const ratios = names.map((name) => cells(figureLayers(name)) / paintedCells(name));
const people = names.filter((name) => FIGURE_SPECS[name].build === 'person').length;
console.log(
  `figures ok: ${names.length} bodies (${people} people, ${names.length - people} animals), ` +
    `${Math.min(...totals)}..${Math.max(...totals)} cells each, ` +
    `${Math.min(...ratios).toFixed(1)}x..${Math.max(...ratios).toFixed(1)}x the painted map`,
);
