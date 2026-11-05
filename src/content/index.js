// All scene data, in play order.

import ch1 from './chapter-1.js';
import ch2 from './chapter-2.js';
import ch3 from './chapter-3.js';
import ch4 from './chapter-4.js';
import ch5 from './chapter-5.js';

export const CHAPTERS = [ch1, ch2, ch3, ch4, ch5];

const BY_ID = new Map(CHAPTERS.map((chapter) => [chapter.id, chapter]));

export function chapterById(id) {
  return BY_ID.get(id) || null;
}

/** Beat kinds the runner knows how to play. */
export const BEAT_TYPES = ['narrate', 'say', 'infer', 'listen', 'follow', 'spell', 'speak'];

/** Pick the current interface language out of a { en, ru } block. */
export function loc(block, lang) {
  if (!block) return '';
  if (typeof block === 'string') return block;
  return block[lang] || block.en || '';
}
