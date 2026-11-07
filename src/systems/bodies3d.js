// The cast, in three dimensions.
//
// figures.js paints a character onto a card: it is the right drawing, but a card
// has no thickness, no silhouette from the side and no shadow of its own. This
// module is the same character built out of volumes — a head, a neck, a chest, a
// pelvis, two arms, two legs, ears, a tail — so that the room can light it, cast
// it onto the floor and let the player walk around it.
//
// Nothing here touches a canvas or a GPU: a body is a list of parts, each one a
// primitive with a position, a rotation, a scale and a material. scene3d.js turns
// that list into draw calls, and tools/bodies-check.mjs asserts the proportions
// and the poses from Node. The palette is FIGURE_SPECS, verbatim, so the 3D mama
// is the pink mama the beats are about and not a new character.

import { FIGURE_SPECS } from './figures.js';
import { hexToLinear } from './world3d.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const linear = (hex, fallback) => {
  const rgb = hexToLinear(hex || fallback || '#808080');
  return rgb.length === 3 && rgb.some((c) => c > 0) ? rgb : hexToLinear(fallback || '#808080');
};
const shade = (rgb, k) => rgb.map((v) => clamp(v * k, 0, 1));
const mist = (a, b, k) => a.map((v, i) => clamp(v + (b[i] - v) * k, 0, 1));

/* ---------- proportions ---------- */

// Every number is a fraction of the character's height, taken at the joints, so
// one set of ratios builds a 1.7 m papa and a 0.78 m baby without a single
// hand-written measurement. The head ratio is what makes a child read as a
// child: an adult is one head in seven, a baby closer to one in four.
const KITS = {
  adult: {
    headR: 0.072,
    hip: 0.545,
    shoulderDrop: 0.03, // how far the neck sits under the top of the head
    halfShoulder: 0.112,
    halfHip: 0.07,
    torsoR: 0.083,
    armUpper: 0.152,
    armLower: 0.142,
    thigh: 0.262,
    shin: 0.248,
    ankle: 0.042,
    foot: 0.115,
    hand: 0.035,
  },
  child: {
    headR: 0.084,
    hip: 0.512,
    shoulderDrop: 0.028,
    halfShoulder: 0.108,
    halfHip: 0.068,
    torsoR: 0.088,
    armUpper: 0.146,
    armLower: 0.136,
    thigh: 0.252,
    shin: 0.238,
    ankle: 0.036,
    foot: 0.108,
    hand: 0.034,
  },
  baby: {
    headR: 0.112,
    hip: 0.352,
    shoulderDrop: 0.022,
    halfShoulder: 0.104,
    halfHip: 0.07,
    torsoR: 0.1,
    armUpper: 0.108,
    armLower: 0.1,
    thigh: 0.172,
    shin: 0.16,
    ankle: 0.026,
    foot: 0.088,
    hand: 0.03,
  },
};

const KIT_FOR = { adult: 'adult', child: 'child', baby: 'baby' };

/* ---------- small maths ---------- */

/** A point above the hip, rotated about it, so the whole spine can lean. */
function leanPoint(point, pivot, angle) {
  if (!angle) return point;
  const y = point[1] - pivot[1];
  const z = point[2] - pivot[2];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [point[0], pivot[1] + y * cos - z * sin, pivot[2] + y * sin + z * cos];
}

/** The rotation that aims a +y shape along `dir`, in scene3d's [rx, ry, rz] form. */
function aimY(dir) {
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const dy = clamp(dir[1] / len, -1, 1);
  return [Math.acos(dy), Math.atan2(dir[0] / len, dir[2] / len), 0];
}

/* ---------- parts ---------- */

function part(mesh, at, scale, rot, color, rough = 0.8, extra = {}) {
  return { mesh, at, scale, rot, color, rough, ...extra };
}

/** A limb segment: a capsule between two joints, whatever their positions are. */
function bone(from, to, radius, color, rough = 0.8) {
  const dir = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const length = Math.hypot(dir[0], dir[1], dir[2]);
  // the unit capsule is six units tall (see meshes.capsuleGeometry), so a y scale
  // of length / 6 spans joint to joint
  const half = Math.max(0.0002, length / 6);
  const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  return part('capsule', mid, [radius, half, radius], aimY(dir), color, rough);
}

/** A ball, optionally squashed: heads, eyes, noses, hands, hair tufts. */
function ball(at, scale, color, rough = 0.8, rot = [0, 0, 0]) {
  return part('sphere', at, scale, rot, color, rough);
}

/** A box, sized in metres (not half-extents): shoes, mouths, glass frames. */
function slab(at, size, color, rough = 0.8, rot = [0, 0, 0]) {
  return part('box', at, size, rot, color, rough);
}

const WHITE = () => [0.86, 0.85, 0.84];
const INK = () => [0.05, 0.04, 0.06];

/* ---------- people ---------- */

function personParts(spec, kit, height, pose) {
  const K = KITS[kit] || KITS.adult;
  const H = height;
  const skin = linear(spec.skin, '#ecc39a');
  const hair = linear(spec.hair, '#4a3326');
  const top = linear(spec.top, '#b9aed6');
  const bottom = linear(spec.bottom, '#55496f');
  const shoe = linear(spec.shoe, '#3a2a26');
  const accent = linear(spec.accent, '#f7f3ff');
  const iris = linear(spec.iris, '#3f2c22');
  const garment = spec.garment || 'shirt';
  const bare = garment === 'dress'; // a dress leaves the legs skin-coloured
  const legColor = bare ? mist(skin, bottom, 0.12) : bottom;

  const headR = K.headR * H;
  const headY = 0.995 * H - headR;
  const neckY = headY - headR * 0.95;
  const shoulderY = neckY - K.shoulderDrop * H;
  const hipY = K.hip * H;
  const pivot = [0, hipY, 0];

  const swing = pose.phase ? Math.sin(pose.phase * TAU) : 0;
  const amp = pose.walking ? 1 : 0;
  const spine = pose.lean || 0;
  // where the ankle joint sits when the leg is straight: the shoe is built around it
  const restAnkle = hipY - (K.thigh + K.shin) * H;

  const up = (point) => leanPoint(point, pivot, spine);
  const parts = [];
  const ankleYs = [];

  /* legs: hip -> knee -> ankle -> shoe */
  for (const side of [-1, 1]) {
    const phase = side < 0 ? swing : -swing;
    const legSwing = phase * 0.44 * amp;
    const bend = Math.max(0, -phase) * 0.9 * amp;
    const hip = [side * K.halfHip * H, hipY, 0];
    const knee = [hip[0], hip[1] - Math.cos(legSwing) * K.thigh * H, hip[2] + Math.sin(legSwing) * K.thigh * H];
    const shinAngle = legSwing - bend;
    const ankle = [
      knee[0],
      knee[1] - Math.cos(shinAngle) * K.shin * H,
      knee[2] + Math.sin(shinAngle) * K.shin * H,
    ];
    ankleYs.push(ankle[1]);
    parts.push(bone(hip, knee, 0.075 * H, legColor, 0.9));
    parts.push(bone(knee, ankle, 0.062 * H, legColor, 0.9));
    // The shoe rides with the ankle rather than with the floor, so a swinging
    // foot lifts off. `restAnkle` is what keeps a planted one on y = 0.
    const shoeHalf = K.ankle * H * 0.7;
    const shoeY = ankle[1] - restAnkle + shoeHalf;
    parts.push(slab([ankle[0], shoeY, ankle[2] + K.foot * H * 0.16], [0.062 * H, shoeHalf * 2, K.foot * H], shoe, 0.7));
  }


  /* the torso: one capsule for the spine, a flatter one for the chest */
  const chest = up([0, shoulderY, 0]);
  const waist = up([0, hipY + 0.02 * H, 0]);
  parts.push(bone(waist, chest, K.torsoR * H, top, 0.9));
  parts.push(
    part(
      'capsule',
      [0, (chest[1] + waist[1]) / 2 + 0.02 * H, 0],
      [K.torsoR * 1.02 * H, Math.max(0.0002, (chest[1] - waist[1]) / 6), K.torsoR * 0.7 * H],
      [spine, 0, 0],
      top,
      0.9,
    ),
  );
  if (garment === 'overalls') {
    parts.push(part('capsule', [0, hipY + 0.04 * H, 0], [K.torsoR * 1.06 * H, 0.06 * H, K.torsoR * 0.78 * H], [0, 0, 0], bottom, 0.9));
  }
  if (garment === 'dress') {
    parts.push(
      part('cone', up([0, hipY - 0.05 * H, 0]), [0.17 * H, 0.34 * H, 0.14 * H], [spine, 0, 0], mist(top, bottom, 0.25), 0.92),
    );
  }
  if (garment === 'shirt' || garment === 'overalls') {
    parts.push(
      part(
        'capsule',
        [chest[0], chest[1] - 0.01 * H, chest[2]],
        [K.torsoR * 0.92 * H, 0.014 * H, K.torsoR * 0.68 * H],
        [spine, 0, 0],
        accent,
        0.85,
      ),
    );
  }

  /* arms: shoulder -> elbow -> wrist -> hand */
  for (const side of [-1, 1]) {
    const phase = side < 0 ? -swing : swing;
    const armSwing = phase * 0.34 * amp;
    const bend = 0.18 + Math.max(0, phase) * 0.3 * amp;
    const shoulder = up([side * K.halfShoulder * H, shoulderY, 0]);
    const elbow = [
      shoulder[0] + side * 0.02 * H,
      shoulder[1] - Math.cos(armSwing) * K.armUpper * H,
      shoulder[2] + Math.sin(armSwing) * K.armUpper * H,
    ];
    const wristAngle = armSwing + bend;
    const wrist = [
      elbow[0] + side * 0.012 * H,
      elbow[1] - Math.cos(wristAngle) * K.armLower * H,
      elbow[2] + Math.sin(wristAngle) * K.armLower * H,
    ];
    parts.push(bone(shoulder, elbow, 0.055 * H, top, 0.9));
    parts.push(bone(elbow, wrist, 0.046 * H, garment === 'tee' ? skin : top, 0.85));
    parts.push(ball([wrist[0], wrist[1] - K.hand * H * 0.7, wrist[2]], [K.hand * H, K.hand * H * 0.9, K.hand * H * 1.1], skin, 0.6));
  }


  /* neck and head */
  const neck = up([0, neckY, 0]);
  parts.push(bone([neck[0], neck[1] - headR * 0.55, neck[2]], [neck[0], neck[1] + headR * 0.3, neck[2]], 0.042 * H, skin, 0.62));
  const head = up([0, headY, 0]);
  const headRot = [spine + (pose.headPitch || 0), 0, 0];
  parts.push(part('sphere', head, [headR * 0.94, headR, headR * 0.9], headRot, skin, 0.55));

  /* the face, all on the +z side, which is the way a body faces at yaw 0 */
  const faceZ = (k) => head[2] + headR * k;
  const eyeY = head[1] + headR * 0.1;
  for (const side of [-1, 1]) {
    parts.push(ball([head[0] + side * headR * 0.36, eyeY, faceZ(0.7)], [headR * 0.2, headR * 0.17, headR * 0.12], WHITE(), 0.25));
    parts.push(ball([head[0] + side * headR * 0.36, eyeY, faceZ(0.82)], [headR * 0.1, headR * 0.1, headR * 0.06], iris, 0.2));
  }
  parts.push(ball([head[0], head[1] - headR * 0.08, faceZ(0.86)], [headR * 0.1, headR * 0.11, headR * 0.12], shade(skin, 0.9), 0.6));
  parts.push(slab([head[0], head[1] - headR * 0.46, faceZ(0.74)], [headR * 0.34, headR * 0.05, headR * 0.06], shade(skin, 0.5), 0.7, headRot));
  if ((spec.extras || []).includes('glasses')) {
    for (const side of [-1, 1]) {
      parts.push(slab([head[0] + side * headR * 0.36, eyeY, faceZ(0.84)], [headR * 0.42, headR * 0.32, headR * 0.03], INK(), 0.35));
    }
    parts.push(slab([head[0], eyeY, faceZ(0.86)], [headR * 0.28, headR * 0.05, headR * 0.03], INK(), 0.35));
  }
  if ((spec.extras || []).includes('bib')) {
    parts.push(slab([chest[0], chest[1] - 0.075 * H, chest[2] + K.torsoR * 0.6 * H], [0.1 * H, 0.09 * H, 0.012 * H], accent, 0.9));
  }

  parts.push(...hairParts(spec.hairStyle, head, headR, hair, headRot));

  // Spreading the legs shortens them: at full stride both feet would hang above
  // the floor. Drop the whole body until the lower foot is planted again — the
  // planted foot then reads as carrying the weight and the other one swings free,
  // and the hips sink and rise once per step exactly as they should.
  const drop = pose.walking ? Math.max(0, Math.min(ankleYs[0], ankleYs[1]) - restAnkle) : 0;
  if (drop) for (const part of parts) part.at[1] -= drop;

  return { parts, height: H, lift: 0, radius: K.halfShoulder * H * 1.12 };
}

function hairParts(style, head, headR, hair, headRot) {
  const parts = [];
  parts.push(part('dome', [head[0], head[1] + headR * 0.02, head[2] - headR * 0.04], [headR * 1.04, headR * 1.03, headR * 1.04], headRot, hair, 0.72));
  if (style === 'bob') {
    for (const side of [-1, 1]) {
      parts.push(
        bone(
          [head[0] + side * headR * 0.88, head[1] + headR * 0.3, head[2] - headR * 0.1],
          [head[0] + side * headR * 0.84, head[1] - headR * 0.62, head[2] - headR * 0.26],
          headR * 0.26,
          hair,
          0.75,
        ),
      );
    }
  } else if (style === 'bun') {
    parts.push(ball([head[0], head[1] + headR * 0.72, head[2] - headR * 0.72], [headR * 0.42, headR * 0.4, headR * 0.4], hair, 0.72));
  } else if (style === 'messy') {
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * TAU + 0.4;
      parts.push(
        ball(
          [head[0] + Math.cos(angle) * headR * 0.6, head[1] + headR * 0.8, head[2] + Math.sin(angle) * headR * 0.48 - headR * 0.1],
          [headR * 0.26, headR * 0.2, headR * 0.26],
          hair,
          0.72,
        ),
      );
    }
  } else if (style === 'curls') {
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * TAU;
      const ring = i % 2 === 0 ? 0.8 : 0.54;
      parts.push(
        ball(
          [
            head[0] + Math.cos(angle) * headR * ring,
            head[1] + headR * (0.46 + (i % 2) * 0.24),
            head[2] + Math.sin(angle) * headR * ring * 0.78 - headR * 0.05,
          ],
          [headR * 0.21, headR * 0.18, headR * 0.21],
          hair,
          0.72,
        ),
      );
    }
  }
  return parts;
}


/* ---------- animals ---------- */

// A dog and a cat are the same animal with different dials: a barrel body on
// four legs, a neck that lifts the head off the shoulders, and a tail that
// answers to the mood. The dials are what tell them apart — the dog is heavy and
// blunt-snouted, the cat is slim, pointed and wears its tail up.
const QUADRUPEDS = {
  dog: { bodyR: 0.2, body: 0.74, headR: 0.17, snout: 0.95, earH: 0.13, earSplay: 0.25, tail: 0.55, tailUp: 0.35, legW: 0.055, neck: 0.13 },
  cat: { bodyR: 0.155, body: 0.68, headR: 0.155, snout: 0.42, earH: 0.16, earSplay: 0.45, tail: 0.72, tailUp: 0.95, legW: 0.042, neck: 0.1 },
};

function quadrupedParts(spec, kit, height, pose) {
  const H = height;
  const Q = QUADRUPEDS[spec.build] || QUADRUPEDS.dog;
  const fur = linear(spec.hair, '#9b6a44');
  const belly = linear(spec.top, '#d9a05b');
  const accent = linear(spec.accent, '#e5533d');
  const iris = linear(spec.iris, '#3a2a26');
  const swing = pose.phase ? Math.sin(pose.phase * TAU) : 0;
  const amp = pose.walking ? 1 : 0;
  const parts = [];

  const bodyY = 0.56 * H;
  const bodyR = Q.bodyR * H;
  const front = 0.3 * H;
  const back = -0.34 * H;
  parts.push(bone([0, bodyY, back], [0, bodyY + 0.01 * H, front], bodyR, fur, 0.85));
  parts.push(ball([0, bodyY - bodyR * 0.45, 0.02 * H], [bodyR * 0.92, bodyR * 0.7, Q.body * H * 0.55], belly, 0.85));

  /* four legs, each pair swinging against the other */
  const pairs = [
    { z: front - 0.06 * H, phase: 0 },
    { z: back + 0.05 * H, phase: Math.PI },
  ];
  for (const pair of pairs) {
    for (const side of [-1, 1]) {
      const swingAngle = Math.sin(pose.phase * TAU + pair.phase + (side < 0 ? 0.35 : 0)) * 0.5 * amp;
      const top = [side * 0.13 * H, bodyY - bodyR * 0.5, pair.z];
      const knee = [top[0], top[1] - 0.22 * H, top[2] + Math.sin(swingAngle) * 0.12 * H];
      const paw = [knee[0], 0.035 * H, knee[2] + Math.sin(swingAngle) * 0.1 * H];
      parts.push(bone(top, knee, Q.legW * H, fur, 0.88));
      parts.push(bone(knee, [paw[0], paw[1] + 0.02 * H, paw[2]], Q.legW * 0.85 * H, fur, 0.88));
      parts.push(slab([paw[0], paw[1], paw[2] + 0.01 * H], [Q.legW * 2.6 * H, paw[1] * 2, Q.legW * 3.4 * H], belly, 0.85));
    }
  }

  /* neck, head, snout, ears, eyes */
  const neckTop = [0, 0.82 * H, front + 0.1 * H];
  parts.push(bone([0, bodyY + 0.02 * H, front - 0.04 * H], neckTop, Q.neck * H, fur, 0.85));
  parts.push(
    part('capsule', [0, bodyY + 0.02 * H, front - 0.02 * H], [Q.neck * 1.2 * H, 0.022 * H, Q.neck * 1.2 * H], [1.2, 0, 0], accent, 0.8),
  );
  const headR = Q.headR * H;
  const head = [0, 0.88 * H, front + 0.16 * H];
  parts.push(ball(head, [headR, headR * 0.95, headR * 1.02], fur, 0.8));
  const snoutLen = Q.snout * headR * 1.5;
  parts.push(bone([head[0], head[1] - headR * 0.2, head[2] + headR * 0.7], [0, head[1] - headR * 0.3, head[2] + headR * 0.7 + snoutLen], headR * 0.42, belly, 0.82));
  parts.push(ball([0, head[1] - headR * 0.26, head[2] + headR * 0.78 + snoutLen], [headR * 0.28, headR * 0.24, headR * 0.26], shade(iris, 0.9), 0.45));
  for (const side of [-1, 1]) {
    parts.push(ball([side * headR * 0.42, head[1] + headR * 0.22, head[2] + headR * 0.68], [headR * 0.16, headR * 0.17, headR * 0.14], iris, 0.3));
    parts.push(
      part(
        'cone',
        [side * headR * 0.55, head[1] + headR * 1.05, head[2] + headR * 0.05],
        [headR * 0.34, Q.earH * H, headR * 0.22],
        [0, 0, side * -Q.earSplay],
        fur,
        0.8,
      ),
    );
  }

  /* the tail: the one part of an animal that is pure body language */
  const tailAngle = 0.5 + Q.tailUp * 0.55 + Math.sin((pose.phase || 0) * TAU) * 0.12;
  const tailRoot = [0, bodyY + bodyR * 0.3, back + 0.02 * H];
  const tailMid = [0, tailRoot[1] + Math.sin(tailAngle) * Q.tail * H * 0.55, tailRoot[2] - Math.cos(tailAngle) * Q.tail * H * 0.55];
  const tailTip = [0, tailMid[1] + Math.sin(tailAngle * 0.7) * Q.tail * H * 0.45, tailMid[2] - Math.cos(tailAngle * 0.7) * Q.tail * H * 0.45];
  parts.push(bone(tailRoot, tailMid, 0.05 * H, fur, 0.85));
  parts.push(bone(tailMid, tailTip, 0.038 * H, belly, 0.85));

  return { parts, height: H, lift: 0, radius: 0.3 * H };
}

function birdParts(spec, kit, height, pose) {
  const H = height;
  const body = linear(spec.hair, '#6f92e0');
  const belly = linear(spec.top, '#cfd8f7');
  const beak = linear(spec.accent, '#f0913c');
  const iris = linear(spec.iris, '#17111f');
  const parts = [];
  const hop = pose.walking ? Math.abs(Math.sin(pose.phase * TAU)) * 0.06 * H : 0;
  // a bird does not march: it waddles, rocking from one foot to the other
  const waddle = pose.walking ? Math.sin(pose.phase * TAU) * 0.03 * H : 0;

  parts.push(ball([0, 0.5 * H + hop, 0], [0.3 * H, 0.32 * H, 0.34 * H], body, 0.8));
  parts.push(ball([0, 0.44 * H + hop, 0.06 * H], [0.24 * H, 0.24 * H, 0.28 * H], belly, 0.85));
  const head = [0, 0.78 * H + hop, 0.16 * H];
  parts.push(ball(head, [0.19 * H, 0.19 * H, 0.19 * H], body, 0.8));
  parts.push(part('cone', [0, head[1] - 0.01 * H, head[2] + 0.22 * H], [0.07 * H, 0.16 * H, 0.06 * H], [Math.PI / 2, 0, 0], beak, 0.6));
  for (const side of [-1, 1]) {
    parts.push(ball([side * 0.1 * H, head[1] + 0.03 * H, head[2] + 0.13 * H], [0.045 * H, 0.045 * H, 0.04 * H], iris, 0.3));
    parts.push(
      part('sphere', [side * 0.26 * H, 0.52 * H + hop, -0.02 * H], [0.05 * H, 0.2 * H, 0.26 * H], [0, side * 0.2, side * -0.2], belly, 0.85),
    );
    parts.push(bone([side * 0.08 * H, 0.24 * H, 0], [side * 0.09 * H, 0.02 * H, 0.01 * H], 0.016 * H, beak, 0.7));
  }
  parts.push(part('box', [0, 0.5 * H + hop, -0.36 * H], [0.1 * H, 0.06 * H, 0.26 * H], [0.35, 0, 0], belly, 0.85));
  // the waddle rocks the whole bird about its feet, so it is applied last
  if (waddle) for (const part of parts) part.at[0] += waddle;
  return { parts, height: H, lift: hop, radius: 0.34 * H };
}


/* ---------- the public shape of a body ---------- */

const BUILDERS = {
  person: personParts,
  dog: quadrupedParts,
  cat: quadrupedParts,
  bird: birdParts,
};

/** The shapes scene3d.js knows how to build a buffer for. */
export const MESHES = ['sphere', 'dome', 'capsule', 'box', 'cone'];

/** Does this sprite have a body, or is it still a card? */
export function hasBody(name) {
  const spec = FIGURE_SPECS[name];
  return Boolean(spec && BUILDERS[spec.build]);
}

export function bodyNames() {
  return Object.keys(FIGURE_SPECS).filter((name) => hasBody(name));
}

/** Nobody stands up straighter than their own kit allows. */
export function bodyKit(name) {
  const spec = FIGURE_SPECS[name];
  return spec ? KIT_FOR[spec.kit] || 'adult' : null;
}

/**
 * A body, as metres in its own space: y up from the soles, +z the way it faces,
 * feet on y = 0. `opts.height` is the height the renderer wants, in metres;
 * `opts.pose` is 'idle' or 'walk'; `opts.phase` is where in the stride (0..1);
 * `opts.lean` bends the spine forward, which is how mama leans over the crib.
 */
export function bodyPlan(name, opts = {}) {
  const spec = FIGURE_SPECS[name];
  if (!spec || !BUILDERS[spec.build]) return null;
  const height = Number.isFinite(opts.height) && opts.height > 0.02 ? opts.height : 1;
  const phase = Number.isFinite(opts.phase) ? ((opts.phase % 1) + 1) % 1 : 0;
  const pose = {
    phase,
    walking: opts.pose === 'walk',
    lean: clamp(Number.isFinite(opts.lean) ? opts.lean : 0, -0.5, 0.9),
    headPitch: clamp(Number.isFinite(opts.headPitch) ? opts.headPitch : 0, -0.6, 0.6),
  };
  const built = BUILDERS[spec.build](spec, KIT_FOR[spec.kit] || 'adult', height, pose);
  return {
    name,
    build: spec.build,
    kit: KIT_FOR[spec.kit] || 'adult',
    height,
    pose,
    parts: built.parts,
    lift: built.lift,
    radius: built.radius,
  };
}

