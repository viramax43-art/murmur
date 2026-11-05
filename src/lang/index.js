// Language pack registry + text helpers. Pure data/logic: safe to import in Node.

import enUS from './en-US.js';
import enUK from './en-UK.js';
import fr from './fr.js';
import ru from './ru.js';
import ja from './ja.js';
import zh from './zh.js';
import ko from './ko.js';

export const PACKS = [enUS, enUK, fr, ru, ja, zh, ko];
export const DEFAULT_PACK_ID = 'en-US';

const BY_ID = new Map(PACKS.map((pack) => [pack.id, pack]));

export function packById(id) {
  return BY_ID.get(id) || BY_ID.get(DEFAULT_PACK_ID);
}

export function hasWord(pack, key) {
  return Boolean(pack && pack.words && Object.prototype.hasOwnProperty.call(pack.words, key));
}

export function wordEntry(pack, key) {
  return hasWord(pack, key) ? pack.words[key] : null;
}

/** The written form of a concept in a given language. */
export function surfaceOf(pack, key) {
  const entry = wordEntry(pack, key);
  return entry ? entry.w : key;
}

/** Optional romanization/reading (kana, han, hangul packs). */
export function romanOf(pack, key) {
  const entry = wordEntry(pack, key);
  return entry && entry.r ? entry.r : '';
}

const INDEX_CACHE = new WeakMap();

function surfaceIndex(pack) {
  let index = INDEX_CACHE.get(pack);
  if (index) return index;
  index = new Map();
  for (const [key, entry] of Object.entries(pack.words)) {
    index.set(entry.w.toLowerCase(), key);
  }
  INDEX_CACHE.set(pack, index);
  return index;
}

export function keyForSurface(pack, text) {
  return surfaceIndex(pack).get(String(text).toLowerCase()) || null;
}

const KEY_CACHE = new WeakMap();

function keySet(pack) {
  let keys = KEY_CACHE.get(pack);
  if (!keys) {
    keys = new Set(Object.keys(pack.words));
    KEY_CACHE.set(pack, keys);
  }
  return keys;
}

/**
 * Scripted lines are authored with concept keys ("mama milk") so a single line
 * reads correctly in every pack; a word written in the target script resolves
 * through the surface index instead.
 */
export function keyForToken(pack, text) {
  const lowered = String(text).toLowerCase();
  if (keySet(pack).has(lowered)) return lowered;
  return surfaceIndex(pack).get(lowered) || null;
}

const TOKEN_RE = /([\p{L}\p{N}][\p{L}\p{N}''’\-]*)|([^\p{L}\p{N}]+)/gu;

/**
 * Split a scripted line into word tokens (concept keys) and literal text.
 * Spaces and punctuation stay as text tokens so the line keeps its rhythm.
 */
export function tokenize(pack, line) {
  const tokens = [];
  TOKEN_RE.lastIndex = 0;
  let match;
  const source = String(line ?? '');
  while ((match = TOKEN_RE.exec(source)) !== null) {
    if (match[1]) {
      const key = keyForToken(pack, match[1]);
      if (key) tokens.push({ type: 'word', key });
      else tokens.push({ type: 'text', text: match[1] });
    } else {
      tokens.push({ type: 'text', text: match[2] });
    }
  }
  return tokens;
}

export function lineWords(pack, line) {
  return tokenize(pack, line)
    .filter((token) => token.type === 'word')
    .map((token) => token.key);
}

/** What the speech engine should say for a scripted line. */
export function lineSpeech(pack, line) {
  return tokenize(pack, line)
    .map((token) => (token.type === 'word' ? surfaceOf(pack, token.key) : token.text))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Spelling units: the smallest thing the player assembles in a spell beat. */
export function unitsOf(pack, key) {
  const entry = wordEntry(pack, key);
  if (!entry) return [];
  return Array.from(String(entry.w)).filter((ch) => !/\s/.test(ch));
}

export function shuffleList(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Target units plus a few distractors drawn from other words in the same pack,
 * so the chip tray always uses the target script.
 */
export function chipsFor(pack, key, extra = 3) {
  const units = unitsOf(pack, key);
  const used = new Set(units);
  const pool = new Set();
  for (const otherKey of Object.keys(pack.words)) {
    if (otherKey === key) continue;
    for (const unit of unitsOf(pack, otherKey)) {
      if (!used.has(unit)) pool.add(unit);
    }
  }
  const distractors = shuffleList(Array.from(pool)).slice(0, extra);
  return shuffleList([...units, ...distractors]);
}

export function spokenWord(pack, key) {
  const entry = wordEntry(pack, key);
  return entry ? entry.w : '';
}
