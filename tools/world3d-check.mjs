// The walkable world check — the plan, the camera and the null path, no GPU.
//
// Everything that decides where a wall, a prop or the player stands is a pure
// function, so the whole 3D room can be asserted from Node. The other half is
// the contract that keeps the game playable: without WebGL2 createScene3D()
// returns null and the 2D room stays.

import { ROOMS } from '../src/content/rooms.js';
import { SPRITES } from '../src/systems/sprites.js';
import { createScene3D } from '../src/systems/scene3d.js';
import {
  EYE_BABY,
  EYE_CHILD,
  FENCE_H,
  PITCH_LIMIT,
  PROP_GEOMETRY,
  SKIRT_H,
  SPRITE_HEIGHT,
  TILE,
  WALL_H,
  actorSprite,
  cameraForEye,
  clampPitch,
  dirForYaw,
  eyeFor,
  floorHit,
  gridToWorld,
  hasGeometry,
  hexToLinear,
  isIndoor,
  lookAtPoint,
  posToWorld,
  projectPoint,
  propAt,
  propPlan,
  rayFromScreen,
  roomSize,
  setPlan,
  tileAt,
  worldToGrid,
  yawForDir,
} from '../src/systems/world3d.js';
import { dot } from '../src/systems/gl.js';

const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const len = (v) => Math.hypot(v[0], v[1], v[2]);
const rooms = Object.values(ROOMS);

/* ---------- colours ---------- */

check(near(hexToLinear('#ffffff')[0], 1, 1e-6), '#ffffff should be 1.0 in linear space');
check(hexToLinear('#000000').every((c) => c === 0), '#000000 should be 0 in linear space');
check(near(hexToLinear('#808080')[0], Math.pow(128 / 255, 2.2), 1e-6), 'grey is not gamma-decoded');
check(hexToLinear('nonsense').length === 3, 'a bad colour should still return three channels');

/* ---------- what counts as a wall ---------- */

check(tileAt(ROOMS.ch1, 0, 0) === '#', 'the corner of a room should be wall');
check(tileAt(ROOMS.ch1, -1, 4) === '#', 'outside the map counts as wall');
check(tileAt(ROOMS.ch1, 9, 5) === '.', 'the middle of the nursery should be floor');
check(tileAt(ROOMS.ch1, 4, 0) === 'w', 'the nursery window tile should still read as a window');
check(hasGeometry('crib'), 'the crib should be built from boxes');
check(!hasGeometry('mama'), 'a person should stay a billboard');

/* ---------- tiles <-> metres ---------- */

for (const room of rooms) {
  const { w, h } = roomSize(room);
  check(w === 18 && h === 12, `${room.id}: the rooms are 18x12 tiles, found ${w}x${h}`);
  for (const [tx, ty] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [8, 6]]) {
    const world = gridToWorld(room, tx, ty);
    const back = worldToGrid(room, world[0], world[2]);
    check(back.tx === tx && back.ty === ty, `${room.id}: tile ${tx},${ty} does not survive the round trip`);
  }
  const spawn = posToWorld(room, room.spawn);
  const spawnTile = worldToGrid(room, spawn[0], spawn[2]);
  check(
    spawnTile.tx === Math.floor(room.spawn.x) && spawnTile.ty === Math.floor(room.spawn.y),
    `${room.id}: the spawn point lands in the wrong tile`,
  );
  check(near(spawn[1], 0), `${room.id}: the player should start on the floor`);
}

/* ---------- the set ---------- */

for (const room of rooms) {
  const plan = setPlan(room);
  const indoor = isIndoor(room);

  check(plan.surfaces.length >= 8, `${room.id}: only ${plan.surfaces.length} surfaces`);
  check(
    plan.surfaces.some((piece) => piece.kind === 'floor' && piece.size[0] > 8 && piece.size[2] > 5),
    `${room.id}: no floor slab`,
  );
  check(
    plan.surfaces.some((piece) => piece.size[1] >= (indoor ? WALL_H : FENCE_H) - 0.01),
    `${room.id}: nothing stands up to close the room off`,
  );
  check(
    plan.surfaces.some((piece) => piece.kind === 'ceiling') === indoor,
    `${room.id}: the ceiling does not match indoor/outdoor`,
  );
  check(
    indoor ? plan.sky.length === 0 : plan.sky.length >= 6,
    `${room.id}: expected a sky outdoors, ${plan.sky.length} bands found`,
  );

  // the south row must never be tall enough to cover the lens
  for (const piece of plan.surfaces) {
    if (!indoor || piece.center[2] < plan.bounds.halfH - TILE) continue;
    if (piece.kind === 'ceiling' || piece.kind === 'floor') continue;
    check(piece.size[1] <= SKIRT_H + 1e-6, `${room.id}: the south wall is ${piece.size[1].toFixed(2)} m tall`);
  }

  for (const piece of [...plan.surfaces, ...plan.sky]) {
    check(Array.isArray(piece.color) && piece.color.length === 3, `${room.id}: a surface has no colour`);
    check(piece.color.every((c) => c >= 0 && c <= 4), `${room.id}: a colour channel is outside 0..4`);
    check(typeof piece.pattern === 'number', `${room.id}: a surface has no pattern`);
    check(piece.size.every((s) => s > 0), `${room.id}: a surface has a zero dimension`);
    check(piece.center.every((c) => Number.isFinite(c)), `${room.id}: a surface centre is not a number`);
  }

  check(near(len(plan.light.sunDir), 1, 1e-6), `${room.id}: the sun is not normalised`);
  check(plan.light.exposure > 0, `${room.id}: no exposure`);
  check(plan.lamp[1] > 1.5, `${room.id}: the lamp hangs too low to light anything`);

  /* every hotspot is a thing you can see: a sprite, a recipe, or a patch */
  const planned = propPlan(room);
  for (const object of room.objects) {
    const prop = planned.find((entry) => entry.id === object.id);
    check(Boolean(prop), `${room.id}: hotspot ${object.id} vanished from the plan`);
    if (!prop) continue;
    const visible =
      prop.kind === 'patch' || hasGeometry(prop.sprite) || Object.prototype.hasOwnProperty.call(SPRITES, prop.sprite);
    check(visible, `${room.id}: ${object.id} has neither a sprite nor a geometry recipe`);
    check(prop.height > 0, `${room.id}: ${object.id} has no height`);
    check(prop.hotspot, `${room.id}: ${object.id} is not marked as a hotspot`);
  }
  for (const prop of planned) {
    if (prop.kind !== 'geometry') continue;
    const pieces = PROP_GEOMETRY[prop.sprite](prop.footprint[0], prop.footprint[1]);
    check(pieces.length > 0, `${room.id}: the ${prop.sprite} recipe built nothing`);
    for (const piece of pieces) {
      check(piece.center[1] > 0, `${room.id}: a ${prop.sprite} box sits under the floor`);
      check(piece.size.every((s) => s > 0), `${room.id}: a ${prop.sprite} box has a zero dimension`);
      check(Array.isArray(piece.color), `${room.id}: a ${prop.sprite} box has no material`);
    }
  }
  check(
    planned.length === room.objects.length + (room.furniture || []).length,
    `${room.id}: the plan lost a prop`,
  );
}


/* ---------- the camera: first person ---------- */

const room = ROOMS.ch1;
const start = posToWorld(room, room.spawn);
const camera = cameraForEye(start, { aspect: 16 / 10, yaw: 0, pitch: 0 });
check(near(len(camera.forward), 1, 1e-6), 'forward is not a unit vector');
check(near(dot(camera.forward, camera.right), 0, 1e-6), 'forward and right are not perpendicular');
check(camera.right[0] < -0.9, 'looking along +z, the right hand should point at -x');
check(near(camera.eye[1], EYE_CHILD, 1e-9), 'the eye is not at a child\'s eye height');
check(near(camera.eye[0], start[0], 1e-9), 'the eye does not stand where the player stands (x)');
check(near(camera.eye[2], start[2], 1e-9), 'the eye does not stand where the player stands (z)');
check(near(camera.forward[2], 1, 1e-6), 'yaw 0 should look towards +z, the near wall');
check(near(camera.projection[11], -1), 'the projection is not a perspective');

const turned = cameraForEye(start, { yaw: Math.PI });
check(near(turned.forward[2], -1, 1e-6), 'yaw pi should look towards -z, the far wall');
const east = cameraForEye(start, { yaw: Math.PI / 2 });
check(near(east.forward[0], 1, 1e-6), 'yaw pi/2 should look towards +x');
check(yawForDir('up') === Math.PI && yawForDir('down') === 0, 'a body facing up should look towards -z');
for (const dir of ['up', 'down', 'left', 'right']) {
  check(dirForYaw(yawForDir(dir)) === dir, `the view angle for ${dir} does not survive the round trip`);
}

const moved = cameraForEye([start[0] + 2, 0, start[2] - 1], { yaw: 0 });
check(near(moved.eye[0], start[0] + 2, 1e-9), 'the camera does not follow the player on x');
check(near(moved.eye[2], start[2] - 1, 1e-9), 'the camera does not follow the player on z');

const bobbed = cameraForEye(start, { bob: 0.05 });
check(near(bobbed.eye[1] - camera.eye[1], 0.05, 1e-9), 'a step should lift the eye by its own height');
check(near(bobbed.eye[0], camera.eye[0], 1e-9), 'a step should not slide the eye sideways');

const look = lookAtPoint([0, EYE_CHILD, 0], [0, EYE_CHILD, -3]);
check(near(Math.abs(look.yaw), Math.PI, 1e-9), 'looking down -z should be yaw pi');
check(near(look.pitch, 0, 1e-9), 'level ground should not pitch the head');
check(near(clampPitch(3), PITCH_LIMIT, 1e-9) && near(clampPitch(-3), -PITCH_LIMIT, 1e-9), 'pitch is not clamped');
check(eyeFor(ROOMS.ch1) === EYE_BABY, 'a baby chapter should be played from the floor');
check(eyeFor(ROOMS.ch2) === EYE_CHILD, 'a walking chapter should be played from eye height');

/* ---------- picking ---------- */

// The lens is level by default, so it looks at the horizon, not at the floor:
// a click straight ahead hits air, and only a turned-down head hits the boards.
const ahead = cameraForEye(start, { yaw: Math.PI, pitch: 0 });
const down = cameraForEye(start, { yaw: Math.PI, pitch: -0.75 });
check(floorHit(ahead, 0.5, 0.5) === null, 'a level lens should not hit the floor at the horizon');
const centre = floorHit(down, 0.5, 0.5);
check(Boolean(centre), 'a click on the floor should hit the floor');
if (centre) {
  const tile = worldToGrid(room, centre[0], centre[2]);
  check(tile.tx >= 0 && tile.ty >= 0 && tile.tx < 18 && tile.ty < 12, 'the centre click lands outside the room');
}
const skylook = cameraForEye(start, { yaw: Math.PI, pitch: 0.5 });
check(floorHit(skylook, 0.5, 0.5) === null, 'a click on the sky should not hit the floor');
check(near(len(rayFromScreen(ahead, 0.5, 0.5)), 1, 1e-6), 'a picking ray is not normalised');

const projected = projectPoint(ahead, [start[0], 0.9, start[2] - 2]);
check(projected.visible, 'a prop in front of the player does not project onto the canvas');
check(projected.x > 0 && projected.x < 100 && projected.y > 0 && projected.y < 100, 'the prop projects off-canvas');
const behind = projectPoint(ahead, [start[0], 0.9, start[2] + 40]);
check(!behind.visible, 'a point behind the camera should not be visible');

/* ---------- hotspots ---------- */

const hotspots = propPlan(ROOMS.ch1);
const crib = hotspots.find((prop) => prop.id === 'crib');
check(Boolean(crib && crib.hotspot), 'the crib should be a hotspot');
if (crib) {
  check(propAt(hotspots, crib.center) === crib, 'clicking a hotspot should return that hotspot');
  const far = [crib.center[0] + 6, 0, crib.center[2] + 6];
  check(propAt(hotspots, far) === null, 'a click far from every prop should return null');
}

/* ---------- every actor has art ---------- */

for (const entry of rooms) {
  const sprite = actorSprite(entry);
  check(Object.prototype.hasOwnProperty.call(SPRITES, sprite), `${entry.id}: the actor sprite ${sprite} has no art`);
  check(SPRITE_HEIGHT[sprite] > 0, `${entry.id}: the actor has no height`);
}

/* ---------- the null path: no browser, no WebGL2, no 3D ---------- */

check(createScene3D({ room }) === null, 'without a document, createScene3D() must return null');

const realDocument = globalThis.document;
globalThis.document = {
  createElement: () => ({ style: {}, dataset: {}, setAttribute() {}, getContext: () => null }),
};
check(createScene3D({ room }) === null, 'a canvas without a GL context must return null');

globalThis.document = {
  createElement: () => ({
    style: {},
    dataset: {},
    setAttribute() {},
    getContext: () => ({ fillRect() {}, imageSmoothingEnabled: true, fillStyle: '' }),
  }),
};
check(createScene3D({ room }) === null, 'a 2D canvas stub must return null, not throw');
globalThis.document = realDocument;

if (problems.length) {
  console.error(`world3d: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const plans = rooms.map((entry) => setPlan(entry));
const surfaces = plans.reduce((sum, plan) => sum + plan.surfaces.length, 0);
const props = plans.reduce((sum, plan) => sum + plan.props.length, 0);
console.log(`world3d ok: ${rooms.length} rooms, ${props} props, ${surfaces} surfaces, ${TILE} m tiles`);

