// Figures: the people and animals of murmur, drawn at sixteen times the detail
// of the painted maps.
//
// ./sprites.js authors a body as a 12x12 grid of palette letters. That reads
// well on an icon and as a mosaic when a 1.7 m adult fills a 286 px billboard:
// one "pixel" of that map is a fifth of a head. This module keeps the same
// palette identities (mama is pink, papa blue, the baby is aqua) and the same
// hard-edged, unblurred look, but rasterizes a figure on a 44x64 cell grid with
// form shading, an ink silhouette, a face, hair, clothes, folds and limbs that
// actually swing. Sixteen times the area, and the smallest unit is one cell
// instead of a twelfth of a body.
//
// Everything except the canvas wrapper is pure: figureGrid() returns pixels and
// runs in Node, so the art has tests (tools/figures-check.mjs) that can ask how
// much of a figure is shaded, whether a face exists, whether a walk cycle moves
// and whether two calls agree. No DOM, no randomness, no clock.

import { PALETTE } from './sprites.js';

/* ---------- colour ---------- */

function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  const text = hex.trim().replace(/^#/, '');
  const full =
    text.length === 3
      ? text
          .split('')
          .map((c) => c + c)
          .join('')
      : text;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

/** Multiply toward black; a shade never leaves the hue. */
const darken = (c, k) => c.map((v) => v * k);
/** Toward white; used for the lit band of a form. */
const lighten = (c, k) => c.map((v) => v + (255 - v) * k);

/** Four tones per material: deep shadow, shadow, base, highlight. */
function ramp(hex) {
  const base = hexToRgb(hex) || [200, 200, 200];
  return [darken(base, 0.56), darken(base, 0.76), base, lighten(base, 0.2)];
}

/** Key light: upper left, in front of the figure (so faces read, and stay lit). */
const LIGHT = (() => {
  const v = [-0.42, -0.66, 0.62];
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
})();

/** lit -> one of four tones. Three visible bands, as pixel art wants. */
function band(lit) {
  if (lit > 0.42) return 3;
  if (lit > -0.05) return 2;
  if (lit > -0.62) return 1;
  return 0;
}

/* ---------- the cell grid ---------- */

// A figure is a grid of material names plus a tone per cell. Nothing is drawn to
// a canvas until the very end, which is what makes the art testable.

export const INK = '#17111f'; // PALETTE.k, the same ink the painted sprites use

function raster(w, h) {
  return { w, h, mat: new Array(w * h).fill(''), tone: new Uint8Array(w * h) };
}

function put(r, x, y, mat, tone = 2) {
  if (x < 0 || y < 0 || x >= r.w || y >= r.h) return;
  const i = y * r.w + x;
  r.mat[i] = mat;
  r.tone[i] = tone;
}

/**
 * Fill every cell where `inside` returns a tone value (0..3), or null.
 * `inside` gets cell-centre floats, so shapes land between cells evenly.
 */
function fill(r, mat, inside) {
  for (let y = 0; y < r.h; y += 1) {
    for (let x = 0; x < r.w; x += 1) {
      const tone = inside(x + 0.5, y + 0.5);
      if (tone === null || tone === undefined) continue;
      put(r, x, y, mat, tone);
    }
  }
}

/** A ball: head, hand, shoulder, eye, snout. Shaded as a sphere. */
function sphere(r, mat, cx, cy, rx, ry, { squash = 1, tone = null, rot = 0 } = {}) {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y += 1) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x += 1) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const lx = dx * cos - dy * sin;
      const ly = (dx * sin + dy * cos) * squash;
      const d2 = lx * lx + ly * ly;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      const t = tone === null ? band(lx * LIGHT[0] + ly * LIGHT[1] + nz * LIGHT[2]) : tone;
      put(r, x, y, mat, t);
    }
  }
}

/**
 * A limb or a torso: a capsule between two points, shaded as a cylinder. The
 * perpendicular of the axis doubles as the screen-space normal, which is enough
 * for a body that only ever faces the camera.
 */
function limb(r, mat, x0, y0, x1, y1, rad, { tone = null, taper = 0, roll = 0.35 } = {}) {
  const ax = x1 - x0;
  const ay = y1 - y0;
  const len = Math.hypot(ax, ay) || 1;
  const ux = ax / len;
  const uy = ay / len;
  const px = -uy;
  const py = ux;
  const lo = Math.min(x0, x1) - rad - 1;
  const hi = Math.max(x0, x1) + rad + 1;
  const top = Math.min(y0, y1) - rad - 1;
  const bottom = Math.max(y0, y1) + rad + 1;

  for (let y = Math.floor(top); y <= Math.ceil(bottom); y += 1) {
    for (let x = Math.floor(lo); x <= Math.ceil(hi); x += 1) {
      const cx = x + 0.5 - x0;
      const cy = y + 0.5 - y0;
      const t = cx * ux + cy * uy;
      if (t < -rad * 0.4 || t > len + rad * 0.4) continue;
      const along = Math.max(0, Math.min(1, t / len));
      const radius = rad * (1 - taper * along);
      const across = cx * px + cy * py;
      const d = across / radius;
      if (Math.abs(d) > 1) continue;
      const nz = Math.sqrt(Math.max(0, 1 - d * d));
      const lit = d * (px * LIGHT[0] + py * LIGHT[1]) + nz * LIGHT[2] * (1 - roll) + 0.16;
      put(r, x, y, mat, tone === null ? band(lit) : tone);
    }
  }
}

/** A flat plate: collar, sole, bib, tail feather. Optional tone. */
function plate(r, mat, x, y, w, h, tone = 2) {
  for (let yy = Math.floor(y); yy < Math.ceil(y + h); yy += 1) {
    for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx += 1) put(r, xx, yy, mat, tone);
  }
}

/** One cell wide line, for strands, folds, laces and whiskers. */
function line(r, mat, x0, y0, x1, y1, tone = 2, thickness = 1) {
  const steps = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    for (let w = 0; w < thickness; w += 1) put(r, x + w, y, mat, tone);
  }
}

/** A filled polygon (ears, beaks, flanges), flat tone. */
function polygon(r, mat, points, tone = 2) {
  const ys = points.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y += 1) {
    const xs = [];
    for (let i = 0; i < points.length; i += 1) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      if (y0 === y1) continue;
      if ((y + 0.5 >= y0 && y + 0.5 < y1) || (y + 0.5 >= y1 && y + 0.5 < y0)) {
        xs.push(x0 + ((y + 0.5 - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x += 1) put(r, x, y, mat, tone);
    }
  }
}

/* ---------- people ---------- */

/**
 * Where everything sits in a figure's box. One layout for every human, so a
 * child is a smaller adult rather than a different drawing.
 */
function layoutFor(spec) {
  const [w, h] = spec.box;
  const cx = w / 2;
  const headR = Math.max(5, Math.round(w * 0.235));
  const headCY = headR + 2;
  const shoulderY = headCY + headR + 2;
  const ground = h - 1;
  const shoeH = Math.max(3, Math.round(h * 0.055));
  const ankleY = ground - Math.max(2, Math.round(shoeH * 0.55));
  const torsoRoom = Math.max(7, ground - shoeH - shoulderY);
  const hipY = shoulderY + Math.round(torsoRoom * 0.55);
  return {
    w,
    h,
    cx,
    headR,
    headCY,
    shoulderY,
    hipY,
    ankleY,
    ground,
    shoeH,
    half: Math.max(4, headR - 1), // shoulder half-width: a little inside the head
    waist: Math.max(3, headR - 2.5),
    legX: Math.max(2, Math.round(headR * 0.45)),
    armR: Math.max(1.7, w * 0.05),
    legR: Math.max(2, w * 0.062),
  };
}

/** A vertical, slightly tapered body: cylinder shading, rounded shoulders. */
function torsoShape(r, mat, L, { top, bottom, half, waist, tone = null }) {
  fill(r, mat, (x, y) => {
    if (y < top || y > bottom) return null;
    const t = Math.max(0, Math.min(1, (y - top) / Math.max(1, bottom - top)));
    let reach = half * (1 - t) + waist * t;
    // round the shoulders off: the first two rows are narrower
    if (y < top + 2) reach *= 0.8 + 0.1 * (y - top);
    const nx = (x - L.cx) / reach;
    if (Math.abs(nx) > 1) return null;
    const nz = Math.sqrt(1 - nx * nx);
    return tone === null ? band(nx * LIGHT[0] + nz * LIGHT[2] * 0.92 + 0.2) : tone;
  });
}

/** One arm: shoulder, elbow, wrist, with a hand. `swing` is the walk phase. */
function drawArm(r, spec, L, side, pose, swing) {
  const sx = L.cx + side * (L.half - 0.4);
  const sy = L.shoulderY + 2.5;
  let ex = L.cx + side * (L.half + 1.4);
  let ey = L.shoulderY + 6;
  let hx = L.cx + side * (L.half + 2.2);
  let hy = L.hipY + 1.5;

  if (pose === 'walk') {
    ex += swing * side * 0.5;
    hx += swing * side * 1.6;
    hy -= Math.abs(swing) * 1.2;
  } else if (pose === 'lean') {
    ex += side * 1.2;
    hx += side * 2.4;
    hy += 3;
  } else if (pose === 'wave' && side > 0) {
    ex = L.cx + L.half + 3.5;
    ey = L.shoulderY - 1;
    hx = L.cx + L.half + 4.5;
    hy = L.shoulderY - 4.5;
  }

  const sleeve = spec.garment === 'tee' ? 0.45 : spec.garment === 'dress' ? 0.72 : 1;
  const elbowT = { x: sx + (ex - sx) * sleeve, y: sy + (ey - sy) * sleeve };
  const lower = sleeve < 1 ? 'skin' : 'top';

  limb(r, 'top', sx, sy, elbowT.x, elbowT.y, L.armR, { taper: 0.1 });
  sphere(r, 'top', elbowT.x, elbowT.y, L.armR, L.armR);
  if (sleeve < 1) {
    limb(r, 'skin', elbowT.x, elbowT.y, hx, hy, L.armR * 0.92, { taper: 0.08 });
    plate(r, 'top', Math.round(elbowT.x) - 2, Math.round(elbowT.y), 4, 1, 1);
  } else {
    limb(r, 'top', elbowT.x, elbowT.y, hx, hy, L.armR * 0.95, { taper: 0.08 });
    // a cuff: one dark row where the sleeve ends
    plate(r, 'top', Math.round(hx) - 2, Math.round(hy) - 1, 4, 1, 1);
  }
  // the inner edge of the arm, so it reads as a limb and not as part of the body
  line(r, lower, elbowT.x - side * (L.armR - 0.3), elbowT.y, hx - side * (L.armR - 0.3), hy - 1, 1);
  sphere(r, 'skin', hx, hy, L.armR * 1.05, L.armR * 1.1);
  // fingers: a shadow line across the hand
  line(r, 'skin', hx - 1.5, hy + 0.5, hx + 1.5, hy + 0.5, 1);
}

/** A sphere's shading as a function of position, so a fill can clip and shade. */
function sphereField(cx, cy, rx, ry, squash = 1) {
  return (x, y) => {
    const dx = (x - cx) / rx;
    const dy = ((y - cy) / ry) * squash;
    const d2 = dx * dx + dy * dy;
    if (d2 > 1) return null;
    const nz = Math.sqrt(1 - d2);
    return band(dx * LIGHT[0] + dy * LIGHT[1] + nz * LIGHT[2]);
  };
}

/** The skull: an egg, plus ears, plus a chin that narrows instead of stacking. */
function drawHead(r, spec, L, view) {
  const { cx, headCY, headR } = L;
  if (view === 'side') {
    // the jaw narrowing to a chin; the ear goes on last, over the cheek
    sphere(r, 'skin', cx - headR * 0.15, headCY + headR * 0.5, headR * 0.9, headR * 0.6);
    sphere(r, 'skin', cx + headR * 0.1, headCY + headR * 0.56, headR * 0.7, headR * 0.42);
  } else {
    sphere(r, 'skin', cx - headR * 0.95, headCY + headR * 0.3, 1.9, 2.2);
    sphere(r, 'skin', cx + headR * 0.95, headCY + headR * 0.3, 1.9, 2.2);
    sphere(r, 'skin', cx, headCY + headR * 0.5, headR * 0.84, headR * 0.58);
    sphere(r, 'skin', cx, headCY + headR * 0.62, headR * 0.62, headR * 0.4);
  }
  sphere(r, 'skin', cx, headCY, headR, headR * 1.02);
  if (view === 'side') {
    // in profile the ear sits on the near cheek, so it is drawn over it
    sphere(r, 'skin', cx + headR * 0.1, headCY + headR * 0.2, headR * 0.22, headR * 0.28);
  }
}

/**
 * The face: sclera, iris, pupil, catchlight, lash line, brow, nose shadow, mouth
 * and blush. All of it is derived from the head radius, so a child's face is the
 * same drawing at a smaller size.
 */
function drawFace(r, spec, L, view) {
  const { cx, headCY, headR } = L;
  const eyeR = Math.max(1.6, headR * 0.235);
  const eyeY = headCY + headR * 0.18;
  const eyeDX = headR * 0.4;
  const eyes =
    view === 'side'
      ? [{ x: cx + headR * 0.62, y: eyeY }]
      : [{ x: cx - eyeDX, y: eyeY }, { x: cx + eyeDX, y: eyeY }];

  for (const eye of eyes) {
    sphere(r, 'white', eye.x, eye.y, eyeR * 1.18, eyeR * 1.28);
    sphere(r, 'iris', eye.x, eye.y + eyeR * 0.04, eyeR * 0.82, eyeR * 0.94);
    put(r, Math.round(eye.x - eyeR * 0.45), Math.round(eye.y - eyeR * 0.55), 'white', 3);
    // brows only where the fringe leaves the forehead bare
    if (spec.hairStyle === 'bald') {
      plate(r, 'hair', Math.round(eye.x - eyeR), Math.round(eye.y - eyeR * 2.1), Math.max(2, Math.round(eyeR * 2)), 1, 2);
    }
  }

  if (view === 'side') {
    // a nose to point the profile, and a mouth cut short by the cheek
    sphere(r, 'skin', cx + headR * 0.96, eyeY + eyeR * 0.9, 1.6, 1.4);
    plate(r, 'mouth', Math.round(cx + headR * 0.62), Math.round(eyeY + eyeR * 2.4), 2, 1, 2);
  } else {
    put(r, Math.round(cx), Math.round(eyeY + eyeR * 1.35), 'skin', 1);
    const mouthY = Math.round(eyeY + eyeR * 2.1);
    plate(r, 'mouth', Math.round(cx) - 1, mouthY, 3, 1, 1);
    if ((spec.extras || []).includes('smile')) {
      put(r, Math.round(cx) - 2, mouthY - 1, 'mouth', 1);
      put(r, Math.round(cx) + 2, mouthY - 1, 'mouth', 1);
    }
    if ((spec.extras || []).includes('blush')) {
      plate(r, 'blush', Math.round(cx - eyeDX - eyeR * 1.5), Math.round(eyeY + eyeR * 1.4), 2, 1, 2);
      plate(r, 'blush', Math.round(cx + eyeDX + eyeR * 0.6), Math.round(eyeY + eyeR * 1.4), 2, 1, 2);
    }
  }

  if ((spec.extras || []).includes('glasses')) {
    // a rectangular lens ring: cheap, and it reads as spectacles at any size
    const lens = (spot) => {
      const left = Math.round(spot.x - eyeR * 1.35);
      const right = Math.round(spot.x + eyeR * 1.35);
      const top = Math.round(spot.y - eyeR * 1.5);
      const bottom = Math.round(spot.y + eyeR * 1.5);
      for (let x = left; x <= right; x += 1) {
        put(r, x, top, 'glass', 2);
        put(r, x, bottom, 'glass', 2);
      }
      for (let y = top; y <= bottom; y += 1) {
        put(r, left, y, 'glass', 2);
        put(r, right, y, 'glass', 2);
      }
    };
    for (const spot of eyes) lens(spot);
    const near = eyes[0].x + eyeR * 1.35;
    const far = (eyes[1] || eyes[0]).x - eyeR * 1.35;
    if (Math.abs(far - near) > 1 && view !== 'side') line(r, 'glass', near, eyeY, far, eyeY, 1);
    else line(r, 'glass', near, eyeY, cx + headR * 0.9, eyeY, 1);
  }
}

/* ---------- hair and clothes ---------- */

/**
 * Hair is a skull cap with the face cut out of it, then locks, then a style.
 * Drawing the cap *over* the head and cutting the face back in keeps the
 * hairline on the skull instead of floating in front of it.
 */
function drawHair(r, spec, L, view) {
  const { cx, headCY, headR } = L;
  const style = spec.hairStyle || 'short';
  const capRX = headR + 0.9;
  const capRY = headR + 1.8;
  const capCY = headCY - headR * 0.24;
  const field = sphereField(cx, capCY, capRX, capRY);
  const crop = style === 'short' || style === 'messy';
  const browY = headCY - headR * (crop ? 0.44 : 0.52);
  const faceHalf = headR * (crop ? 0.98 : 0.9);
  const fringe = (x) => browY + Math.sin((x - cx) * 0.62 + 0.9) * headR * (crop ? 0.1 : 0.14);

  if (style !== 'bald') {
    fill(r, 'hair', (x, y) => {
      const tone = field(x, y);
      if (tone === null) return null;
      if (view === 'front' && Math.abs(x - cx) < faceHalf && y > fringe(x)) return null;
      // in profile only the front of the face is clear: the rest is hair
      if (view === 'side' && x > cx + headR * 0.46 && y > fringe(x)) return null;
      return tone;
    });
  } else {
    fill(r, 'hair', (x, y) => {
      const tone = field(x, y);
      if (tone === null) return null;
      return y < capCY - headR * 0.35 ? tone : null;
    });
  }

  const locksTo = style === 'bob' ? headCY + headR * (spec.kit === 'adult' ? 1 : 0.85) : headCY + headR * 0.5;
  const longHair = style === 'bob' || style === 'bun' || style === 'pony';
  for (const side of [-1, 1]) {
    if (view === 'side' && side < 0) continue; // the far lock sits behind the head
    if (!longHair) {
      // a crop has sideburns, not locks: one cell at the temple
      const sx0 = cx + side * (headR * 0.9);
      line(r, 'hair', sx0, headCY - headR * 0.1, sx0 + side * 0.2, headCY + headR * 0.42, 1);
      continue;
    }
    const lx = cx + side * headR * 0.95;
    limb(r, 'hair', lx, headCY - headR * 0.4, lx + side * 0.3, locksTo, Math.max(2.2, headR * 0.26), { taper: 0.12 });
  }

  if (style === 'bun') {
    sphere(r, 'hair', cx, capCY - capRY * 0.9, headR * 0.44, headR * 0.4);
    put(r, Math.round(cx - headR * 0.15), Math.round(capCY - capRY * 0.95), 'hair', 3);
  } else if (style === 'pony') {
    const px = cx + headR * 0.7;
    limb(r, 'hair', px, capCY + headR * 0.1, px + headR * 0.55, capCY + headR * 1.1, headR * 0.24, { taper: 0.4 });
  } else if (style === 'messy' || style === 'curls') {
    const tufts = style === 'curls' ? [-0.72, -0.24, 0.24, 0.72] : [-0.55, 0.02, 0.58];
    for (const t of tufts) {
      const tx = cx + headR * t;
      const ty = capCY - capRY * 0.7;
      sphere(r, 'hair', tx, ty, headR * 0.3, headR * 0.26);
      polygon(r, 'hair', [
        [tx - headR * 0.28, ty],
        [tx - headR * 0.1, ty - headR * 0.55],
        [tx + headR * 0.22, ty - headR * 0.1],
      ], 1);
    }
  }

  // the light catching the crown, and one strand on the fall of the hair
  line(r, 'hair', cx - headR * 0.62, capCY - headR * 0.7, cx - headR * 0.05, capCY - headR * 1.05, 3);
  line(r, 'hair', cx - headR * 0.95, capCY - headR * 0.55, cx - headR * 0.6, capCY - headR * 0.95, 3);
  line(r, 'hair', cx + headR * 0.5, capCY - headR * 0.95, cx + headR * 0.72, capCY - headR * 0.4, 1);
  if (longHair) line(r, 'hair', cx - headR * 0.95, capCY + headR * 0.1, cx - headR * 1.0, capCY + headR * 0.7, 1);
}

/** Collar, buttons, straps, skirt and folds: the parts that make cloth read. */
function drawClothes(r, spec, L, view) {
  const { cx, shoulderY, hipY } = L;
  const extras = spec.extras || [];
  const bodyHalf = L.half;
  const neckY = shoulderY;
  const garment = spec.garment || 'shirt';

  // throat, then a collar sitting on the shoulders
  plate(r, 'skin', Math.round(cx) - 1.5, neckY - 2, 3, 3, 1);
  if (view !== 'back') {
    plate(r, 'top', Math.round(cx) - 4, neckY, 3, 1, 3);
    plate(r, 'top', Math.round(cx) + 2, neckY, 3, 1, 3);
  } else {
    plate(r, 'top', Math.round(cx) - 3, neckY - 1, 6, 1, 1);
  }

  if (garment === 'apron' || garment === 'overalls') {
    const bibTop = shoulderY + 2;
    const bibH = Math.max(4, Math.round(hipY - bibTop - 1));
    plate(r, 'accent', Math.round(cx - bodyHalf * 0.52), bibTop, Math.round(bodyHalf), bibH, 2);
    line(r, 'accent', cx - bodyHalf * 0.62, neckY, cx - bodyHalf * 0.42, bibTop, 2);
    line(r, 'accent', cx + bodyHalf * 0.62, neckY, cx + bodyHalf * 0.42, bibTop, 2);
    put(r, Math.round(cx - bodyHalf * 0.42), bibTop + 1, 'accent', 0);
    put(r, Math.round(cx + bodyHalf * 0.42), bibTop + 1, 'accent', 0);
    line(r, 'accent', cx - bodyHalf * 0.4, bibTop + bibH - 1, cx + bodyHalf * 0.4, bibTop + bibH - 1, 1);
  } else if (garment === 'dress') {
    const skirtTop = hipY;
    const skirtBottom = hipY + Math.round(L.h * 0.1);
    for (let y = skirtTop; y <= skirtBottom; y += 1) {
      const t = (y - skirtTop) / Math.max(1, skirtBottom - skirtTop);
      const reach = bodyHalf * (1 + t * 0.28);
      plate(r, 'top', Math.round(cx - reach), y, Math.round(reach * 2), 1, t > 0.85 ? 1 : 2);
    }
    for (const t of [-0.5, 0, 0.5]) {
      line(r, 'top', cx + bodyHalf * t * 0.6, skirtTop + 1, cx + bodyHalf * t * 1.1, skirtBottom, 1);
    }
  } else if (view !== 'back') {
    // a placket down the middle with buttons, and two folds at the waist
    line(r, 'top', cx, neckY + 1, cx, hipY - 1, 1);
    for (let y = neckY + 3; y < hipY - 1; y += 3) put(r, Math.round(cx), y, 'accent', 2);
  }

  if (extras.includes('tie')) {
    line(r, 'accent', cx, neckY + 1, cx, neckY + 4, 2, 2);
    polygon(r, 'accent', [[cx - 1.5, neckY + 4], [cx + 1.5, neckY + 4], [cx, neckY + 9]], 2);
  }
  if (extras.includes('badge')) {
    put(r, Math.round(cx - bodyHalf * 0.55), Math.round(neckY + 4), 'accent', 3);
    put(r, Math.round(cx - bodyHalf * 0.55) + 1, Math.round(neckY + 4), 'accent', 1);
  }

  // folds: cloth always hangs, so the torso always has two shadows in it
  line(r, 'top', cx - bodyHalf * 0.55, shoulderY + 3, cx - bodyHalf * 0.42, hipY - 2, 1);
  line(r, 'top', cx + bodyHalf * 0.58, shoulderY + 4, cx + bodyHalf * 0.46, hipY - 2, 1);
  line(r, 'top', cx - bodyHalf * 0.72, hipY, cx + bodyHalf * 0.72, hipY, 1);
}

/** One leg: hip, knee, ankle, then a shoe with a sole and a lace. */
function drawLeg(r, spec, L, side, pose, swing) {
  const hx0 = L.cx + side * L.legX;
  const hip = [hx0, L.hipY - 1];
  let footX = hx0;
  let lift = 0;
  if (pose === 'walk') {
    footX = hx0 + swing * L.legX * 1.5;
    lift = swing > 0 ? 1.5 : 0;
  }
  const ankle = [footX, L.ankleY - lift];
  const knee = [(hip[0] + ankle[0]) / 2 + side * 0.4, (hip[1] + ankle[1]) / 2];

  limb(r, 'bottom', hip[0], hip[1], knee[0], knee[1], L.legR, { taper: 0.06 });
  sphere(r, 'bottom', knee[0], knee[1], L.legR, L.legR * 0.9);
  limb(r, 'bottom', knee[0], knee[1], ankle[0], ankle[1], L.legR * 0.9, { taper: 0.1 });

  const footW = Math.max(3, L.legR * 1.35);
  const footY = L.ground - L.shoeH * 0.5 - lift;
  sphere(r, 'shoe', ankle[0] + (L.view === 'side' ? 1 : 0), footY, footW, L.shoeH * 0.62, {
    squash: 0.9,
  });
  plate(r, 'shoe', Math.round(ankle[0] - footW + 0.4), Math.round(L.ground - 1 - lift), Math.round(footW * 2 - 0.8), 1, 0);
  line(r, 'shoe', ankle[0] - 1, footY - 1, ankle[0] + 1, footY - 1, 3);
}

/* ---------- the person ---------- */

/** Leg swing per walk frame: contact, pass, contact (mirrored), pass. */
const WALK = [-1, -0.3, 1, 0.3];

function drawPerson(spec, opts) {
  const view = opts.view === 'back' || opts.view === 'side' ? opts.view : 'front';
  const pose = opts.pose || 'idle';
  const frame = Math.abs(Math.round(opts.frame || 0)) % 4;
  const swing = pose === 'walk' ? WALK[frame] : 0;
  const L = layoutFor(spec);
  const r = raster(L.w, L.h);
  const skirt = spec.garment === 'dress' ? Math.round(L.h * 0.16) : 0;

  // back to front: legs, far arm, body, near arm, then the head
  drawLeg(r, spec, { ...L, view }, -1, pose, -swing);
  drawLeg(r, spec, { ...L, view }, 1, pose, swing);
  if (view !== 'side') drawArm(r, spec, L, -1, pose, -swing);
  torsoShape(r, 'top', L, {
    top: L.shoulderY,
    bottom: L.hipY + skirt,
    half: L.half,
    waist: skirt ? L.half + 1 : L.waist,
  });
  drawClothes(r, spec, L, view);
  drawArm(r, spec, L, 1, pose, swing);

  // the neck, then the head — leaning forward brings both with it
  const lean = pose === 'lean' ? 1 : 0;
  const HL = lean
    ? { ...L, cx: L.cx + L.headR * 0.34, headCY: L.headCY + L.headR * 0.24 }
    : L;
  limb(r, 'skin', L.cx, L.shoulderY - 1, HL.cx, HL.headCY + HL.headR * 0.7, Math.max(1.6, L.headR * 0.3));

  drawHead(r, spec, HL, view);
  drawHair(r, spec, HL, view);
  if (view !== 'back') drawFace(r, spec, HL, view);

  if ((spec.extras || []).includes('bib')) {
    put(r, Math.round(HL.cx - 1), Math.round(HL.headCY + HL.headR * 1.35), 'accent', 2);
    put(r, Math.round(HL.cx + 1), Math.round(HL.headCY + HL.headR * 1.35), 'accent', 2);
  }

  return r;
}

/* ---------- animals ---------- */
//
// Same grid, same shading, different skeleton: a barrel body on four legs, a
// curled tail, a profile head. Fur is the 'hair' ramp, the pale underside the
// 'top' ramp, so a spec names three colours and gets a whole animal.

function drawDog(spec, opts) {
  const [w, h] = spec.box;
  const r = raster(w, h);
  const swing = opts.pose === 'walk' ? WALK[Math.abs(Math.round(opts.frame || 0)) % 4] : 0;
  const ground = h - 2;
  const bodyY = h * 0.5;
  const haunchX = w * 0.26;
  const chestX = w * 0.62;
  const headX = w * 0.78;
  const headY = h * 0.29;
  const bodyR = h * 0.21;

  // the far pair of legs first, so the barrel sits over them
  for (const [dx, sw] of [[0.24, -swing], [0.58, swing]]) {
    const x = w * dx;
    limb(r, 'hair', x, bodyY + bodyR * 0.6, x + sw * 1.4, ground - 1, w * 0.048, { taper: 0.12 });
    sphere(r, 'hair', x + sw * 1.4, ground - 1, w * 0.05, h * 0.045);
  }

  // barrel: haunch, back, chest
  sphere(r, 'hair', haunchX, bodyY + 1, w * 0.135, bodyR * 1.05);
  limb(r, 'hair', haunchX, bodyY, chestX, bodyY - bodyR * 0.2, bodyR, { taper: 0.06 });
  sphere(r, 'hair', chestX, bodyY - bodyR * 0.2, w * 0.115, bodyR);
  // a paler chest and belly, the way the painted dog is two-toned
  sphere(r, 'top', chestX + w * 0.02, bodyY + bodyR * 0.35, w * 0.08, bodyR * 0.55);
  plate(r, 'top', Math.round(haunchX + w * 0.02), Math.round(bodyY + bodyR * 0.72), Math.round((chestX - haunchX) * 0.9), 1, 2);

  // near front legs
  for (const [dx, sw] of [[0.66, swing], [0.72, -swing]]) {
    const x = w * dx;
    limb(r, 'hair', x, bodyY + bodyR * 0.55, x + sw * 1.4, ground - 1, w * 0.044, { taper: 0.12 });
    sphere(r, 'top', x + sw * 1.4, ground - 1, w * 0.05, h * 0.045);
    plate(r, 'hair', Math.round(x + sw * 1.4 - w * 0.045), ground, Math.round(w * 0.09), 1, 0);
  }

  // tail, up and over
  limb(r, 'hair', haunchX - w * 0.1, bodyY - bodyR * 0.5, w * 0.03, bodyY - bodyR * 2.1, w * 0.045, { taper: 0.3 });
  sphere(r, 'hair', w * 0.03, bodyY - bodyR * 2.1, w * 0.045, w * 0.045);

  // neck and head
  limb(r, 'hair', chestX + w * 0.02, bodyY - bodyR * 0.5, headX, headY + h * 0.12, w * 0.085);
  sphere(r, 'hair', headX, headY, w * 0.145, h * 0.21);
  // muzzle, nose, mouth
  sphere(r, 'top', headX + w * 0.085, headY + h * 0.09, w * 0.068, h * 0.085);
  sphere(r, 'ink', headX + w * 0.14, headY + h * 0.07, w * 0.028, h * 0.038, { tone: 2 });
  put(r, Math.round(headX + w * 0.135), Math.round(headY + h * 0.045), 'white', 3);
  line(r, 'ink', headX + w * 0.09, headY + h * 0.135, headX + w * 0.145, headY + h * 0.135, 1);
  // the ear hangs behind the eye, not over it
  limb(r, 'hair', headX - w * 0.05, headY - h * 0.15, headX - w * 0.12, headY + h * 0.05, w * 0.045, { taper: 0.3 });
  sphere(r, 'hair', headX - w * 0.12, headY + h * 0.05, w * 0.045, h * 0.05);
  // eyes: forward on the muzzle, both visible in this three-quarter head
  for (const ex of [headX + w * 0.04, headX - w * 0.05]) {
    sphere(r, 'white', ex, headY - h * 0.04, w * 0.04, h * 0.055);
    sphere(r, 'iris', ex, headY - h * 0.03, w * 0.032, h * 0.045);
    put(r, Math.round(ex - w * 0.014), Math.round(headY - h * 0.075), 'white', 3);
  }
  // collar
  plate(r, 'accent', Math.round(headX - w * 0.11), Math.round(headY + h * 0.16), Math.round(w * 0.14), 2, 2);
  // fur: a highlight along the back, a shadow under the belly
  line(r, 'hair', haunchX, bodyY - bodyR * 0.72, chestX, bodyY - bodyR * 0.95, 3);
  line(r, 'hair', haunchX + w * 0.02, bodyY + bodyR * 0.6, chestX, bodyY + bodyR * 0.45, 1);
  return r;
}



function drawCat(spec, opts) {
  const [w, h] = spec.box;
  const r = raster(w, h);
  const ground = h - 2;
  const bodyY = h * 0.62;
  const haunchX = w * 0.36;
  const chestX = w * 0.58;
  const headX = w * 0.58;
  const headY = h * 0.3;

  // tail, curled up behind, banded like the painted cat's
  limb(r, 'hair', haunchX - w * 0.12, bodyY + h * 0.04, w * 0.14, bodyY - h * 0.16, w * 0.055, { taper: 0.25 });
  limb(r, 'hair', w * 0.14, bodyY - h * 0.16, w * 0.1, bodyY - h * 0.44, w * 0.045, { taper: 0.3 });
  line(r, 'hair', w * 0.16, bodyY - h * 0.06, w * 0.15, bodyY - h * 0.16, 1);
  line(r, 'hair', w * 0.12, bodyY - h * 0.28, w * 0.11, bodyY - h * 0.38, 1);

  // haunch, back, chest
  sphere(r, 'hair', haunchX, bodyY + h * 0.02, w * 0.21, h * 0.2);
  limb(r, 'hair', haunchX, bodyY, chestX, bodyY - h * 0.06, h * 0.19, { taper: 0.08 });
  sphere(r, 'hair', chestX, bodyY - h * 0.04, w * 0.16, h * 0.17);
  sphere(r, 'top', chestX + w * 0.03, bodyY + h * 0.02, w * 0.11, h * 0.12);

  // front legs: straight down from the chest, with paws
  for (const dx of [-0.06, 0.06]) {
    const x = chestX + w * dx;
    limb(r, 'hair', x, bodyY + h * 0.02, x, ground - 1, w * 0.052, { taper: 0.1 });
    sphere(r, 'top', x, ground - 1, w * 0.062, h * 0.045);
    plate(r, 'hair', Math.round(x - w * 0.05), ground, Math.round(w * 0.1), 1, 0);
  }

  // head, ears, face
  sphere(r, 'hair', headX, headY, w * 0.21, h * 0.19);
  for (const side of [-1, 1]) {
    const ex = headX + side * w * 0.12;
    polygon(r, 'hair', [
      [ex - w * 0.07, headY - h * 0.06],
      [ex + side * w * 0.02, headY - h * 0.24],
      [ex + w * 0.07, headY - h * 0.08],
    ], 2);
    polygon(r, 'blush', [
      [ex - w * 0.028, headY - h * 0.09],
      [ex + side * w * 0.004, headY - h * 0.19],
      [ex + w * 0.028, headY - h * 0.1],
    ], 2);
  }
  sphere(r, 'top', headX, headY + h * 0.07, w * 0.12, h * 0.08);
  for (const side of [-1, 1]) {
    const ex = headX + side * w * 0.085;
    sphere(r, 'white', ex, headY + h * 0.01, w * 0.06, h * 0.058);
    sphere(r, 'iris', ex, headY + h * 0.015, w * 0.042, h * 0.042);
    plate(r, 'ink', Math.round(ex) - 0.5, Math.round(headY - h * 0.01), 1, Math.max(3, Math.round(h * 0.06)), 2);
    put(r, Math.round(ex - w * 0.015), Math.round(headY - h * 0.012), 'white', 3);
  }
  put(r, Math.round(headX), Math.round(headY + h * 0.075), 'blush', 0);
  line(r, 'ink', headX, headY + h * 0.09, headX - w * 0.03, headY + h * 0.14, 1);
  line(r, 'ink', headX, headY + h * 0.09, headX + w * 0.03, headY + h * 0.14, 1);
  for (const side of [-1, 1]) {
    for (const dy of [0.01, 0.045]) {
      line(r, 'white', headX + side * w * 0.17, headY + h * (0.1 + dy), headX + side * w * 0.27, headY + h * (0.085 + dy * 2), 2);
    }
  }
  // tabby stripes on the crown and down the back
  for (const t of [-0.08, 0, 0.08]) {
    line(r, 'hair', headX + w * t, headY - h * 0.14, headX + w * t * 1.3, headY - h * 0.05, 1);
  }
  for (const t of [0.3, 0.42, 0.54]) {
    line(r, 'hair', w * t, bodyY - h * 0.14, w * (t + 0.03), bodyY - h * 0.02, 1);
  }
  return r;
}

function drawBird(spec, opts) {
  const [w, h] = spec.box;
  const r = raster(w, h);
  const bodyX = w * 0.4;
  const bodyY = h * 0.56;
  const headX = w * 0.62;
  const headY = h * 0.36;

  // tail feathers, then the body, then the wing
  polygon(r, 'hair', [
    [bodyX - w * 0.12, bodyY - h * 0.1],
    [w * 0.04, bodyY - h * 0.36],
    [w * 0.06, bodyY + h * 0.02],
  ], 1);
  sphere(r, 'hair', bodyX, bodyY, w * 0.24, h * 0.26);
  sphere(r, 'top', bodyX + w * 0.03, bodyY + h * 0.06, w * 0.15, h * 0.16);
  sphere(r, 'hair', headX, headY, w * 0.15, h * 0.18);
  sphere(r, 'top', headX + w * 0.02, headY + h * 0.05, w * 0.09, h * 0.09);

  // wing: the body colour, darker by tone, with two feather lines
  sphere(r, 'hair', bodyX - w * 0.03, bodyY - h * 0.02, w * 0.15, h * 0.16);
  line(r, 'hair', bodyX - w * 0.1, bodyY - h * 0.1, bodyX + w * 0.02, bodyY + h * 0.1, 1);
  line(r, 'hair', bodyX - w * 0.14, bodyY - h * 0.03, bodyX - w * 0.02, bodyY + h * 0.13, 0);
  // beak
  polygon(r, 'accent', [
    [headX + w * 0.1, headY - h * 0.02],
    [headX + w * 0.3, headY + h * 0.04],
    [headX + w * 0.1, headY + h * 0.09],
  ], 2);
  // eye
  sphere(r, 'white', headX + w * 0.04, headY - h * 0.02, w * 0.05, h * 0.06);
  sphere(r, 'iris', headX + w * 0.045, headY - h * 0.015, w * 0.034, h * 0.045);
  put(r, Math.round(headX + w * 0.03), Math.round(headY - h * 0.05), 'white', 3);
  // legs and feet
  for (const dx of [-0.02, 0.06]) {
    line(r, 'accent', bodyX + w * dx, bodyY + h * 0.22, bodyX + w * (dx + 0.02), h - 2, 1);
    line(r, 'accent', bodyX + w * (dx - 0.04), h - 2, bodyX + w * (dx + 0.06), h - 2, 1);
  }
  return r;
}

/* ---------- the cast ---------- */
//
// Colours are the ones the 12x12 maps and the painted room already use, so a
// figure is the same character seen closer up, not a redesign: mama's pink,
// papa's blue, the teacher's grey, the baby's aqua, the brown dog, the violet
// cat, the blue bird. `hairStyle`, `garment` and `extras` are what make one
// grown-up read differently from another.

export const FIGURE_SPECS = {
  mama: {
    build: 'person',
    kit: 'adult',
    box: [44, 64],
    skin: '#ecc39a',
    hair: '#5a3a28',
    top: '#f08fb4',
    bottom: '#6c5f88',
    shoe: '#5f3d27',
    accent: '#ffcf6b',
    iris: '#4a3326',
    hairStyle: 'bob',
    garment: 'dress',
    extras: ['lashes', 'blush', 'smile'],
  },
  papa: {
    build: 'person',
    kit: 'adult',
    box: [46, 64],
    skin: '#ecc39a',
    hair: '#2f2a24',
    top: '#6f92e0',
    bottom: '#3a4a86',
    shoe: '#3a2a26',
    accent: '#f7f3ff',
    iris: '#3f2c22',
    hairStyle: 'short',
    garment: 'shirt',
    extras: ['smile'],
  },
  teacher: {
    build: 'person',
    kit: 'adult',
    box: [44, 64],
    skin: '#ecc39a',
    hair: '#3a2a20',
    top: '#b9aed6',
    bottom: '#55496f',
    shoe: '#3a2a26',
    accent: '#9a68c8',
    iris: '#4a3326',
    hairStyle: 'bun',
    garment: 'dress',
    extras: ['glasses', 'smile', 'badge'],
  },
  friend: {
    build: 'person',
    kit: 'child',
    box: [40, 58],
    skin: '#ecc39a',
    hair: '#4a3326',
    top: '#f7f3ff',
    bottom: '#3a4a86',
    shoe: '#f7f3ff',
    accent: '#6f92e0',
    iris: '#4a3326',
    hairStyle: 'messy',
    garment: 'overalls',
    extras: ['smile', 'blush'],
  },
  baby: {
    build: 'person',
    kit: 'baby',
    box: [34, 42],
    skin: '#ecc39a',
    hair: '#4a3326',
    top: '#7ee0c8',
    bottom: '#7ee0c8',
    shoe: '#f6cfa8',
    accent: '#f7f3ff',
    iris: '#4a3326',
    hairStyle: 'curls',
    garment: 'tee',
    extras: ['smile', 'blush', 'bib'],
  },
  dog: {
    build: 'dog',
    box: [52, 36],
    hair: '#9b6a44',
    top: '#d9a05b',
    accent: '#e5533d',
    iris: '#3a2a26',
  },
  cat: {
    build: 'cat',
    box: [36, 32],
    hair: '#9a68c8',
    top: '#d9a05b',
    accent: '#f7f3ff',
    iris: '#3f7f55',
  },
  bird: {
    build: 'bird',
    box: [30, 24],
    hair: '#6f92e0',
    top: '#cfd8f7',
    accent: '#f0913c',
    iris: '#17111f',
  },
};

export function hasFigure(name) {
  return Object.prototype.hasOwnProperty.call(FIGURE_SPECS, name);
}

export function figureNames() {
  return Object.keys(FIGURE_SPECS);
}

/** Cell box of a figure, so a caller can size a canvas or a test can check it. */
export function figureBox(name) {
  const spec = FIGURE_SPECS[name];
  if (!spec) return null;
  return spec.box.slice();
}

function paletteFor(spec) {
  const base = spec.top || spec.hair;
  return {
    ink: ramp(INK),
    skin: ramp(spec.skin || '#f6cfa8'),
    hair: ramp(spec.hair || '#4a3326'), // fur, on the animals
    top: ramp(base),
    bottom: ramp(spec.bottom || base),
    shoe: ramp(spec.shoe || spec.bottom || base),
    accent: ramp(spec.accent || '#ffcf6b'),
    white: ramp('#f7f3ff'),
    iris: ramp(spec.iris || '#3a2a26'),
    mouth: ramp('#8c3a48'),
    blush: ramp('#f0a0a8'),
    glass: ramp('#cfd6e8'),
  };
}

/* ---------- finishing passes ---------- */

/** Contact shade: a solid cell with air under it darkens by one tone. */
function groundShade(r) {
  const solid = r.mat.map((mat) => Boolean(mat));
  for (let y = r.h - 2; y >= 0; y -= 1) {
    for (let x = 0; x < r.w; x += 1) {
      const i = y * r.w + x;
      if (!solid[i] || solid[i + r.w]) continue;
      if (r.tone[i] > 1) r.tone[i] = 1;
    }
  }
}

/** The ink silhouette: one cell of ink wherever the body meets the air. */
function outlineFigure(r) {
  const solid = r.mat.map((mat) => Boolean(mat));
  const ink = [];
  for (let y = 0; y < r.h; y += 1) {
    for (let x = 0; x < r.w; x += 1) {
      const i = y * r.w + x;
      if (solid[i]) continue;
      const touching =
        (x > 0 && solid[i - 1]) ||
        (x < r.w - 1 && solid[i + 1]) ||
        (y > 0 && solid[i - r.w]) ||
        (y < r.h - 1 && solid[i + r.w]);
      if (touching) ink.push(i);
    }
  }
  for (const i of ink) {
    r.mat[i] = 'ink';
    r.tone[i] = 2;
  }
}

/** Grid -> RGBA, the only place a colour is resolved. */

/* ---------- the API ---------- */

const cache = new Map();

/** One rasterized figure, before cropping. Cached per name/view/pose/frame. */
function drawRaster(name, spec, opts) {
  const step = Math.abs(Math.round(opts.frame || 0)) % 4;
  const view = opts.view || 'front';
  const pose = opts.pose || 'idle';
  const key = `${name}|${view}|${pose}|${step}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const local = { view, pose, frame: step };
  let r;
  if (spec.build === 'dog') r = drawDog(spec, local);
  else if (spec.build === 'cat') r = drawCat(spec, local);
  else if (spec.build === 'bird') r = drawBird(spec, local);
  else r = drawPerson(spec, local);

  groundShade(r);
  outlineFigure(r);
  cache.set(key, r);
  return r;
}

const cropCache = new Map();

/**
 * The columns a figure actually occupies, over every pose it is ever drawn in.
 *
 * A box is authored with air around it (a raised arm needs room), but a billboard
 * is sized from the canvas, so the margins would become world-space gaps between
 * the people in a room. The crop is measured once per figure and then shared by
 * every frame, so an arm swinging out never changes the width under the camera.
 */
function cropFor(name, spec) {
  if (cropCache.has(name)) return cropCache.get(name);
  const box = spec.box;
  let minX = box[0];
  let maxX = -1;
  const poses = [['idle', 0], ['walk', 0], ['walk', 1], ['walk', 2], ['walk', 3], ['lean', 0]];
  for (const view of ['front', 'side', 'back']) {
    for (const [pose, frame] of poses) {
      const r = drawRaster(name, spec, { view, pose, frame });
      for (let y = 0; y < r.h; y += 1) {
        for (let x = 0; x < r.w; x += 1) {
          if (!r.mat[y * r.w + x]) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
  }
  const crop = maxX < 0 ? { x: 0, w: box[0] } : { x: minX, w: maxX - minX + 1 };
  cropCache.set(name, crop);
  return crop;
}

/** Cut the air off the sides: `{ width, height, mat, tone }` in canvas columns. */
function cropRaster(r, crop) {
  const w = crop.w;
  const mat = new Array(w * r.h).fill('');
  const tone = new Uint8Array(w * r.h);
  for (let y = 0; y < r.h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const from = y * r.w + x + crop.x;
      const mat0 = r.mat[from];
      if (!mat0) continue;
      const to = y * w + x;
      mat[to] = mat0;
      tone[to] = r.tone[from];
    }
  }
  return { width: w, height: r.h, mat, tone };
}

/** Colours for a cropped raster: `{ width, height, data }` with RGBA bytes. */
function gridOf(name, spec, opts) {
  const r = drawRaster(name, spec, opts);
  const cut = cropRaster(r, cropFor(name, spec));
  const palette = paletteFor(spec);
  const data = new Uint8ClampedArray(cut.width * cut.height * 4);
  for (let i = 0; i < cut.mat.length; i += 1) {
    const mat = cut.mat[i];
    if (!mat) continue;
    const list = palette[mat] || palette.ink;
    const rgb = list[cut.tone[i]] || list[2];
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { name, width: cut.width, height: cut.height, data, layers: cut };
}

/** One built grid per name/view/pose/frame; both public readers share it. */
const gridCache = new Map();

function entryFor(name, opts = {}) {
  const spec = FIGURE_SPECS[name];
  if (!spec) return null;
  const step = Math.abs(Math.round(opts.frame || 0)) % 4;
  const view = opts.view || 'front';
  const pose = opts.pose || 'idle';
  const key = `${name}|${view}|${pose}|${step}`;
  const hit = gridCache.get(key);
  if (hit) return hit;
  const entry = gridOf(name, spec, { view, pose, frame: step });
  gridCache.set(key, entry);
  return entry;
}

/**
 * A figure as pixels: `{ name, width, height, data }` with RGBA bytes, cropped to
 * the body. Pure and deterministic — the same name, view, pose and frame always
 * give the same bytes, which is what the tests compare.
 */
export function figureGrid(name, opts) {
  const entry = entryFor(name, opts);
  return entry ? { name: entry.name, width: entry.width, height: entry.height, data: entry.data } : null;
}

/**
 * The same figure as materials and tones, one entry per cell: what the art is
 * made of rather than what colour it is. The tests read this to ask whether a
 * figure has a face, a silhouette, shading and moving limbs.
 */
export function figureLayers(name, opts) {
  const entry = entryFor(name, opts);
  if (!entry) return null;
  const cut = entry.layers;
  return { name: entry.name, width: cut.width, height: cut.height, mat: cut.mat.slice(), tone: cut.tone.slice() };
}


/**
 * A canvas holding one figure, scaled up by whole cells so nothing is ever
 * resampled: the same rule the painted sprites and the atlas follow.
 */
export function figureCanvas(name, { unit = 4, className = '', ...opts } = {}) {
  if (typeof document === 'undefined') return null;
  const grid = figureGrid(name, opts);
  if (!grid) return null;

  const step = Math.max(1, Math.round(unit));
  const canvas = document.createElement('canvas');
  canvas.width = grid.width * step;
  canvas.height = grid.height * step;
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return null;

  if (typeof ImageData === 'function') {
    // one ImageData at cell resolution, blown up nearest: no resampling anywhere
    const base = document.createElement('canvas');
    base.width = grid.width;
    base.height = grid.height;
    const baseCtx = base.getContext && base.getContext('2d');
    if (baseCtx && typeof baseCtx.putImageData === 'function') {
      baseCtx.putImageData(new ImageData(grid.data, grid.width, grid.height), 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
    }
  }

  canvas.className = className ? `${className} pix` : 'pix';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.figure = name;
  return canvas;
}

/** The four walk frames of a figure, in order. */
export function figureFrames(name, { unit = 4, view = 'front', pose = 'walk' } = {}) {
  return [0, 1, 2, 3].map((frame) => figureCanvas(name, { unit, view, pose, frame }));
}
