// Game state + localStorage save. The lexicon is keyed by concept, not by word,
// so switching target language keeps what the player already understood.

const STORAGE_KEY = 'murmur.save.v1';

function emptyState() {
  return {
    version: 1,
    langId: null,
    uiLang: 'en',
    muted: false,
    createdAt: 0,
    updatedAt: 0,
    // concept key -> { heard, correct, wrong, known }
    words: {},
    // chapter id -> { done, plays, lastBeat }
    chapters: {},
  };
}

export const state = emptyState();

function storage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadState() {
  const store = storage();
  const fresh = emptyState();
  if (!store) return state;

  let saved = null;
  try {
    saved = JSON.parse(store.getItem(STORAGE_KEY) || 'null');
  } catch {
    saved = null;
  }

  Object.assign(state, fresh, saved || {});
  state.words = { ...(saved && saved.words) };
  state.chapters = { ...(saved && saved.chapters) };
  if (!state.createdAt) state.createdAt = Date.now();
  return state;
}

export function saveState() {
  const store = storage();
  if (!store) return;
  state.updatedAt = Date.now();
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked — the game keeps running in memory */
  }
}

export function resetState() {
  const uiLang = state.uiLang;
  Object.assign(state, emptyState());
  state.uiLang = uiLang;
  state.createdAt = Date.now();
  saveState();
}

export function setLanguage(langId) {
  state.langId = langId;
  saveState();
}

export function setUiLangPref(uiLang) {
  state.uiLang = uiLang;
  saveState();
}

export function setMutedPref(muted) {
  state.muted = Boolean(muted);
  saveState();
}

export function hasProgress() {
  return Boolean(state.langId) || Object.keys(state.words).length > 0;
}

/* ---------- lexicon ---------- */

export function wordStatus(key) {
  if (!state.words[key]) state.words[key] = { heard: 0, correct: 0, wrong: 0, known: false };
  return state.words[key];
}

export function isKnown(key) {
  return Boolean(state.words[key] && state.words[key].known);
}

export function markHeard(key) {
  const status = wordStatus(key);
  status.heard += 1;
  saveState();
  return status;
}

/** Returns true only the first time a word crystallizes. */
export function learnWord(key) {
  const status = wordStatus(key);
  const fresh = !status.known;
  status.known = true;
  status.correct += 1;
  saveState();
  return fresh;
}

export function markAnswer(key, ok) {
  const status = wordStatus(key);
  if (ok) status.correct += 1;
  else status.wrong += 1;
  saveState();
  return status;
}

export function knownKeys(conceptKeys) {
  return conceptKeys.filter((key) => isKnown(key));
}

export function knownCount(conceptKeys) {
  return knownKeys(conceptKeys).length;
}

export function heardCount(conceptKeys) {
  return conceptKeys.filter((key) => state.words[key] && state.words[key].heard > 0).length;
}

/* ---------- chapters ---------- */

export function chapterState(id) {
  if (!state.chapters[id]) state.chapters[id] = { done: false, plays: 0, lastBeat: 0, objects: {} };
  const chapter = state.chapters[id];
  if (!chapter.objects) chapter.objects = {};
  return chapter;
}

/* ---------- explorable objects ---------- */

export function isObjectDone(chapterId, objectId) {
  return Boolean(chapterState(chapterId).objects[objectId]);
}

export function markObjectDone(chapterId, objectId) {
  chapterState(chapterId).objects[objectId] = true;
  saveState();
}

/** Walking into a chapter from the map starts its room from the first object. */
export function resetObjects(chapterId) {
  chapterState(chapterId).objects = {};
  saveState();
}

export function countObjectsDone(chapterId, objects) {
  return objects.filter((object) => isObjectDone(chapterId, object.id)).length;
}

export function isChapterDone(id) {
  return Boolean(state.chapters[id] && state.chapters[id].done);
}

export function markChapterBeat(id, beat) {
  const chapter = chapterState(id);
  chapter.lastBeat = beat;
  saveState();
}

export function completeChapter(id) {
  const chapter = chapterState(id);
  const firstTime = !chapter.done;
  chapter.done = true;
  chapter.plays += 1;
  chapter.lastBeat = 0;
  saveState();
  return firstTime;
}

/** Chapter 1 is always open; the rest unlock one at a time. */
export function isChapterUnlocked(chapters, index) {
  if (index <= 0) return true;
  const previous = chapters[index - 1];
  if (!previous) return true;
  return isChapterDone(previous.id);
}

export function completedChapterCount(chapters) {
  return chapters.filter((chapter) => isChapterDone(chapter.id)).length;
}

/** First chapter that is unlocked but not finished — where "continue" should land. */
export function currentChapterIndex(chapters) {
  for (let i = 0; i < chapters.length; i += 1) {
    if (!isChapterDone(chapters[i].id) && isChapterUnlocked(chapters, i)) return i;
  }
  return Math.max(0, chapters.length - 1);
}
