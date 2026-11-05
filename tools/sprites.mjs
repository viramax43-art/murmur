// Slice the MURMUR concept sheet into game-ready sprites.
//
// The pack ships one 1536x1024 concept painting, not a grid atlas: cells differ
// in size and spacing, so every object is found by its own silhouette. The
// pipeline is deliberately bottom-up:
//
//   1. alpha below ALPHA_CUT is the concept glow/halo, not art       -> dropped
//   2. remaining pixels are grouped into 8-connected blobs
//   3. blobs that nearly touch are merged, then named by their row/column
//   4. each object is cropped 1:1 (no resampling anywhere) and written out
//   5. the boy's poses are re-laid onto one shared canvas with one feet pivot
//   6. everything is packed into murmur_atlas.png + murmur_atlas.json
//
// Nothing here smooths or resamples: pixels are copied, so what the artist drew
// is what the game shows.
//
//   node tools/sprites.mjs            rebuild cutouts, atlas and report sheets
//   node tools/sprites.mjs --verify   check the committed atlas against the sheet

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './png.mjs';
import { ART_MAP } from '../src/systems/atlas.js';
import { SPRITES } from '../src/systems/sprites.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE = 'assets/source/murmur/murmur_sprite_sheet_concept.png';
const CUT_DIR = 'assets/sprites/murmur';
const ATLAS_IMAGE = 'assets/sprites/murmur_atlas.png';
const ATLAS_META = 'assets/sprites/murmur_atlas.json';
const REPORT_DIR = 'tools/out/sprites';

/** Alpha at or below this is the soft glow around every concept object. */
const ALPHA_CUT = 40;
/** Transparent breathing room around each frame, so neighbours never bleed. */
const GUTTER = 4;
/** Transparent border kept inside every cutout. */
const FRAME_MARGIN = 1;
/** Blobs smaller than this are dust, not art. */
const MIN_AREA = 400;
/** Blobs whose boxes overlap (or nearly do) belong to the same object. */
const MERGE_GAP = 3;
/** Rows of the sheet, left to right. Names are used for frames and files. */
const LAYOUT = [
  ['boy-idle-front', 'boy-idle-side', 'boy-walk-1', 'boy-walk-2', 'boy-walk-3', 'boy-walk-4', 'boy-crouch', 'boy-happy'],
  ['blocks', 'ball', 'book', 'rabbit', 'mug', 'apple', 'plant', 'chair'],
  ['window', 'curtain', 'rug', 'picture', 'monstera', 'bird', 'cat', 'chest'],
];

/** Frames that make up the boy's animation clips, plus the timing to start from. */
const CLIPS = [
  { name: 'boy-idle', frames: ['boy-idle-front'], fps: 1 },
  { name: 'boy-turn', frames: ['boy-idle-front', 'boy-idle-side'], fps: 6 },
  { name: 'boy-walk', frames: ['boy-walk-1', 'boy-walk-2', 'boy-walk-3', 'boy-walk-4'], fps: 8, strip: true },
  { name: 'boy-crouch', frames: ['boy-crouch'], fps: 1 },
  { name: 'boy-happy', frames: ['boy-happy'], fps: 1 },
];

const BOY_FRAMES = new Set(LAYOUT[0]);

const abs = (relative) => path.join(ROOT, relative);
const DEBUG = process.argv.includes('--debug');
const readPng = (relative) => decodePng(fs.readFileSync(abs(relative)));
const writePng = (relative, image) => {
  fs.mkdirSync(path.dirname(abs(relative)), { recursive: true });
  fs.writeFileSync(abs(relative), encodePng(image));
};

/** One bit per pixel: is this pixel art, or is it the concept's soft halo? */
function foregroundMask(sheet) {
  const mask = new Uint8Array(sheet.width * sheet.height);
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = sheet.data[i * 4 + 3] >= ALPHA_CUT ? 1 : 0;
  }
  return mask;
}

/** 8-connected blobs, found with an explicit stack so huge art cannot blow up. */
function blobs(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  const found = [];
  const stack = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    seen[start] = 1;
    stack.push(start);
    let area = 0;
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;

    while (stack.length) {
      const index = stack.pop();
      const x = index % width;
      const y = (index - x) / width;
      area += 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const next = ny * width + nx;
          if (!mask[next] || seen[next]) continue;
          seen[next] = 1;
          stack.push(next);
        }
      }
    }

    if (area >= MIN_AREA) found.push({ x0, y0, x1, y1, area });
  }
  return found;
}

const near = (a, b) => a.x0 - MERGE_GAP <= b.x1 && b.x0 - MERGE_GAP <= a.x1 && a.y0 - MERGE_GAP <= b.y1 && b.y0 - MERGE_GAP <= a.y1;

/** Glue blobs that read as one object (a frame and its nail, a bird's legs). */
function mergeBlobs(list) {
  const boxes = list.map((blob) => ({ ...blob }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        if (!near(boxes[i], boxes[j])) continue;
        const a = boxes[i];
        const b = boxes[j];
        boxes[i] = {
          x0: Math.min(a.x0, b.x0),
          y0: Math.min(a.y0, b.y0),
          x1: Math.max(a.x1, b.x1),
          y1: Math.max(a.y1, b.y1),
          area: a.area + b.area,
        };
        boxes.splice(j, 1);
        merged = true;
        break;
      }
      if (merged) break;
    }
  }
  return boxes;
}


/** Copy a box out of the sheet, 1:1, with a hard alpha edge and a margin. */
function cropFrame(sheet, box, margin = FRAME_MARGIN) {
  const x0 = Math.max(0, box.x0 - margin);
  const y0 = Math.max(0, box.y0 - margin);
  const x1 = Math.min(sheet.width - 1, box.x1 + margin);
  const y1 = Math.min(sheet.height - 1, box.y1 + margin);
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const data = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = ((y0 + y) * sheet.width + (x0 + x)) * 4;
      const to = (y * width + x) * 4;
      const alpha = sheet.data[from + 3];
      if (alpha < ALPHA_CUT) continue; // fully transparent, colour discarded
      data[to] = sheet.data[from];
      data[to + 1] = sheet.data[from + 1];
      data[to + 2] = sheet.data[from + 2];
      data[to + 3] = 255;
    }
  }

  return { width, height, data };
}

/**
 * Where a character touches the floor: the horizontal middle of the lowest band
 * of pixels. Using the mean of the whole foot band instead of the single bottom
 * row keeps a walking pose with one foot lifted from drifting sideways.
 */
function stancePivot(image, bandRows = 0) {
  const rows = bandRows || Math.max(2, Math.round(image.height * 0.08));
  let bottom = -1;
  for (let y = image.height - 1; y >= 0 && bottom < 0; y -= 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[(y * image.width + x) * 4 + 3] > 0) {
        bottom = y;
        break;
      }
    }
  }
  if (bottom < 0) return { x: image.width / 2, y: image.height };

  let sum = 0;
  let count = 0;
  for (let y = Math.max(0, bottom - rows + 1); y <= bottom; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[(y * image.width + x) * 4 + 3] > 0) {
        sum += x + 0.5;
        count += 1;
      }
    }
  }
  return { x: count ? sum / count : image.width / 2, y: bottom + 1 };
}

/** Paste `image` into `target` at an integer offset. */
function blit(target, image, dx, dy) {
  for (let y = 0; y < image.height; y += 1) {
    const ty = dy + y;
    if (ty < 0 || ty >= target.height) continue;
    for (let x = 0; x < image.width; x += 1) {
      const tx = dx + x;
      if (tx < 0 || tx >= target.width) continue;
      const from = (y * image.width + x) * 4;
      if (!image.data[from + 3]) continue;
      const to = (ty * target.width + tx) * 4;
      target.data[to] = image.data[from];
      target.data[to + 1] = image.data[from + 1];
      target.data[to + 2] = image.data[from + 2];
      target.data[to + 3] = 255;
    }
  }
}

/** Lay the boy's poses out on one canvas so every clip shares a single pivot. */
function alignBoyFrames(frames) {
  const pivots = new Map();
  let halfW = 0;
  let maxH = 0;

  for (const [name, image] of frames) {
    const pivot = stancePivot(image);
    pivots.set(name, pivot);
    halfW = Math.max(halfW, pivot.x, image.width - pivot.x);
    maxH = Math.max(maxH, image.height);
  }

  halfW = Math.ceil(halfW);
  const width = halfW * 2 + FRAME_MARGIN * 2;
  const height = maxH + FRAME_MARGIN * 2;
  const pivot = { x: halfW + FRAME_MARGIN, y: height - FRAME_MARGIN };

  const aligned = new Map();
  for (const [name, image] of frames) {
    const foot = pivots.get(name);
    const canvas = { width, height, data: Buffer.alloc(width * height * 4) };
    blit(canvas, image, Math.round(pivot.x - foot.x), Math.round(pivot.y - foot.y));
    aligned.set(name, canvas);
  }

  return { frames: aligned, width, height, pivot };
}

/** Frames side by side at 1:1 — the shape a plain spritesheet loader expects. */
function strip(frames) {
  const width = frames.reduce((sum, frame) => sum + frame.width, 0);
  const height = frames.reduce((best, frame) => Math.max(best, frame.height), 0);
  const out = { width, height, data: Buffer.alloc(width * height * 4) };
  let x = 0;
  for (const frame of frames) {
    blit(out, frame, x, height - frame.height);
    x += frame.width;
  }
  return out;
}

/** Checkerboard backing, so transparent edges and halos are obvious to the eye. */
function onChecker(images, { pad = 8, cell = 8 } = {}) {
  const width = images.reduce((sum, image) => sum + image.width + pad, pad);
  const height = images.reduce((best, image) => Math.max(best, image.height), 0) + pad * 2;
  const out = { width, height, data: Buffer.alloc(width * height * 4) };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dark = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      const value = dark ? 0x24 : 0x3c;
      const to = (y * width + x) * 4;
      out.data[to] = value;
      out.data[to + 1] = value;
      out.data[to + 2] = value + 8;
      out.data[to + 3] = 255;
    }
  }

  let x = pad;
  for (const image of images) {
    blit(out, image, x, pad);
    x += image.width + pad;
  }
  return out;
}

/** Group boxes into the sheet's rows (objects in a row overlap vertically). */
function groupRows(boxes) {
  const sorted = [...boxes].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const rows = [];
  let current = null;

  for (const box of sorted) {
    if (!current || box.y0 > current.bottom + 8) {
      current = { bottom: box.y1, boxes: [box] };
      rows.push(current);
    } else {
      current.boxes.push(box);
      current.bottom = Math.max(current.bottom, box.y1);
    }
  }

  for (const row of rows) row.boxes.sort((a, b) => a.x0 - b.x0);
  return rows.map((row) => row.boxes);
}

/** Read the sheet and hand back named, cropped frames. */
function collectFrames() {
  const sheet = readPng(SOURCE);
  const mask = foregroundMask(sheet);
  const raw = blobs(mask, sheet.width, sheet.height);
  if (DEBUG) {
    console.log(`raw blobs: ${raw.length}`);
    for (const box of [...raw].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
      console.log(`  ${box.x0}-${box.x1} x ${box.y0}-${box.y1}  ${box.area}px`);
    }
  }
  const found = mergeBlobs(raw);
  const rows = groupRows(found);

  if (rows.length !== LAYOUT.length) {
    throw new Error(
      `expected ${LAYOUT.length} rows on the sheet, found ${rows.length}:\n` +
        rows.map((row, index) => `  row ${index}: ${row.map((b) => `${b.x0}-${b.x1}/${b.y0}-${b.y1}`).join(' ')}`).join('\n'),
    );
  }

  const frames = new Map();
  rows.forEach((boxes, rowIndex) => {
    const names = LAYOUT[rowIndex];
    if (boxes.length !== names.length) {
      throw new Error(
        `row ${rowIndex} has ${boxes.length} objects, LAYOUT lists ${names.length}:\n` +
          boxes.map((b) => `  ${b.x0}-${b.x1} x ${b.y0}-${b.y1} (${b.area}px)`).join('\n'),
      );
    }
    boxes.forEach((box, columnIndex) => {
      const name = names[columnIndex];
      frames.set(name, { ...cropFrame(sheet, box), source: box });
    });
  });

  return { sheet, frames };
}

/** Shelf-pack frames into one image, gutters kept transparent. */
function packAtlas(frames, width = 1024) {
  const entries = [...frames.entries()].sort((a, b) => b[1].height - a[1].height || a[0].localeCompare(b[0]));
  const rects = new Map();
  let x = GUTTER;
  let y = GUTTER;
  let shelf = 0;

  for (const [name, image] of entries) {
    if (x + image.width + GUTTER > width && x > GUTTER) {
      x = GUTTER;
      y += shelf + GUTTER;
      shelf = 0;
    }
    rects.set(name, { x, y, w: image.width, h: image.height });
    x += image.width + GUTTER;
    shelf = Math.max(shelf, image.height);
  }

  const atlasWidth = Math.max(width, ...entries.map(([, image]) => image.width + GUTTER * 2));
  const atlasHeight = y + shelf + GUTTER;
  const image = { width: atlasWidth, height: atlasHeight, data: Buffer.alloc(atlasWidth * atlasHeight * 4) };
  for (const [name, frame] of frames) {
    const rect = rects.get(name);
    blit(image, frame, rect.x, rect.y);
  }
  return { image, rects, width: atlasWidth, height: atlasHeight };
}

/** Props sit on their base, so the pivot is the bottom centre of the frame. */
function propPivot(frame) {
  return { x: frame.width / 2, y: frame.height };
}

const round = (value) => Math.round(value * 100) / 100;

/** Everything the slicer knows, as one object — also the shape written to JSON. */
function buildAtlas() {
  const { sheet, frames } = collectFrames();

  const boyRaw = new Map([...BOY_FRAMES].map((name) => [name, frames.get(name)]));
  const aligned = alignBoyFrames(boyRaw);
  for (const [name, image] of aligned.frames) frames.set(name, image);

  const packed = packAtlas(frames);
  const meta = {
    version: 1,
    image: path.basename(ATLAS_IMAGE),
    source: SOURCE,
    sheet: { width: sheet.width, height: sheet.height },
    size: { width: packed.width, height: packed.height },
    padding: GUTTER,
    alphaCut: ALPHA_CUT,
    sampling: 'nearest',
    clips: CLIPS.map((clip) => ({
      name: clip.name,
      frames: clip.frames,
      fps: clip.fps,
      loop: clip.frames.length > 1,
    })),
    frames: {},
    map: ART_MAP,
  };

  for (const name of [...packed.rects.keys()].sort((a, b) => a.localeCompare(b))) {
    const rect = packed.rects.get(name);
    const pivot = BOY_FRAMES.has(name) ? aligned.pivot : propPivot(frames.get(name));
    meta.frames[name] = {
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      pivot: { x: round(pivot.x), y: round(pivot.y) },
      clip: (CLIPS.find((clip) => clip.frames.includes(name)) || {}).name || null,
    };
  }

  return { sheet, frames, aligned, packed, meta };
}

function build() {
  const { sheet, frames, aligned, packed, meta } = buildAtlas();

  for (const [name, image] of frames) writePng(`${CUT_DIR}/${name}.png`, image);
  for (const clip of CLIPS) {
    if (!clip.strip) continue;
    writePng(`${CUT_DIR}/${clip.name}.png`, strip(clip.frames.map((name) => frames.get(name))));
  }
  writePng(ATLAS_IMAGE, packed.image);
  fs.mkdirSync(path.dirname(abs(ATLAS_META)), { recursive: true });
  fs.writeFileSync(abs(ATLAS_META), `${JSON.stringify(meta, null, 2)}\n`);

  const rows = [
    CLIPS.flatMap((clip) => clip.frames).filter((name, index, all) => all.indexOf(name) === index),
    LAYOUT[1],
    LAYOUT[2],
  ];
  rows.forEach((names, index) => {
    writePng(`${REPORT_DIR}/row${index + 1}.png`, onChecker(names.map((name) => frames.get(name))));
  });
  writePng(`${REPORT_DIR}/atlas.png`, onChecker([packed.image]));

  console.log(`sheet        ${sheet.width}x${sheet.height}`);
  console.log(`frames       ${frames.size} (boy canvas ${aligned.width}x${aligned.height}, pivot ${aligned.pivot.x},${aligned.pivot.y})`);
  console.log(`atlas        ${packed.width}x${packed.height} -> ${ATLAS_IMAGE}`);
  for (const row of rows) {
    console.log(`  ${row.map((name) => `${name} ${frames.get(name).width}x${frames.get(name).height}`).join(', ')}`);
  }
  console.log(`report       ${REPORT_DIR}`);
}



const sha = (buffer) => crypto.createHash('sha1').update(buffer).digest('hex');

/** Frames must never touch each other, and nothing may sit on the atlas edge. */
function checkPacking(meta) {
  const problems = [];
  const names = Object.keys(meta.frames);
  const { width, height } = meta.size;

  for (const name of names) {
    const frame = meta.frames[name];
    if (frame.x < meta.padding || frame.y < meta.padding) problems.push(`${name}: touches the atlas edge`);
    if (frame.x + frame.w > width - meta.padding || frame.y + frame.h > height - meta.padding) {
      problems.push(`${name}: overflows the atlas`);
    }
  }

  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const a = meta.frames[names[i]];
      const b = meta.frames[names[j]];
      const apart =
        a.x + a.w + meta.padding <= b.x ||
        b.x + b.w + meta.padding <= a.x ||
        a.y + a.h + meta.padding <= b.y ||
        b.y + b.h + meta.padding <= a.y;
      if (!apart) problems.push(`${names[i]} and ${names[j]} are closer than the ${meta.padding}px padding`);
    }
  }

  return problems;
}

/** Every frame must be surrounded by transparent pixels: no halo, no bleed. */
function checkBorders(frames) {
  const problems = [];
  for (const [name, frame] of frames) {
    let dirty = 0;
    const at = (x, y) => frame.data[(y * frame.width + x) * 4 + 3];
    for (let x = 0; x < frame.width; x += 1) dirty += at(x, 0) ? 1 : 0;
    for (let y = 0; y < frame.height; y += 1) dirty += at(0, y) ? 1 : 0;
    if (dirty) problems.push(`${name}: ${dirty} opaque pixels on the outer edge`);
  }
  return problems;
}

function verify() {
  const { frames, meta: fresh, packed } = buildAtlas();
  const problems = [...checkPacking(fresh), ...checkBorders(frames)];

  for (const [name, target] of Object.entries(ART_MAP)) {
    if (!SPRITES[name]) problems.push(`ART_MAP ${name}: not a painted sprite in src/systems/sprites.js`);
    if (!fresh.frames[target]) problems.push(`ART_MAP ${name} -> ${target}: frame missing from the atlas`);
  }

  for (const clip of fresh.clips) {
    const sizes = new Set(clip.frames.map((name) => `${frames.get(name).width}x${frames.get(name).height}`));
    if (clip.frames.length > 1 && sizes.size !== 1) problems.push(`clip ${clip.name}: frames differ in size (${[...sizes].join(', ')})`);
  }

  const committed = fs.existsSync(abs(ATLAS_META)) ? JSON.parse(fs.readFileSync(abs(ATLAS_META), 'utf8')) : null;
  if (!committed) {
    problems.push(`${ATLAS_META} is missing - run node tools/sprites.mjs`);
  } else if (JSON.stringify(committed) !== JSON.stringify(fresh)) {
    problems.push(`${ATLAS_META} is stale - run node tools/sprites.mjs`);
  }

  const committedImage = fs.existsSync(abs(ATLAS_IMAGE)) ? fs.readFileSync(abs(ATLAS_IMAGE)) : null;
  if (!committedImage) {
    problems.push(`${ATLAS_IMAGE} is missing - run node tools/sprites.mjs`);
  } else if (sha(committedImage) !== sha(encodePng(packed.image))) {
    problems.push(`${ATLAS_IMAGE} is stale - run node tools/sprites.mjs`);
  }

  if (problems.length) {
    console.error(`sprite atlas: ${problems.length} problem(s)`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  console.log(
    `sprite atlas ok: ${Object.keys(fresh.frames).length} frames, ${fresh.clips.length} clips, ${fresh.size.width}x${fresh.size.height}`,
  );
}

const args = process.argv.slice(2);
if (args.includes('--verify')) verify();
else build();
