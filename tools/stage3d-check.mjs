// 3D stage check — the staging math, the set and the failing contracts, no GPU.
//
// The important half is the null path: `createStage3D()` returning null is what
// keeps the game playable everywhere WebGL2 is missing, so it is tested against
// the same fake canvases boot-check and smoke use.

import {
  BILLBOARD_FS,
  BILLBOARD_VS,
  DEPTH_SPRITE_FS,
  DEPTH_SPRITE_VS,
  PALETTES,
  POST_FS,
  POST_VS,
  SURFACE_FS,
  SURFACE_VS,
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
import { dot, normal, normalMatrix, place, translation } from '../src/systems/gl.js';

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

/* ---------- normals: the inverse transpose, and the shaders that read it ---------- */

/* a normal has to stay square to the surface it belongs to */

const along = (m, v) => [
  m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
  m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
  m[2] * v[0] + m[6] * v[1] + m[10] * v[2],
];
const through = (n, v) => [
  n[0] * v[0] + n[3] * v[1] + n[6] * v[2],
  n[1] * v[0] + n[4] * v[1] + n[7] * v[2],
  n[2] * v[0] + n[5] * v[1] + n[8] * v[2],
];

// one face of the room's cube, turned and squashed the way a limb is: the normal
// matrix must keep the normal square to the face even though the model does not.
// The face is cut across the diagonal on purpose — a normal along a scaled axis is
// square to its own face whichever matrix moves it, so it would prove nothing
const squashed = place([1.2, 0.4, -0.8], 0.6, [0.4, 0, 0], [0.06, 0.42, 0.11]);
const faceNormal = normal([1, 1, 0]);
const faceTangents = [normal([1, -1, 0]), [0, 0, 1]];
const unlit = normalMatrix(squashed);
for (const tangent of faceTangents) {
  const stretched = along(squashed, tangent);
  check(
    near(dot(through(unlit, faceNormal), stretched), 0, 1e-6),
    `a normal is no longer square to its face: ${dot(through(unlit, faceNormal), stretched)}`,
  );
}
// the model matrix alone leaves it at an angle, which is the bug this replaces —
// and only the diagonal tangent can show it, because along a stretched axis the two
// matrices agree
const tiltedBy = dot(normal(along(squashed, faceNormal)), normal(along(squashed, faceTangents[0])));
check(
  Math.abs(tiltedBy) > 0.5,
  `a squashed model matrix should tilt normals by about a radian, not ${tiltedBy}`,
);

check(
  normalMatrix(translation([5, -2, 9])).every((v, i) => near(v, i % 4 === 0 ? 1 : 0, 1e-9)),
  'moving a piece must not change its normals',
);
const turned = normalMatrix(place([3, 1, -2], 0.7));
const yawed = place([0, 0, 0], 0.7);
check(
  [...turned].every((v, i) => near(v, yawed[Math.floor(i / 3) * 4 + (i % 3)], 1e-6)),
  'a rotation must hand its normals the same rotation back',
);
check(
  normalMatrix(place([0, 0, 0], 0, [0, 0, 0], [2, 2, 2])).every((v, i) => near(v, i % 4 === 0 ? 0.5 : 0, 1e-9)),
  'a body scaled up twice should halve its normals, so that a unit sphere stays a unit sphere',
);
check(
  normalMatrix(place([0, 0, 0], 0, [0, 0, 0], [0, 0, 0]))
    .every((v, i) => Number.isFinite(v) && near(v, i % 4 === 0 ? 1 : 0, 1e-9)),
  'a zero scale must fall back to the identity, not to a matrix of NaNs',
);

/* and the shaders have to be told about them */

check(SURFACE_VS.includes('uniform mat3 uNrmMat'), 'the surface shader has no normal matrix to read');
check(
  /vNrm\s*=\s*uNrmMat\s*\*\s*aNrm/.test(SURFACE_VS),
  'the surface shader does not put normals through the normal matrix',
);
check(
  !/vNrm\s*=\s*mat3\(uModel\)/.test(SURFACE_VS),
  'the surface shader still stretches normals with the model matrix',
);

// a weave keyed to the room slides across a body as it walks: the cloth branch has
// to sample the piece's own coordinates, not the world's
const clothAt = SURFACE_FS.indexOf('uPattern < 3.5');
const cloth = SURFACE_FS.slice(clothAt, SURFACE_FS.indexOf('} else {', clothAt));
check(clothAt > 0, 'the surface shader has lost its cloth pattern');
check(
  cloth.includes('vOwn') && !cloth.includes('plane'),
  'the cloth weave is keyed to the room, so it will swim across a walking body',
);

/* every varying the vertex stage writes, the fragment stage must read */

const declared = (source, kind) => {
  const names = new Set();
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith(`${kind} `)) continue;
    const found = /^(?:in|out)\s+(?:highp\s+|mediump\s+|lowp\s+)?(?:vec[234]|float|int|mat[234])\s+(\w+)\s*;/.exec(line);
    if (found) names.add(found[1]);
  }
  return names;
};

const pairs = [
  ['surface', SURFACE_VS, SURFACE_FS],
  ['billboard', BILLBOARD_VS, BILLBOARD_FS],
  ['shadow sprite', DEPTH_SPRITE_VS, DEPTH_SPRITE_FS],
  ['post', POST_VS, POST_FS],
];
for (const [name, vertex, fragment] of pairs) {
  const written = declared(vertex, 'out');
  const read = declared(fragment, 'in');
  const missing = [...written].filter((varying) => !read.has(varying));
  const orphaned = [...read].filter((varying) => !written.has(varying));
  check(
    missing.length === 0,
    `${name}: the vertex stage writes ${missing.join(', ')} and the fragment stage never reads it`,
  );
  check(
    orphaned.length === 0,
    `${name}: the fragment stage reads ${orphaned.join(', ')} and the vertex stage never writes it`,
  );
}

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
