// Hi-res art sliced from the concept sheet (assets/sprites/murmur_atlas.png).
//
// The atlas is one image plus a JSON of frame rectangles, so drawing a frame is
// a straight copy: nearest filtering, no mipmaps, no resampling. The canvas is
// then scaled by CSS with `image-rendering: pixelated`, exactly like the painted
// sprites in ./sprites.js — the two renderers agree on how pixels should look.
//
// Nothing here touches the DOM at import time, so tools/ and the headless tests
// can read ART_MAP and ask questions without a browser.

export const ATLAS_IMAGE = 'assets/sprites/murmur_atlas.png';
export const ATLAS_META = 'assets/sprites/murmur_atlas.json';

/**
 * Painted sprite -> atlas frame. This is the migration table from the art pack:
 * a name appears here only once its new art has been checked in a scene.
 *
 * Small UI icons are deliberately absent. The painted 12x12 maps are drawn at
 * 40-70 px in the notebook and in answer cards; a 150 px painting squeezed into
 * that box would have to be resampled, which is the one thing the art pack asks
 * us not to do.
 */
export const ART_MAP = {
  friend: 'boy-idle-front',
  ball: 'ball',
  book: 'book',
  apple: 'apple',
};

let meta = null;
let image = null;
let state = 'idle'; // idle | loading | ready | failed
let loadPromise = null;
const waiting = new Set();

const canLoad = () =>
  typeof fetch === 'function' &&
  typeof Image !== 'undefined' &&
  typeof document !== 'undefined';

export function atlasStatus() {
  return { state, frames: meta ? Object.keys(meta.frames).length : 0, size: meta ? meta.size : null };
}

export function hasArt(name) {
  return Object.prototype.hasOwnProperty.call(ART_MAP, name);
}

export function artName(name) {
  return ART_MAP[name] || null;
}

/** Frame rectangle + pivot for an atlas frame name, or null before load. */
export function frameOf(name) {
  if (!meta || !name) return null;
  return meta.frames[name] || null;
}

/** Clip metadata (`frames`, `fps`, `loop`) for an animated character. */
export function clipOf(name) {
  if (!meta) return null;
  return meta.clips.find((clip) => clip.name === name) || null;
}

function notify() {
  for (const callback of [...waiting]) {
    waiting.delete(callback);
    try {
      callback();
    } catch (error) {
      // A listener must never break the load; the sprite it belongs to simply
      // keeps whatever it painted before.
      if (typeof console !== 'undefined') console.warn('[atlas] listener failed', error);
    }
  }
}

/** Run `callback` once the atlas is ready; returns a promise-free unsubscribe. */
export function onAtlasReady(callback) {
  if (state === 'ready') {
    callback();
    return () => {};
  }
  if (state === 'failed') return () => {};
  waiting.add(callback);
  return () => waiting.delete(callback);
}

/** Load the atlas once. Safe to call from anywhere, browsers included. */
export function loadAtlas() {
  if (loadPromise) return loadPromise;
  if (!canLoad()) {
    state = 'failed';
    return Promise.resolve(null);
  }

  state = 'loading';
  loadPromise = Promise.all([
    fetch(ATLAS_META).then((response) => {
      if (!response.ok) throw new Error(`${ATLAS_META}: HTTP ${response.status}`);
      return response.json();
    }),
    new Promise((resolve, reject) => {
      const bitmap = new Image();
      bitmap.onload = () => resolve(bitmap);
      bitmap.onerror = () => reject(new Error(`${ATLAS_IMAGE}: could not be decoded`));
      bitmap.src = ATLAS_IMAGE;
    }),
  ])
    .then(([data, bitmap]) => {
      meta = data;
      image = bitmap;
      state = 'ready';
      notify();
      return { meta, image };
    })
    .catch((error) => {
      state = 'failed';
      loadPromise = null;
      if (typeof console !== 'undefined') console.warn('[atlas] falling back to painted sprites:', error.message);
      return null;
    });

  return loadPromise;
}

/**
 * Draw one frame into a context at an integer scale. Returns false when the
 * atlas is not ready or the frame does not exist, so callers can keep their
 * painted fallback without a try/catch.
 */
export function drawArtFrame(ctx, frameName, { x = 0, y = 0, scale = 1, flip = false } = {}) {
  const frame = frameOf(frameName);
  if (!frame || !image || !ctx || typeof ctx.drawImage !== 'function') return false;
  ctx.imageSmoothingEnabled = false;
  const step = Math.max(1, Math.round(scale));
  const width = frame.w * step;
  const height = frame.h * step;

  if (flip) {
    ctx.save();
    ctx.translate(x + width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, width, height);
    ctx.restore();
  } else {
    ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, x, y, width, height);
  }
  return true;
}

/**
 * Repaint an existing canvas with atlas art as soon as it is available. The
 * canvas keeps its painted content until then, so a slow load never leaves a
 * hole in the layout.
 */
export function upgradeArt(canvas, name, { scale = 1 } = {}) {
  const frameName = artName(name);
  if (!canvas || !frameName) return false;

  const paint = () => {
    const frame = frameOf(frameName);
    if (!frame) return false;
    const step = Math.max(1, Math.round(scale));
    canvas.width = frame.w * step;
    canvas.height = frame.h * step;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return false;
    canvas.dataset.frame = frameName;
    return drawArtFrame(ctx, frameName, { scale: step });
  };

  if (paint()) return true;
  onAtlasReady(paint);
  return false;
}
