// The solids a body is made of: one sphere, one dome, one capsule, one cone —
// and, for shoes and spectacles, the cube the room already has.
//
// A card can be a character; a body cannot. bodies3d.js describes a character as
// a list of parts, and every part names one of these five shapes and a scale in
// metres. So the shapes are *unit* shapes with a meaning attached:
//
//   sphere   radius 1, centred on the part's own origin (scale = radii)
//   dome     upper hemisphere, radius 1, flat at y = 0 (a hair cap sits on a skull)
//   capsule  radius 1, cap centres at y = -2 .. 2, so 6 units tall end to end
//            (so scale [r, len / 6, r] is a limb of exactly `len` and radius `r`)
//   cone     radius 1 at the base on y = 0, apex at y = 1 (a skirt, an ear, a beak)
//   box      the unit cube, sized in metres rather than half-extents
//
// The buffer layout is the one every shader in this project already reads
// (position then normal, 24 bytes), so a body part can go through the same
// SURFACE program and the same shadow pass as the walls. Nothing here touches a
// GPU at import time; `uploadMeshes` needs a context and takes one.

import { buffer, elementBuffer } from './gl.js';

/** position (3 floats) then normal (3 floats), tightly packed. */
export const MESH_LAYOUT = [
  ['aPos', 3, 0, 24],
  ['aNrm', 3, 12, 24],
];
const TAU = Math.PI * 2;

/**
 * Revolve a profile into a closed solid.
 *
 * `rings` runs from the top of the shape downwards, each ring `{ y, rad, nx, ny }`
 * where `rad` is its radius and `(nx, ny)` its normal in the meridian plane, so
 * both cylinders and spheres fall out of the same loop. Rings ordered downwards
 * with the angle running anticlockwise give outward-facing triangles, which is
 * what the room's back-face culling expects.
 */
function lathe(rings, segments, { bottom = false } = {}) {
  const positions = [];
  const index = [];
  const push = (x, y, z, nx, ny, nz) => {
    positions.push(x, y, z, nx, ny, nz);
    return positions.length / 6 - 1;
  };

  const rows = rings.map((ring) => {
    const row = [];
    const normalLen = Math.hypot(ring.nx, ring.ny) || 1;
    for (let s = 0; s <= segments; s += 1) {
      const theta = (s / segments) * TAU;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      row.push(
        push(
          cos * ring.rad,
          ring.y,
          sin * ring.rad,
          (cos * ring.nx) / normalLen,
          ring.ny / normalLen,
          (sin * ring.nx) / normalLen,
        ),
      );
    }
    return row;
  });

  for (let r = 0; r + 1 < rows.length; r += 1) {
    const top = rows[r];
    const low = rows[r + 1];
    for (let s = 0; s < segments; s += 1) {
      const a = top[s];
      const b = top[s + 1];
      const c = low[s + 1];
      const d = low[s];
      // a degenerate ring (the apex of a cone) has nothing to draw against
      if (rings[r].rad > 1e-5 && rings[r + 1].rad > 1e-5) index.push(a, b, c, a, c, d);
      else if (rings[r].rad > 1e-5) index.push(a, b, c);
      else if (rings[r + 1].rad > 1e-5) index.push(a, c, d);
    }
  }

  if (bottom) {
    // the cap gets its own rim, because a vertex cannot face the floor and the
    // wall at once: reusing the side's rim would shade the base as a slope
    const last = rings[rings.length - 1];
    const centre = push(0, last.y, 0, 0, -1, 0);
    const rim = [];
    for (let s = 0; s <= segments; s += 1) {
      const theta = (s / segments) * TAU;
      rim.push(push(Math.cos(theta) * last.rad, last.y, Math.sin(theta) * last.rad, 0, -1, 0));
    }
    for (let s = 0; s < segments; s += 1) index.push(centre, rim[s], rim[s + 1]);
  }

  return {
    data: new Float32Array(positions),
    index: new Uint16Array(index),
    count: index.length,
  };
}

/** A sphere of radius 1: eyes, noses, hands, hair tufts, skulls. */
export function sphereGeometry(rings = 14, segments = 20) {
  const profile = [];
  for (let r = 0; r <= rings; r += 1) {
    const phi = (r / rings) * Math.PI;
    profile.push({ y: Math.cos(phi), rad: Math.sin(phi), nx: Math.sin(phi), ny: Math.cos(phi) });
  }
  return lathe(profile, segments);
}

/** The top half of that sphere: a haircut, a shoulder, a bald patch. */
export function domeGeometry(rings = 8, segments = 20) {
  const profile = [];
  for (let r = 0; r <= rings; r += 1) {
    const phi = (r / rings) * (Math.PI / 2);
    profile.push({ y: Math.cos(phi), rad: Math.sin(phi), nx: Math.sin(phi), ny: Math.cos(phi) });
  }
  return lathe(profile, segments);
}

/**
 * A limb: radius 1, with hemispherical caps centred at y = ±2, so the shape is 6
 * units tall and 2 units thick.
 *
 * The cap centres are pushed out past the barrel on purpose. A capsule cannot be
 * stretched along its axis and keep round caps — the y scale stretches them too —
 * so the caps are made a small share of the whole: scaled [r, len / 6, r] a limb
 * is exactly `len` long and 2r thick, and its ends stay round for anything longer
 * than a few radii. A short, thick part (a neck) gets a blunt end, which is what a
 * neck meeting a head should look like anyway.
 */
export function capsuleGeometry(segments = 18, capRings = 4) {
  const profile = [];
  for (let r = 0; r <= capRings; r += 1) {
    const phi = (r / capRings) * (Math.PI / 2);
    // the last ring of a cap is the top of the barrel, so it carries a sideways
    // normal: no extra ring, and no zero-area band where the two would meet
    const side = r === capRings;
    profile.push({
      y: 2 + Math.cos(phi),
      rad: Math.sin(phi),
      nx: side ? 1 : Math.sin(phi),
      ny: side ? 0 : Math.cos(phi),
    });
  }
  for (let r = 0; r <= capRings; r += 1) {
    const phi = Math.PI / 2 + (r / capRings) * (Math.PI / 2);
    const side = r === 0;
    profile.push({
      y: -2 + Math.cos(phi),
      rad: Math.sin(phi),
      nx: side ? 1 : Math.sin(phi),
      ny: side ? 0 : Math.cos(phi),
    });
  }
  return lathe(profile, segments);
}

/** Base at y = 0, apex at y = 1: a hem, a skirt, a pointed ear, a beak. */
export function coneGeometry(segments = 20) {
  const slope = Math.SQRT1_2;
  return lathe(
    [
      { y: 1, rad: 0, nx: slope, ny: slope },
      { y: 0, rad: 1, nx: slope, ny: slope },
    ],
    segments,
    { bottom: true },
  );
}

/** All of them, once, keyed by the mesh name a body part uses. */
export function bodyGeometry() {
  return {
    sphere: sphereGeometry(),
    dome: domeGeometry(),
    capsule: capsuleGeometry(),
    cone: coneGeometry(),
  };
}

/* ---------- and onto the GPU ---------- */

/**
 * Upload the unit solids. Takes a context rather than reaching for one, so this
 * module still imports cleanly in Node.
 *
 * The cube is not here: the room already has one, and a body's shoes can wear it.
 */
export function uploadMeshes(gl) {
  const out = {};
  for (const [name, geom] of Object.entries(bodyGeometry())) {
    out[name] = {
      handle: buffer(gl, geom.data),
      element: elementBuffer(gl, geom.index),
      count: geom.count,
      vertices: geom.data.length / 6,
    };
  }
  return out;
}

/** Bind one mesh's vertices to whichever attributes `progRef` declares. */
export function bindMesh(gl, progRef, mesh) {
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.handle);
  const at = progRef.attrib('aPos');
  if (at >= 0) {
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, 3, gl.FLOAT, false, 24, 0);
  }
  const nrm = progRef.attrib('aNrm');
  if (nrm >= 0) {
    gl.enableVertexAttribArray(nrm);
    gl.vertexAttribPointer(nrm, 3, gl.FLOAT, false, 24, 12);
  }
  if (mesh.element) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.element);
}

export function drawMesh(gl, mesh) {
  if (mesh.element) gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  else gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
}

export function releaseMeshes(gl, set) {
  for (const mesh of Object.values(set)) {
    gl.deleteBuffer(mesh.handle);
    gl.deleteBuffer(mesh.element);
  }
}
