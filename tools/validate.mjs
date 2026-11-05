// Content validator — `npm run validate`.
// Fails loudly when a language pack, sprite, chapter or beat references
// something that does not exist, so a broken build never ships silently.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PACKS, tokenize, lineWords, unitsOf } from '../src/lang/index.js';
import { CONCEPTS, CONCEPT_KEYS } from '../src/content/concepts.js';
import { CHAPTERS, BEAT_TYPES } from '../src/content/index.js';
import { SPRITES, PALETTE } from '../src/systems/sprites.js';
import { ROOMS } from '../src/content/rooms.js';
import { PROP_NAMES, DECOR, THEMES } from '../src/systems/tiles.js';
import { buildGrid, approachTiles, findPath, canStand } from '../src/systems/world.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UI_LANGS = ['en', 'ru'];
const SIZES = new Set(['sm', 'md', 'lg', 'xl']);
// Scripts a learner cannot sound out from the letters alone get a reading.
const READING_SCRIPTS = new Set(['kana', 'han', 'hangul']);
const MAX_SPELL = 12;

const errors = [];
const notes = [];
const fail = (message) => errors.push(message);
const note = (message) => notes.push(message);

const readText = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (entry.name.endsWith('.js')) out.push(rel.replace(/\\/g, '/'));
  }
  return out;
}

/* ---------- 1. sprites ---------- */

const usedSprites = new Map();
for (const key of CONCEPT_KEYS) usedSprites.set(CONCEPTS[key].sprite, `concept "${key}"`);
for (const chapter of CHAPTERS) {
  for (const entry of chapter.cast) usedSprites.set(entry.sprite, `chapter "${chapter.id}" cast "${entry.id}"`);
}

for (const [name, who] of usedSprites) {
  const rows = SPRITES[name];
  if (!rows || !rows.length) {
    fail(`${who}: sprite "${name}" does not exist`);
    continue;
  }
  const width = rows[0].length;
  rows.forEach((row, y) => {
    if (row.length !== width) {
      fail(`sprite "${name}" row ${y} has ${row.length} cells, expected ${width}`);
    }
    for (const ch of row) {
      if (!Object.prototype.hasOwnProperty.call(PALETTE, ch)) {
        fail(`sprite "${name}" row ${y} uses palette char "${ch}" that is not defined`);
        break;
      }
    }
  });
}

/* ---------- 2. language packs ---------- */

for (const pack of PACKS) {
  const at = `pack "${pack.id}"`;
  for (const field of ['name', 'native', 'flag', 'script', 'caption']) {
    if (!pack[field]) fail(`${at}: missing "${field}"`);
  }
  if (!pack.voice || !pack.voice.lang) fail(`${at}: missing voice.lang`);

  const surfaces = new Map();
  for (const key of CONCEPT_KEYS) {
    const entry = pack.words[key];
    if (!entry || typeof entry.w !== 'string' || !entry.w.trim()) {
      fail(`${at}: no word for concept "${key}"`);
      continue;
    }
    if (READING_SCRIPTS.has(pack.script) && !entry.r) {
      fail(`${at}: "${key}" (${entry.w}) needs a romanization`);
    }

    const surface = entry.w.toLowerCase();
    if (surfaces.has(surface)) {
      fail(`${at}: "${entry.w}" is used for both "${surfaces.get(surface)}" and "${key}"`);
    }
    surfaces.set(surface, key);

    const tokens = tokenize(pack, entry.w);
    if (tokens.length !== 1 || tokens[0].type !== 'word' || tokens[0].key !== key) {
      fail(`${at}: "${entry.w}" does not tokenize back to "${key}"`);
    }
    if (!unitsOf(pack, key).length) fail(`${at}: "${key}" has no spelling units`);
  }

  for (const key of Object.keys(pack.words)) {
    if (!CONCEPTS[key]) fail(`${at}: word for unknown concept "${key}"`);
  }
}

/* ---------- 3. chapters + beats ---------- */

const chapterIds = new Set();
const taught = new Set();
let beatCount = 0;

for (const chapter of CHAPTERS) {
  const at = `chapter "${chapter.id}"`;
  if (chapterIds.has(chapter.id)) fail(`${at}: duplicate id`);
  chapterIds.add(chapter.id);

  // words the player already met in an earlier chapter may be reused freely
  const earlier = new Set(taught);

  for (const lang of UI_LANGS) {
    if (!chapter.title || !chapter.title[lang]) fail(`${at}: missing ${lang} title`);
    if (!chapter.blurb || !chapter.blurb[lang]) fail(`${at}: missing ${lang} blurb`);
  }
  if (!chapter.bg) fail(`${at}: missing bg`);
  if (!Array.isArray(chapter.words) || !chapter.words.length) fail(`${at}: missing words list`);

  for (const word of chapter.words) {
    if (!CONCEPTS[word]) fail(`${at}: words lists unknown concept "${word}"`);
    taught.add(word);
  }

  const cast = new Map();
  for (const entry of chapter.cast) {
    if (!entry.id) {
      fail(`${at}: cast entry without an id`);
      continue;
    }
    if (cast.has(entry.id)) fail(`${at}: duplicate cast id "${entry.id}"`);
    cast.set(entry.id, entry);
    if (!CONCEPTS[entry.id]) fail(`${at}: cast "${entry.id}" is not a concept, so its name cannot be spoken`);
    if (!Number.isFinite(entry.x) || entry.x < 0 || entry.x > 100) fail(`${at}: cast "${entry.id}" x must be 0..100`);
    if (!Number.isFinite(entry.y) || entry.y < 0 || entry.y > 100) fail(`${at}: cast "${entry.id}" y must be 0..100`);
    if (!SIZES.has(entry.size || 'md')) fail(`${at}: cast "${entry.id}" has unknown size "${entry.size}"`);
  }

  const chapterTaught = new Set();

  chapter.beats.forEach((beat, index) => {
    beatCount += 1;
    const where = `${at} beat ${index + 1} (${beat.type})`;
    if (!BEAT_TYPES.includes(beat.type)) {
      fail(`${where}: unknown beat type`);
      return;
    }

    if (beat.type === 'narrate') {
      for (const lang of UI_LANGS) {
        if (!beat.text || !beat.text[lang]) fail(`${where}: missing ${lang} narration`);
      }
      return;
    }

    if (beat.type === 'say') {
      if (!beat.line) {
        fail(`${where}: missing line`);
        return;
      }
      if (beat.who && !cast.has(beat.who)) fail(`${where}: who "${beat.who}" is not in the cast`);
      const tokens = tokenize(PACKS[0], beat.line);
      const keys = tokens.filter((token) => token.type === 'word').map((token) => token.key);
      if (!keys.length) fail(`${where}: line "${beat.line}" contains no known words`);
      for (const token of tokens) {
        if (token.type === 'text' && /\p{L}/u.test(token.text)) {
          fail(`${where}: "${token.text}" is not in the lexicon (lines are written with concept keys)`);
        }
      }
      for (const pack of PACKS) {
        const own = lineWords(pack, beat.line);
        if (own.join(' ') !== keys.join(' ')) {
          fail(`${where}: pack "${pack.id}" reads the line as [${own.join(', ')}]`);
        }
      }
      for (const key of keys) chapterTaught.add(key);
      return;
    }

    if (beat.type === 'infer' || beat.type === 'listen') {
      if (!CONCEPTS[beat.word]) {
        fail(`${where}: word "${beat.word}" is not a concept`);
        return;
      }
      const options = Array.isArray(beat.options) ? beat.options : [];
      if (options.length < 2) fail(`${where}: needs at least two options`);
      if (options.length > 6) fail(`${where}: too many options (${options.length})`);
      for (const option of options) {
        if (!CONCEPTS[option]) fail(`${where}: option "${option}" is not a concept`);
      }
      if (!options.includes(beat.word)) fail(`${where}: options do not include "${beat.word}"`);
      if (new Set(options).size !== options.length) fail(`${where}: has duplicate options`);
      if (beat.type === 'infer' && !beat.hint) fail(`${where}: infer beats need a hint`);
      chapterTaught.add(beat.word);
      return;
    }

    if (beat.type === 'follow') {
      if (!cast.has(beat.word)) {
        fail(`${where}: "${beat.word}" is not on the stage, so it cannot be tapped`);
        return;
      }
      chapterTaught.add(beat.word);
      return;
    }

    if (beat.type === 'spell' || beat.type === 'speak') {
      if (!CONCEPTS[beat.word]) {
        fail(`${where}: word "${beat.word}" is not a concept`);
        return;
      }
      for (const pack of PACKS) {
        const units = unitsOf(pack, beat.word);
        if (units.length > MAX_SPELL) {
          fail(`${where}: "${pack.id}" needs ${units.length} units, over the ${MAX_SPELL} limit`);
        }
      }
      if (beat.type === 'speak' && index < 3) note(`${where}: the mic beat lands very early in the chapter`);
      chapterTaught.add(beat.word);
    }
  });

  for (const word of chapterTaught) {
    if (!chapter.words.includes(word) && !earlier.has(word)) {
      fail(`${at}: teaches "${word}" but does not list it in words`);
    }
  }
}


/* ---------- 4. rooms ---------- */

const propNames = new Set(PROP_NAMES);
const decorNames = new Set(Object.keys(DECOR));

for (const chapter of CHAPTERS) {
  const at = `room "${chapter.id}"`;
  const room = ROOMS[chapter.id];
  if (!room) {
    fail(`${at}: no walkable room, so the chapter cannot start`);
    continue;
  }
  if (!THEMES[room.theme]) fail(`${at}: unknown theme "${room.theme}"`);

  const width = room.map[0].length;
  room.map.forEach((row, y) => {
    if (row.length !== width) fail(`${at}: row ${y} has ${row.length} cells, expected ${width}`);
  });

  const grid = buildGrid(room);
  if (grid.w !== width || grid.h !== room.map.length) fail(`${at}: grid does not match the map`);

  for (let y = 0; y < room.map.length; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cell = room.map[y][x];
      if (cell === '#' || cell === '.') continue;
      const decor = room.legend && room.legend[cell];
      if (!decor) fail(`${at}: map cell "${cell}" at ${x},${y} is not in the legend`);
      else if (!decorNames.has(decor)) fail(`${at}: legend "${cell}" points at unknown decor "${decor}"`);
    }
  }

  if (!room.actor) fail(`${at}: needs an actor (baby or child)`);
  if (!canStand(grid, room.spawn.x, room.spawn.y)) {
    fail(`${at}: spawn ${room.spawn.x},${room.spawn.y} is inside something solid`);
  }

  for (const item of room.furniture || []) {
    if (!propNames.has(item.sprite)) fail(`${at}: furniture "${item.id}" uses unknown prop "${item.sprite}"`);
  }

  const ids = new Set();
  const ordered = room.objects.slice().sort((a, b) => a.beats[0] - b.beats[0]);
  let expected = 0;
  for (const object of ordered) {
    const where = `${at} object "${object.id}"`;
    if (ids.has(object.id)) fail(`${at}: object id "${object.id}" is used twice`);
    ids.add(object.id);
    if (!propNames.has(object.sprite)) fail(`${where}: unknown prop "${object.sprite}"`);
    if (!Array.isArray(object.beats) || object.beats.length !== 2) {
      fail(`${where}: beats must be [first, last]`);
      continue;
    }
    if (object.beats[0] !== expected) {
      fail(`${where}: starts at beat ${object.beats[0]}, expected ${expected} so the room covers the chapter in order`);
    }
    if (object.beats[1] < object.beats[0]) fail(`${where}: beat range runs backwards`);
    expected = object.beats[1] + 1;

    const w = object.w || 1;
    const h = object.h || 1;
    if (object.x < 1 || object.y < 1 || object.x + w > width - 1 || object.y + h > room.map.length - 1) {
      fail(`${where}: sits in the wall at ${object.x},${object.y}`);
    }

    const approaches = approachTiles(grid, object);
    if (!approaches.length) {
      fail(`${where}: nothing walkable beside it, so it can never be used`);
      continue;
    }
    const here = { tx: Math.floor(room.spawn.x), ty: Math.floor(room.spawn.y) };
    const reachable =
      approaches.some((tile) => tile.tx === here.tx && tile.ty === here.ty) ||
      approaches.some((tile) => findPath(grid, room.spawn, tile).length > 0);
    if (!reachable) fail(`${where}: cannot be reached from the spawn point`);
  }

  if (expected !== chapter.beats.length) {
    fail(`${at}: objects cover ${expected} of ${chapter.beats.length} beats — the chapter would be cut short`);
  }
}



const i18nSource = readText('src/ui/i18n.js');
function tableFor(name) {
  const start = i18nSource.indexOf(`const ${name} = {`);
  if (start < 0) return new Set();
  const end = i18nSource.indexOf('\n};', start);
  const body = i18nSource.slice(start, end);
  return new Set([...body.matchAll(/^ {2}(\w+):/gm)].map((match) => match[1]));
}

const enKeys = tableFor('en');
const ruKeys = tableFor('ru');
for (const key of enKeys) if (!ruKeys.has(key)) fail(`i18n: "${key}" is missing from ru`);
for (const key of ruKeys) if (!enKeys.has(key)) fail(`i18n: "${key}" is missing from en`);

const usedKeys = new Set();
for (const file of walk('src/ui')) {
  const source = readText(file);
  for (const match of source.matchAll(/\bt\('(\w+)'/g)) usedKeys.add(match[1]);
}
for (const key of usedKeys) {
  if (!enKeys.has(key)) fail(`i18n: "${key}" is used in the UI but not defined in i18n.js`);
}

/* ---------- report ---------- */

const untaught = CONCEPT_KEYS.filter((key) => !taught.has(key));

console.log('MURMUR content check');
console.log(`  language packs : ${PACKS.length}`);
console.log(`  concepts       : ${CONCEPT_KEYS.length} total, ${taught.size} taught in this slice`);
console.log(`  chapters       : ${CHAPTERS.length}`);
console.log(`  beats          : ${beatCount}`);
console.log(`  sprites        : ${usedSprites.size} referenced / ${Object.keys(SPRITES).length} defined`);
console.log(`  ui strings     : ${enKeys.size} en / ${ruKeys.size} ru, ${usedKeys.size} used`);
if (untaught.length) console.log(`  not yet used   : ${untaught.join(', ')}`);
for (const line of notes) console.log(`  note: ${line}`);

if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const message of errors) console.error(`  x ${message}`);
  process.exit(1);
}

console.log('\nOK - everything checks out');

