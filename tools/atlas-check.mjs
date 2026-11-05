// Atlas check — proves the loader and the frame drawing work without a browser.
// The painted sprites are the fallback, so a broken atlas must never throw; this
// runs the happy path and the failure path against a stub canvas.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

import { loadAtlas, upgradeArt, drawArtFrame, frameOf, clipOf, artName, hasArt, atlasStatus, ART_MAP, ATLAS_META } from '../src/systems/atlas.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const meta = JSON.parse(readFileSync(join(ROOT, ATLAS_META), 'utf8'));
const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
};

/* ---------- stubs: just enough browser to run the real code ---------- */

globalThis.fetch = async (url) => {
  if (!String(url).endsWith('murmur_atlas.json')) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => meta };
};

globalThis.Image = class {
  set src(value) {
    this._src = value;
    setTimeout(() => this.onload && this.onload(), 0);
  }
  get src() {
    return this._src;
  }
};

globalThis.document = { createElement: () => ({ style: {}, dataset: {} }) };

function stubCanvas() {
  const calls = [];
  const ctx = {
    imageSmoothingEnabled: true,
    save() {},
    restore() {},
    translate() {},
    scale() {},
    drawImage(...args) {
      calls.push({ args, smoothing: this.imageSmoothingEnabled });
    },
  };
  return { calls, canvas: { width: 0, height: 0, dataset: {}, getContext: () => ctx } };
}

/* ---------- the mapping table itself ---------- */

for (const [painted, frame] of Object.entries(ART_MAP)) {
  check(hasArt(painted), `ART_MAP has no entry for "${painted}"`);
  check(artName(painted) === frame, `artName("${painted}") returned ${artName(painted)}`);
  check(Boolean(meta.frames[frame]), `ART_MAP "${painted}" -> "${frame}", which is not in the atlas`);
}

check(!hasArt('mama'), 'painted sprites without new art must report hasArt() false');

/* ---------- before the atlas lands: nothing throws, nothing paints ---------- */

const early = stubCanvas();
check(upgradeArt(early.canvas, 'friend') === false, 'upgradeArt() should report false before the atlas is ready');
check(early.canvas.width === 0 && early.calls.length === 0, 'upgradeArt() must not resize a canvas before the atlas is ready');

/* ---------- load ---------- */

const loaded = await loadAtlas();
check(Boolean(loaded), 'loadAtlas() returned nothing');
check(atlasStatus().state === 'ready', `atlas state is "${atlasStatus().state}", expected "ready"`);
check(atlasStatus().frames === Object.keys(meta.frames).length, 'frame count does not match the metadata');

/* ---------- drawing a frame ---------- */

const target = stubCanvas();
check(upgradeArt(target.canvas, 'friend') === true, 'upgradeArt() should paint once the atlas is ready');
const boy = frameOf(ART_MAP.friend);
check(target.canvas.width === boy.w && target.canvas.height === boy.h, `canvas is ${target.canvas.width}x${target.canvas.height}, expected ${boy.w}x${boy.h}`);
check(target.canvas.dataset.frame === ART_MAP.friend, 'canvas is not tagged with the frame it shows');

const call = target.calls[0];
check(Boolean(call), 'drawImage() was never called');
if (call) {
  check(call.smoothing === false, 'imageSmoothingEnabled must be false while drawing');
  const [, sx, sy, sw, sh, dx, dy, dw, dh] = call.args;
  check(sx === boy.x && sy === boy.y && sw === boy.w && sh === boy.h, 'drawn source rectangle does not match the metadata');
  check(dx === 0 && dy === 0 && dw === boy.w && dh === boy.h, 'frame is not drawn 1:1 at the origin');
}

/* ---------- integer upscaling and flips stay nearest ---------- */

const scaled = stubCanvas();
const apple = frameOf('apple');
check(drawArtFrame(scaled.canvas.getContext('2d'), 'apple', { scale: 2, flip: true }) === true, 'drawArtFrame() refused a valid frame');
const scaledCall = scaled.calls[0];
check(Boolean(scaledCall) && scaledCall.args[7] === apple.w * 2 && scaledCall.args[8] === apple.h * 2, 'scale 2 did not double the destination size');
check(Boolean(scaledCall) && scaledCall.smoothing === false, 'flipped draws must stay unsmoothed');

/* ---------- clips ---------- */

for (const name of ['boy-idle', 'boy-walk', 'boy-crouch', 'boy-happy']) {
  const clip = clipOf(name);
  check(Boolean(clip), `clip "${name}" is missing`);
  if (!clip) continue;
  const sizes = new Set(clip.frames.map((frame) => `${meta.frames[frame].w}x${meta.frames[frame].h}`));
  check(sizes.size === 1, `clip "${name}" mixes frame sizes: ${[...sizes].join(', ')}`);
}
const walk = clipOf('boy-walk');
check(Boolean(walk) && walk.frames.length >= 4, 'boy-walk should have at least four frames');
check(Boolean(walk) && walk.fps >= 7 && walk.fps <= 10, 'boy-walk should start at 100-140 ms per frame (7-10 fps)');

/* ---------- a broken atlas falls back instead of throwing ---------- */

globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
const warnings = [];
const realWarn = console.warn;
console.warn = (...args) => warnings.push(args.join(' '));
const fresh = await import(`${pathToFileURL(join(ROOT, 'src/systems/atlas.js')).href}?fallback`);
const failed = await fresh.loadAtlas();
console.warn = realWarn;
check(failed === null, 'a failing fetch should resolve to null');
check(fresh.atlasStatus().state === 'failed', `state after a failed load is "${fresh.atlasStatus().state}"`);
check(warnings.length === 1, `a failed load should warn once, warned ${warnings.length} time(s)`);

const afterFailure = stubCanvas();
check(fresh.upgradeArt(afterFailure.canvas, 'apple') === false, 'upgradeArt() must not paint from a failed atlas');
check(afterFailure.calls.length === 0, 'nothing should be drawn from a failed atlas');

if (problems.length) {
  console.error(`atlas: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`atlas ok: ${Object.keys(meta.frames).length} frames, ${meta.clips.length} clips, ${Object.keys(ART_MAP).length} swaps`);
