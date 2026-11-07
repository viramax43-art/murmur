// The cast check — bodies, not cards, and no GPU.
//
// bodies3d.js turns a FIGURE_SPECS entry into a list of parts, and meshes.js says
// what each part looks like. Both are pure, so the whole cast can be measured from
// Node: every body stands on the floor, is as tall as it was asked to be, is
// thinner than it is tall, animates, and is made of unit solids whose triangles
// face outwards. That last one is the check that matters most, because inside-out
// geometry is invisible until something is lit from behind it.
//
// The upload, the attribute binding and the draw calls are pure functions of a
// context too, so they run here against a context that only records what it is
// told: the layout a body part is uploaded with is the layout the room's shaders
// read, and a stride that disagrees with it draws every limb as a smear.

import { bodyKit, bodyNames, bodyPlan, hasBody, MESHES } from '../src/systems/bodies3d.js';
import { bodyGeometry, bindMesh, drawMesh, MESH_LAYOUT, releaseMeshes, uploadMeshes } from '../src/systems/meshes.js';
import { FIGURE_SPECS } from '../src/systems/figures.js';
import { SPRITE_HEIGHT, hexToLinear } from '../src/systems/world3d.js';
import { place } from '../src/systems/gl.js';

const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ---------- the unit solids ---------- */

/** Every distinct vertex of every unit solid, so a part can be measured exactly. */
const VERTS = (() => {
  const out = {};
  for (const [name, geom] of Object.entries(bodyGeometry())) {
    const seen = new Set();
    const points = [];
    for (let i = 0; i < geom.data.length; i += 6) {
      const x = geom.data[i];
      const y = geom.data[i + 1];
      const z = geom.data[i + 2];
      const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      points.push([x, y, z]);
    }
    out[name] = points;
  }
  // the cube is the room's, so it is not in bodyGeometry: its eight corners are
  out.box = [];
  for (let i = 0; i < 8; i += 1) {
    out.box.push([i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, i & 4 ? 0.5 : -0.5]);
  }
  return out;
})();

const UNIT_BOUNDS = {
  sphere: { y: [-1, 1], rad: 1 },
  dome: { y: [0, 1], rad: 1 },
  cone: { y: [0, 1], rad: 1 },
  capsule: { y: [-3, 3], rad: 1 },
  box: { y: [-0.5, 0.5], rad: Math.SQRT1_2 },
};

check(
  Object.keys(VERTS).sort().join() === [...MESHES].sort().join(),
  `meshes.js and bodies3d.js disagree about the shapes: ${Object.keys(VERTS)} vs ${MESHES}`,
);

for (const name of MESHES) {
  const verts = VERTS[name];
  check(verts.length > 0, `${name}: the unit solid has no vertices`);
  if (!verts.length) continue;
  const ys = verts.map((v) => v[1]);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const rad = Math.max(...verts.map((v) => Math.hypot(v[0], v[2])));
  const unit = UNIT_BOUNDS[name];
  check(near(lo, unit.y[0], 1e-5), `${name}: the unit solid starts at y ${lo}, not ${unit.y[0]}`);
  check(near(hi, unit.y[1], 1e-5), `${name}: the unit solid ends at y ${hi}, not ${unit.y[1]}`);
  check(near(rad, unit.rad, 2e-3), `${name}: the unit solid is ${rad.toFixed(3)} wide, not ${unit.rad}`);
}

/* ---------- winding: every triangle must face the way its own normals point ---------- */

for (const [name, geom] of Object.entries(bodyGeometry())) {
  const { data, index } = geom;
  const at = (i) => [data[i * 6], data[i * 6 + 1], data[i * 6 + 2]];
  const nrm = (i) => [data[i * 6 + 3], data[i * 6 + 4], data[i * 6 + 5]];
  check(index.length % 3 === 0, `${name}: the index count is not a triangle count`);
  let worst = Infinity;
  let degenerate = 0;
  let outOfRange = 0;
  for (let t = 0; t < index.length; t += 3) {
    const ids = [index[t], index[t + 1], index[t + 2]];
    if (ids.some((id) => id * 6 + 5 >= data.length)) {
      outOfRange += 1;
      continue;
    }
    const [a, b, c] = ids.map(at);
    // the winding normal, cross(b - a, c - a)
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const face = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const flen = Math.hypot(face[0], face[1], face[2]);
    if (flen < 1e-12) {
      degenerate += 1; // a triangle with no area: a hole nobody can see, but still a bug
      continue;
    }
    const avg = [0, 1, 2].map((k) => (nrm(ids[0])[k] + nrm(ids[1])[k] + nrm(ids[2])[k]) / 3);
    const agree = (face[0] * avg[0] + face[1] * avg[1] + face[2] * avg[2]) / flen;
    worst = Math.min(worst, agree);
  }
  check(outOfRange === 0, `${name}: ${outOfRange} triangle(s) index past the end of the buffer`);
  check(degenerate === 0, `${name}: ${degenerate} degenerate triangle(s)`);
  check(worst > 0.05, `${name}: a triangle is wound against its normals (agreement ${worst.toFixed(3)}) — it will be culled`);

  let shortest = Infinity;
  for (let i = 0; i < data.length; i += 6) {
    shortest = Math.min(shortest, Math.hypot(data[i + 3], data[i + 4], data[i + 5]));
  }
  check(near(shortest, 1, 1e-4), `${name}: a vertex normal is ${shortest.toFixed(4)} long, not 1`);
}

/* ---------- the cast ---------- */

const names = bodyNames();
check(names.length >= 8, `only ${names.length} bodies: the cast is bigger than that`);
for (const name of Object.keys(FIGURE_SPECS)) {
  check(hasBody(name) === names.includes(name), `${name}: hasBody() disagrees with bodyNames()`);
}
for (const name of names) {
  check(bodyKit(name) !== null, `${name}: a body with no kit`);
  check(SPRITE_HEIGHT[name] > 0, `${name}: a body with no height`);
}

/** A plan measured in metres, from the real vertices of the real unit solids. */
function bounds(plan) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const part of plan.parts) {
    const verts = VERTS[part.mesh];
    const m = place(part.at, 0, part.rot, part.scale);
    for (const [x, y, z] of verts) {
      const w = [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
      ];
      for (let k = 0; k < 3; k += 1) {
        lo[k] = Math.min(lo[k], w[k]);
        hi[k] = Math.max(hi[k], w[k]);
      }
    }
  }
  return { lo, hi };
}

const finite = (part) =>
  part.at.every(Number.isFinite) &&
  part.scale.every(Number.isFinite) &&
  part.rot.every(Number.isFinite) &&
  part.color.every(Number.isFinite);

/** How deep each kind of body is allowed to be, as a multiple of its height. */
const DEPTH = { person: 1.1, dog: 1.8, cat: 1.8, bird: 1.2 };

for (const name of names) {
  const height = SPRITE_HEIGHT[name];
  const build = bodyPlan(name, { height }).build;
  const reach = DEPTH[build] || 1.1;
  let tallest = 0;
  let lowest = Infinity;
  for (const pose of ['idle', 'walk']) {
    for (let step = 0; step < 20; step += 1) {
      const phase = step / 20;
      const plan = bodyPlan(name, { height, pose, phase });
      const where = `${name} ${pose} @${phase}`;
      check(plan && Array.isArray(plan.parts) && plan.parts.length > 6, `${where}: no body`);
      if (!plan || !plan.parts) continue;

      check(plan.parts.every(finite), `${where}: a part has a NaN in it`);
      check(
        plan.parts.every((part) => MESHES.includes(part.mesh)),
        `${where}: a part is made of a shape the renderer does not upload`,
      );
      check(
        plan.parts.every((part) => part.scale.every((s) => s > 0)),
        `${where}: a part has a scale of zero, which is a matrix nobody can invert`,
      );
      check(
        plan.parts.every((part) => part.color.every((c) => c >= 0 && c <= 1)),
        `${where}: a part has a colour outside 0..1`,
      );
      check(
        plan.parts.every((part) => part.rough >= 0 && part.rough <= 1),
        `${where}: a part has a roughness outside 0..1`,
      );

      const { lo, hi } = bounds(plan);
      tallest = Math.max(tallest, hi[1] / height);
      lowest = Math.min(lowest, lo[1] / height);

      // nothing may go through the floor, and something must reach it
      check(lo[1] > -0.012 * height, `${where}: a part reaches ${(lo[1] / height).toFixed(3)} of the height below the floor`);
      check(lo[1] < 0.08 * height, `${where}: the body floats ${(lo[1] / height).toFixed(3)} of the height above the floor`);
      // and the head has to be where the height says it is
      check(
        hi[1] > 0.86 * height && hi[1] < 1.26 * height,
        `${where}: the body is ${(hi[1] / height).toFixed(3)} of its height tall`,
      );
      // a body is taller than it is wide, or it is not standing up
      check(hi[0] - lo[0] < height, `${where}: ${((hi[0] - lo[0]) / height).toFixed(2)} of the height wide`);
      // depth is a different story: a dog with a tail is longer than it is tall,
      // and a person's stride reaches out in front of them
      check(
        hi[2] - lo[2] < height * reach,
        `${where}: ${((hi[2] - lo[2]) / height).toFixed(2)} of the height deep, and ${reach} is the limit`,
      );

      check(plan.radius > height * 0.08, `${where}: a collision radius of ${plan.radius} m is a point`);
      check(plan.radius < height * 0.75, `${where}: a collision radius of ${plan.radius} m is a wall`);
      check(plan.lift >= 0 && plan.lift < 0.1 * height, `${where}: it hops ${(plan.lift / height).toFixed(3)} of its height`);
    }
  }
  check(tallest > 0.86, `${name}: never stands taller than ${tallest.toFixed(2)} of its height`);
  check(lowest > -0.012, `${name}: sinks to ${lowest.toFixed(3)} of its height below the floor`);
}

/* ---------- the pose has to be a pose ---------- */

const spread = (plan) => {
  const { lo, hi } = bounds(plan);
  return { y: hi[1] - lo[1], z: hi[2] - lo[2], bottom: lo[1] };
};

for (const name of names) {
  const height = SPRITE_HEIGHT[name];
  const opts = { height };
  const still = bodyPlan(name, { ...opts, pose: 'idle' });
  const stepping = bodyPlan(name, { ...opts, pose: 'walk', phase: 0.25 });

  // walking has to move something: a leg, a wing, a whole waddle
  const animated = stepping.parts.some((part, i) => {
    const other = still.parts[i];
    return (
      other &&
      Math.hypot(part.at[0] - other.at[0], part.at[1] - other.at[1], part.at[2] - other.at[2]) > 0.01 * height
    );
  });
  check(animated, `${name}: walking animates nothing`);

  // a person's stride shows up as depth: the feet go forward and back
  if (still.build === 'person') {
    const walkDeep = spread(stepping).z;
    const idleDeep = spread(still).z;
    check(
      walkDeep > idleDeep + 0.02 * height,
      `${name}: walking takes no step (${idleDeep.toFixed(2)} -> ${walkDeep.toFixed(2)} m)`,
    );
  }

  // half a cycle later a leg that was forward must be back: the animation moves
  const a = bodyPlan(name, { ...opts, pose: 'walk', phase: 0.25 });
  const b = bodyPlan(name, { ...opts, pose: 'walk', phase: 0.75 });
  const moved = a.parts.some((part, i) => {
    const other = b.parts[i];
    return (
      other &&
      Math.hypot(part.at[0] - other.at[0], part.at[1] - other.at[1], part.at[2] - other.at[2]) > 0.01 * height
    );
  });
  check(moved, `${name}: the walk cycle is not a cycle`);

  // a full turn of the phase is the same body
  const start = bodyPlan(name, { ...opts, pose: 'walk', phase: 0 });
  const wrap = bodyPlan(name, { ...opts, pose: 'walk', phase: 1 });
  const same = start.parts.every((part, i) => part.at.every((v, k) => near(v, wrap.parts[i].at[k], 1e-9)));
  check(same, `${name}: phase 1 is not phase 0`);

  // leaning moves the head forward, and bends the spine down
  if (bodyPlan(name, opts).build === 'person') {
    const upright = spread(bodyPlan(name, { ...opts, lean: 0 }));
    const leaning = spread(bodyPlan(name, { ...opts, lean: 0.34 }));
    check(leaning.z > upright.z, `${name}: leaning over leans nothing`);
    check(leaning.y < upright.y, `${name}: leaning over does not bend the spine`);
  }
}

/* ---------- height is a scale, not a suggestion ---------- */

for (const name of ['mama', 'baby', 'dog']) {
  if (!names.includes(name)) continue;
  const small = bounds(bodyPlan(name, { height: 0.8 })).hi[1];
  const big = bounds(bodyPlan(name, { height: 1.6 })).hi[1];
  check(near(big / small, 2, 0.02), `${name}: doubling the height changes it by ${(big / small).toFixed(2)}x`);
}

/* ---------- the road onto the GPU, without a GPU ---------- */

/**
 * A context that only remembers. It is enough to prove that uploading, binding
 * and drawing agree about the buffer layout — the one thing a body part shares
 * with the walls of the room. Get the stride wrong and every limb draws as a
 * smear; bind no element buffer and an indexed solid draws as three vertices.
 */
function fakeGL() {
  const TARGETS = { ARRAY_BUFFER: 0x8892, ELEMENT_ARRAY_BUFFER: 0x8893 };
  const calls = { buffers: [], attribs: [], draws: [], deleted: [], enabled: [] };
  const bound = { [TARGETS.ARRAY_BUFFER]: null, [TARGETS.ELEMENT_ARRAY_BUFFER]: null };
  let last = null;
  return {
    calls,
    ...TARGETS,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    TRIANGLES: 0x0004,
    UNSIGNED_SHORT: 0x1403,
    createBuffer() {
      const handle = { id: calls.buffers.length, data: null };
      calls.buffers.push(handle);
      return handle;
    },
    bindBuffer(target, handle) {
      bound[target] = handle;
      if (target === TARGETS.ELEMENT_ARRAY_BUFFER) calls.elementBound = handle;
      last = handle;
    },
    bufferData(target, data) {
      if (bound[target]) bound[target].data = data;
    },
    enableVertexAttribArray(slot) {
      calls.enabled.push(slot);
    },
    vertexAttribPointer(slot, size, type, normalised, stride, offset) {
      calls.attribs.push([slot, size, type, normalised, stride, offset, last]);
    },
    drawElements(mode, count, type, offset) {
      calls.draws.push(['elements', mode, count, type, offset, bound[0x8893]]);
    },
    drawArrays(mode, first, count) {
      calls.draws.push(['arrays', mode, first, count]);
    },
    deleteBuffer(handle) {
      calls.deleted.push(handle);
    },
  };
}

const gl = fakeGL();
const uploaded = uploadMeshes(gl);
const shapes = bodyGeometry();

check(Object.keys(uploaded).length === Object.keys(shapes).length, 'uploadMeshes lost a shape');
for (const [name, mesh] of Object.entries(uploaded)) {
  const geom = shapes[name];
  check(mesh.count === geom.count, `${name}: ${mesh.count} indices uploaded, ${geom.count} built`);
  check(mesh.vertices === geom.data.length / 6, `${name}: ${mesh.vertices} vertices uploaded, ${geom.data.length / 6} built`);
  check(mesh.handle && mesh.handle.data instanceof Float32Array, `${name}: the vertices are not in a float buffer`);
  check(mesh.handle && mesh.handle.data.length % 6 === 0, `${name}: the vertex buffer is not a whole number of vertices`);
  check(mesh.element && mesh.element.data instanceof Uint16Array, `${name}: the indices are not in a short buffer`);
}

// the layout meshes.js promises and the layout every shader in the room reads
check(
  MESH_LAYOUT.length === 2 &&
    MESH_LAYOUT[0][0] === 'aPos' && MESH_LAYOUT[0][1] === 3 && MESH_LAYOUT[0][2] === 0 &&
    MESH_LAYOUT[1][0] === 'aNrm' && MESH_LAYOUT[1][1] === 3 && MESH_LAYOUT[1][2] === 12 &&
    MESH_LAYOUT[0][3] === 24 && MESH_LAYOUT[1][3] === 24,
  'the mesh layout is not position then normal, 24 bytes a vertex',
);

/** A program whose attribute slots can be looked up the way gl.js does it. */
const program = (slots) => ({ attrib: (name) => (name in slots ? slots[name] : -1) });

const capsule = uploaded.capsule;
const both = program({ aPos: 0, aNrm: 1 });
gl.calls.elementBound = null;
bindMesh(gl, both, capsule);
const [pos, nrm] = gl.calls.attribs;
check(
  gl.calls.attribs.length === 2 &&
    pos.slice(0, 6).join() === ['0', 3, gl.FLOAT, false, 24, 0].join() &&
    nrm.slice(0, 6).join() === ['1', 3, gl.FLOAT, false, 24, 12].join(),
  `a mesh binds as ${JSON.stringify(gl.calls.attribs.map((a) => a.slice(0, 6)))}`,
);
check(gl.calls.enabled.join() === '0,1', 'binding a mesh does not switch its attributes on');
check(
  gl.calls.attribs.every((a) => a[6] === capsule.handle),
  'a mesh binds a buffer that is not its own',
);
check(gl.calls.elementBound === capsule.element, 'binding a mesh does not bind its indices');

// a program without normals still gets its positions
bindMesh(gl, program({ aPos: 3 }), capsule);
const lastAttribs = gl.calls.attribs.slice(-1);
check(
  lastAttribs.length === 1 && lastAttribs[0][0] === 3 && lastAttribs[0][1] === 3,
  'a program with no aNrm is sent something other than its positions',
);

// an indexed shape draws its indices; the room's cube has none and draws a range
gl.calls.draws.length = 0;
drawMesh(gl, capsule);
const drawn = gl.calls.draws[0] || [];
check(
  gl.calls.draws.length === 1 &&
    drawn[0] === 'elements' &&
    drawn[1] === gl.TRIANGLES &&
    drawn[2] === capsule.count &&
    drawn[3] === gl.UNSIGNED_SHORT &&
    drawn[4] === 0 &&
    drawn[5] === capsule.element,
  `an indexed solid draws ${JSON.stringify(drawn.slice(0, 5))}`,
);
drawMesh(gl, { handle: uploaded.sphere.handle, element: null, count: 36 });
const shoe = gl.calls.draws[1] || [];
check(
  gl.calls.draws.length === 2 && shoe[0] === 'arrays' && shoe[1] === gl.TRIANGLES && shoe[2] === 0 && shoe[3] === 36,
  `an unindexed solid draws ${JSON.stringify(shoe)}`,
);

releaseMeshes(gl, uploaded);
check(
  gl.calls.deleted.length === Object.keys(uploaded).length * 2,
  `releasing the meshes deleted ${gl.calls.deleted.length} buffers, not ${Object.keys(uploaded).length * 2}`,
);
check(
  gl.calls.deleted.includes(capsule.handle) && gl.calls.deleted.includes(capsule.element),
  'releasing the meshes left the capsule on the GPU',
);

/* ---------- bad input falls back instead of throwing ---------- */

check(bodyPlan('nobody') === null, 'a sprite with no body must plan to null');
check(bodyPlan('mama', { height: 0 }).height === 1, 'a zero height should fall back to a metre');
check(bodyPlan('mama', { height: NaN }).height === 1, 'a NaN height should fall back to a metre');
const wrapped = bodyPlan('mama', { pose: 'walk', phase: -0.25 });
check(near(wrapped.pose.phase, 0.75, 1e-9), 'a negative phase should wrap forwards');
const wild = bodyPlan('mama', { lean: 9, headPitch: -9 });
check(wild.pose.lean <= 0.9 && wild.pose.headPitch >= -0.6, 'lean and headPitch should be clamped');

/* ---------- a body is dressed in the colours of its card ---------- */

for (const name of names) {
  const spec = FIGURE_SPECS[name];
  const plan = bodyPlan(name, { height: 1 });
  for (const key of ['skin', 'top', 'hair']) {
    if (!spec[key]) continue;
    const want = hexToLinear(spec[key]);
    const used = plan.parts.some((part) => part.color.every((c, i) => near(c, want[i], 0.02)));
    check(used, `${name}: no part is painted ${key} ${spec[key]}`);
  }
}

if (problems.length) {
  console.error(`bodies: ${problems.length} problem(s)`);
  for (const problem of problems.slice(0, 40)) console.error(`  ${problem}`);
  process.exit(1);
}

const total = names.reduce((sum, name) => sum + bodyPlan(name, { height: SPRITE_HEIGHT[name] }).parts.length, 0);
const tris = Object.values(bodyGeometry()).reduce((sum, geom) => sum + geom.count / 3, 0) + 12;
console.log(`bodies ok: ${names.length} bodies, ${total} parts, ${tris} triangles of unit mesh`);

