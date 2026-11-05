// Notebook: everything that has crystallized. Unknown concepts stay blurred shapes.

import { el, toast, openSheet } from '../dom.js';
import { t } from '../i18n.js';
import { packById, surfaceOf, romanOf } from '../../lang/index.js';
import { CONCEPTS, CONCEPT_KEYS } from '../../content/concepts.js';
import { CHAPTERS } from '../../content/index.js';
import {
  state,
  isKnown,
  knownCount,
  heardCount,
  completedChapterCount,
} from '../../engine/state.js';
import { spriteCanvas } from '../../systems/sprites.js';
import { speak } from '../../systems/speech.js';
import { sfx } from '../../systems/audio.js';

function buildCell(pack, key) {
  const concept = CONCEPTS[key];
  const known = isKnown(key);
  const status = state.words[key] || { heard: 0 };
  const heard = status.heard > 0;

  const cell = el('button', { class: `lex${known ? '' : ' is-unknown'}`, type: 'button' }, [
    spriteCanvas(concept.sprite, 'lex__sprite'),
    el('span', { class: 'lex__word', text: heard ? surfaceOf(pack, key) : '· · ·' }),
    el('span', {
      class: 'lex__sub',
      text: known ? romanOf(pack, key) || t('done') : heard ? t('notYet') : '',
    }),
    known && status.heard > 1
      ? el('span', { class: 'lex__count', text: t('heardTimes', { n: status.heard }) })
      : null,
  ]);

  cell.onclick = () => {
    if (!known) {
      sfx.wrong();
      toast(t('unknownTap'), 'bad');
      return;
    }
    sfx.blip();
    speak(surfaceOf(pack, key), pack);
  };

  return cell;
}

function statsRow() {
  return el('div', { class: 'stats' }, [
    el('div', { class: 'stat' }, [
      el('span', { class: 'stat__value', text: `${knownCount(CONCEPT_KEYS)}/${CONCEPT_KEYS.length}` }),
      el('span', { class: 'stat__label', text: t('knownLabel') }),
    ]),
    el('div', { class: 'stat' }, [
      el('span', { class: 'stat__value', text: String(heardCount(CONCEPT_KEYS)) }),
      el('span', { class: 'stat__label', text: t('heardLabel') }),
    ]),
    el('div', { class: 'stat' }, [
      el('span', { class: 'stat__value', text: `${completedChapterCount(CHAPTERS)}/${CHAPTERS.length}` }),
      el('span', { class: 'stat__label', text: t('chaptersLabel') }),
    ]),
  ]);
}

function lexGrid(pack) {
  const grid = el('div', { class: 'lex-grid' });
  for (const key of CONCEPT_KEYS) grid.append(buildCell(pack, key));
  return grid;
}

/** Compact lexicon used as an in-play sheet from the play HUD. */
export async function openNotebookSheet() {
  const pack = packById(state.langId);
  const known = knownCount(CONCEPT_KEYS);
  return openSheet({
    title: t('notebookTitle'),
    body: el('div', {}, [
      el('p', { text: known ? t('notebookSub') : t('emptyNotebook') }),
      known ? el('p', { class: 'hint-line', text: t('tapWordHint') }) : null,
      lexGrid(pack),
    ]),
    actions: [{ id: 'ok', label: t('back'), variant: 'primary' }],
  });
}

export function renderNotebook({ go }) {
  const pack = packById(state.langId);

  const screen = el('div', { class: 'screen' });
  const book = el('div', { class: 'notebook' }, [
    el('div', { class: 'map__head' }, [
      el('div', { class: 'link-row', style: { justifyContent: 'flex-start' } }, [
        el('button', {
          type: 'button',
          text: t('back'),
          onclick: () => {
            sfx.page();
            go('journey');
          },
        }),
      ]),
      el('h2', { class: 'map__title', text: t('notebookTitle') }),
      el('p', { class: 'map__sub', text: `${pack.native} · ${t('notebookSub')}` }),
    ]),
    statsRow(),
    lexGrid(pack),
    el('p', { class: 'hint-line', text: t('tapWordHint') }),
  ]);

  screen.append(book);
  return { el: screen };
}
