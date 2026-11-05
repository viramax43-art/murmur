// Chapter boundaries, in one place.
//
// Both the journey map and a finished room come through here, so the order —
// opening still, walkable room, closing still, sheet — is defined exactly once.

import { el, openSheet } from './dom.js';
import { t } from './i18n.js';
import { playCutscene } from './cutscene.js';
import { cutsceneFor } from '../content/cutscenes.js';
import { CHAPTERS } from '../content/index.js';
import { conceptSprite } from '../content/concepts.js';
import { spriteCanvas } from '../systems/sprites.js';
import { packById, surfaceOf, romanOf } from '../lang/index.js';
import { state, isKnown, isChapterDone, completeChapter, resetObjects } from '../engine/state.js';
import { sfx } from '../systems/audio.js';

/** Open a chapter: cutscene, then its room, from the first object when replaying. */
export async function startChapter({ go, chapterId }) {
  const chapter = CHAPTERS.find((item) => item.id === chapterId);
  if (!chapter) {
    go('journey');
    return;
  }
  if (isChapterDone(chapter.id)) resetObjects(chapter.id);
  const opening = cutsceneFor(chapter.id, 'start');
  if (opening) await playCutscene(opening.id);
  go('explore', { chapterId: chapter.id });
}

/** Close a chapter: the words that settled, and the road onward. */
export async function showChapterEnd({ chapter, go }) {
  completeChapter(chapter.id);
  sfx.chime();

  const closing = cutsceneFor(chapter.id, 'end');
  if (closing) await playCutscene(closing.id);

  const pack = packById(state.langId || undefined);
  const known = chapter.words.filter((key) => isKnown(key));
  const index = CHAPTERS.findIndex((item) => item.id === chapter.id);
  const next = CHAPTERS[index + 1];

  const body = el('div', {}, [
    el('p', { text: t('chapterDoneBody') }),
    el(
      'div',
      { class: 'lex-grid' },
      known.map((key) =>
        el('div', { class: 'lex' }, [
          spriteCanvas(conceptSprite(key), 'lex__sprite'),
          el('span', { class: 'lex__word', text: surfaceOf(pack, key) }),
          el('span', { class: 'lex__sub', text: romanOf(pack, key) }),
        ])
      )
    ),
  ]);

  const actions = next
    ? [
        { id: 'next', label: t('nextChapter'), variant: 'primary' },
        { id: 'journey', label: t('backToJourney') },
      ]
    : [{ id: 'journey', label: t('backToJourney'), variant: 'primary' }];

  const answer = await openSheet({ title: t('chapterDone'), body, actions });
  if (answer === 'next' && next) await startChapter({ go, chapterId: next.id });
  else go('journey');
}
