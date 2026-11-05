// Journey: the chapter map. One room at a time, unlocked by living through the last.

import { el, toast } from '../dom.js';
import { t, getUiLang, setUiLang } from '../i18n.js';
import { refresh } from '../router.js';
import { startChapter } from '../chapterflow.js';
import { packById } from '../../lang/index.js';
import { CHAPTERS, loc } from '../../content/index.js';
import { CONCEPT_KEYS } from '../../content/concepts.js';
import {
  state,
  isChapterDone,
  isChapterUnlocked,
  currentChapterIndex,
  knownCount,
  heardCount,
  completedChapterCount,
  setMutedPref,
  setUiLangPref,
} from '../../engine/state.js';
import { sfx, isMuted, setMuted } from '../../systems/audio.js';

function stat(value, label) {
  return el('div', { class: 'stat' }, [
    el('span', { class: 'stat__value', text: String(value) }),
    el('span', { class: 'stat__label', text: label }),
  ]);
}

export function renderJourney({ go }) {
  const pack = packById(state.langId);
  const lang = getUiLang();
  const here = currentChapterIndex(CHAPTERS);

  const screen = el('div', { class: 'screen' });
  const map = el('div', { class: 'map' });

  const head = el('div', { class: 'map__head' }, [
    el('div', { class: 'link-row', style: { justifyContent: 'flex-start', gap: '14px' } }, [
      el('button', {
        type: 'button',
        text: `${t('back')} · ${pack.native}`,
        onclick: () => {
          sfx.page();
          go('title');
        },
      }),
      el('button', {
        type: 'button',
        text: getUiLang() === 'ru' ? 'EN' : 'RU',
        onclick: () => {
          const next = getUiLang() === 'ru' ? 'en' : 'ru';
          setUiLang(next);
          setUiLangPref(next);
          sfx.page();
          refresh();
        },
      }),
    ]),
    el('h2', { class: 'map__title', text: t('journeyTitle') }),
    el('p', { class: 'map__sub', text: t('journeySub') }),
  ]);

  const stats = el('div', { class: 'stats' }, [
    stat(knownCount(CONCEPT_KEYS), t('knownLabel')),
    stat(heardCount(CONCEPT_KEYS), t('heardLabel')),
    stat(`${completedChapterCount(CHAPTERS)}/${CHAPTERS.length}`, t('chaptersLabel')),
  ]);

  const list = el('div', { class: 'chapters' });

  CHAPTERS.forEach((chapter, index) => {
    const unlocked = isChapterUnlocked(CHAPTERS, index);
    const done = isChapterDone(chapter.id);
    const isCurrent = unlocked && !done && index <= here;

    const classes = ['chapter'];
    if (!unlocked) classes.push('is-locked');
    if (done) classes.push('is-done');
    if (isCurrent) classes.push('is-current');

    const stateLabel = !unlocked ? t('locked') : done ? t('done') : isCurrent ? t('current') : t('play');

    const node = el(
      'button',
      {
        class: classes.join(' '),
        type: 'button',
        'aria-disabled': unlocked ? null : 'true',
        onclick: async () => {
          if (!unlocked) {
            sfx.wrong();
            toast(t('locked'), 'bad');
            return;
          }
          sfx.tap();
          await startChapter({ go, chapterId: chapter.id });
        },
      },
      [
        el('span', { class: 'chapter__num', text: unlocked ? String(index + 1) : '·' }),
        el('span', { class: 'chapter__body' }, [
          el('h3', { class: 'chapter__name', text: loc(chapter.title, lang) }),
          el('p', { class: 'chapter__desc', text: loc(chapter.blurb, lang) }),
        ]),
        el('span', { class: 'chapter__state', text: stateLabel }),
      ]
    );
    list.append(node);
  });

  const sound = el('button', {
    type: 'button',
    text: isMuted() ? t('muted') : t('unmuted'),
    onclick: (event) => {
      const next = !isMuted();
      setMuted(next);
      setMutedPref(next);
      event.currentTarget.textContent = next ? t('muted') : t('unmuted');
      if (!next) sfx.blip();
    },
  });

  const foot = el('div', { class: 'link-row', style: { justifyContent: 'flex-start' } }, [
    el('button', {
      type: 'button',
      text: t('notebookBtn'),
      onclick: () => {
        sfx.page();
        go('notebook', { from: 'journey' });
      },
    }),
    sound,
  ]);

  map.append(head, stats, list, foot);
  screen.append(map);

  return { el: screen };
}
