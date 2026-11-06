// 3D stage check — the staging math, the set and the failing contracts, no GPU.
//
// The important half is the null path: `createStage3D()` returning null is what
// keeps the game playable everywhere WebGL2 is missing, so it is tested against
// the same fake canvases boot-check and smoke use.

import {
  PALETTES,
  cameraFor,
  castPlacement,
  createStage3D,
  cubeGeometry,
  quadGeometry,
  rayFor,
  renderCap,
  renderAsk,
  resolutionFor,
  roomPlan,
} from '../src/systems/stage3d.js';
import { dot } from '../src/systems/gl.js';

const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const len = (v) => Math.hypot(v[0], v[1], v[2]);

/* ---------- the camera ---------- */

const camera = cameraFor(16 / 10);
check(near(len(camera.forward), 1, 1e-6), 'forward is not a unit vector');
check(near(len(camera.right), 1, 1e-6), 'right is not a unit vector');
check(near(len(camera.up), 1, 1e-6), 'up is not a unit vector');
check(near(dot(camera.forward, camera.right), 0, 1e-6), 'forward and right are not perpendicular');
check(near(dot(camera.forward, camera.up), 0, 1e-6), 'forward and up are not perpendicular');
check(near(dot(camera.right, camera.up), 0, 1e-6), 'right and up are not perpendicular');
check(camera.right[0] > 0.9, 'right should point along +x so the stage reads left to right');
check(camera.forward[2] < 0, 'the camera should look down -z');
check(camera.projection instanceof Float32Array && camera.projection.length === 16, 'projection is not a mat4');
check(near(camera.projection[11], -1), 'projection is not a perspective');

/* a ray through the middle of the stage is the view axis */
const centre = rayFor(camera, 50, 50);
check(dot(centre, camera.forward) > 0.999, 'the centre of the stage does not look where the camera looks');

/* ---------- staging the cast ---------- */

const mother = { id: 'mama', x: 24, y: 84, size: 'xl' };
const baby = { id: 'baby', x: 40, y: 94, size: 'md' };
const star = { id: 'star', x: 44, y: 16, size: 'sm' };

const placedMother = castPlacement(mother, camera);
const placedBaby = castPlacement(baby, camera);
const placedStar = castPlacement(star, camera);

check(near(placedMother.origin[1], 0, 1e-6), 'a figure at y=84% should stand on the floor');
check(placedMother.origin[2] < 3.4 && placedMother.origin[2] > -2.6, 'a figure at y=84% is outside the room');
check(
  placedBaby.depth < placedMother.depth,
  'a figure lower on the stage (y=94%) must stand closer to the camera than one at y=84%',
);
check(
  Math.abs(placedBaby.origin[2] - placedMother.origin[2]) > 0.2,
  'the two figures ended up at the same depth: the y% mapping is not doing anything',
);
check(!placedStar.grounded, 'the star at y=16% should be pinned to the wall, not the floor');
check(placedStar.origin[1] > 0.5, 'the star should hang above the floor');
check(placedStar.origin[2] < -2.0, 'the star should sit against the back wall');

/* size classes keep their order at one spot */
const heights = ['sm', 'md', 'lg', 'xl'].map((size) => castPlacement({ x: 50, y: 90, size }, camera).height);
check(
  heights[0] < heights[1] && heights[1] < heights[2] && heights[2] < heights[3],
  `size classes do not grow: ${heights.map((h) => h.toFixed(2)).join(' < ')}`,
);
check(near(heights[3] / heights[0], 0.52 / 0.16, 1e-6), 'xl/sm height ratio does not match styles/main.css');

/* nothing may be staged outside the set */
for (const entry of [
  mother,
  baby,
  star,
  { id: 'sun', x: 84, y: 24, size: 'md' },
  { id: 'tree', x: 10, y: 82, size: 'xl' },
  { id: 'apple', x: 90, y: 74, size: 'md' },
]) {
  const placed = castPlacement(entry, camera);
  const [x, y, z] = placed.origin;
  check(Math.abs(x) <= 3.3, `${entry.id} is staged at x=${x.toFixed(2)}, outside the room`);
  check(y >= 0 && y <= 2.6, `${entry.id} is staged at y=${y.toFixed(2)}, outside the room`);
  check(z > -2.6 && z < 3.4, `${entry.id} is staged at z=${z.toFixed(2)}, outside the room`);
  check(placed.height > 0.05 && placed.height < 2.2, `${entry.id} has an implausible height ${placed.height.toFixed(2)}`);
}

/* ---------- render budget ---------- */

check(renderCap('') === 1440, 'the default render cap should be 1440p');
check(renderCap('?render=4k') === 2160, '?render=4k should mean 2160 lines');
check(renderCap('?render=1080') === 1080, '?render=1080 was ignored');
check(renderCap('?chapter=2&render=1440') === 1440, 'the cap is not read from a longer query string');
check(renderCap('?render=banana') === 1440, 'an unknown render value should fall back to the default');

const plain = resolutionFor(880, 550, 1, 1440);
check(plain.width === 880 && plain.height === 550, `1x should render 880x550, got ${plain.width}x${plain.height}`);
const retina = resolutionFor(880, 550, 2, 1440);
check(retina.width === 1760 && retina.height === 1100, `2x should render 1760x1100, got ${retina.width}x${retina.height}`);
const capped = resolutionFor(880, 550, 2, 1080);
check(capped.height === 1080 && capped.width === 1728, `the cap should give 1728x1080, got ${capped.width}x${capped.height}`);
const fourK = resolutionFor(880, 550, 2, 2160, true);
check(fourK.width === 3456 && fourK.height === 2160, `4k should supersample to 3456x2160, got ${fourK.width}x${fourK.height}`);
check(renderAsk('?render=4k').exact, '?render=4k should ask for an exact height');
check(!renderAsk('').exact, 'the default render size should not supersample');

/* ---------- the set ---------- */

check(Object.keys(PALETTES).length === 5, `expected 5 backdrops, found ${Object.keys(PALETTES).length}`);
for (const [name, palette] of Object.entries(PALETTES)) {
  check(Array.isArray(palette.sunDir) && palette.sunDir.length === 3, `${name} has no sun direction`);
  check(near(len(palette.sunDir), 1, 0.02), `${name}: the sun direction is not normalised`);
  check(palette.sunStrength > 0, `${name} has no sun`);
  check(palette.exposure > 0, `${name} has no exposure`);
}

const nursery = roomPlan(PALETTES.nursery, 'nursery');
check(nursery.length >= 20, `the nursery has only ${nursery.length} pieces`);
for (const piece of nursery) {
  check(Array.isArray(piece.color) && piece.color.length === 3, 'a piece has no colour');
  // emissive pieces (the window, the lamp) are allowed above 1: that is the glow
  check(piece.color.every((c) => c >= 0 && c <= 4), 'a piece has a colour channel outside 0..4');
  check(typeof piece.pattern === 'number', 'a piece has no surface pattern');
  check(typeof piece.rough === 'number' && piece.rough >= 0 && piece.rough <= 1, 'a piece has a roughness outside 0..1');
  check(piece.size.every((s) => s > 0), 'a piece has a zero dimension');
}
const classroom = roomPlan(PALETTES.classroom, 'classroom');
check(classroom.length === nursery.length + 2, 'the classroom should add the chalkboard and its ledge');
check(
  nursery.some((piece) => piece.center[1] < 0.02 && piece.size[1] < 0.2 && piece.size[0] > 6),
  'the nursery has no floor',
);
check(
  nursery.some((piece) => near(piece.center[2], -2.63, 0.02) && piece.size[1] > 2.4),
  'the nursery has no back wall',
);

/* ---------- geometry ---------- */

const cube = cubeGeometry();
check(cube.length === 216, `a cube should be 36 interleaved vertices (216 floats), got ${cube.length}`);
const quad = quadGeometry();
check(quad.length === 12, `a billboard should be 6 vertices (12 floats), got ${quad.length}`);
check(
  quad.filter((_, index) => index % 2 === 1).every((y) => y === 0 || y === 1),
  'a billboard quad should sit between y=0 and y=1',
);

/* ---------- the null path: no browser, no WebGL2, no 3D ---------- */

check(createStage3D({ cast: [], bg: 'nursery' }) === null, 'without a document, createStage3D() must return null');

const realDocument = globalThis.document;
globalThis.document = {
  createElement: () => ({ style: {}, dataset: {}, setAttribute() {}, getContext: () => null }),
};
check(createStage3D({ cast: [], bg: 'nursery' }) === null, 'a canvas without a GL context must return null');

// smoke.mjs hands back a 2D-ish context from getContext('webgl2'): the typeof
// probes in contextOf() are what stop the renderer from throwing on it
globalThis.document = {
  createElement: () => ({
    style: {},
    dataset: {},
    setAttribute() {},
    content: '',
    getContext: () => ({ fillRect() {}, imageSmoothingEnabled: true, fillStyle: '' }),
  }),
};
check(createStage3D({ cast: [], bg: 'nursery' }) === null, 'a 2D canvas stub must return null, not throw');
globalThis.document = realDocument;

if (problems.length) {
  console.error(`stage3d: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(
  `stage3d ok: ${nursery.length} pieces, ${Object.keys(PALETTES).length} backdrops, 4K cap ${renderCap('?render=4k')}p`,
);
