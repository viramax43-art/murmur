// Title screen: pick the language you will grow into, then begin.

import { el, openSheet, toast } from '../dom.js';
import { t, setUiLang, getUiLang, UI_LANGS } from '../i18n.js';
import { PACKS, DEFAULT_PACK_ID, surfaceOf } from '../../lang/index.js';
import { CONCEPT_KEYS } from '../../content/concepts.js';
import { CHAPTERS } from '../../content/index.js';
import {
  state,
  setLanguage,
  setUiLangPref,
  resetState,
  hasProgress,
  knownCount,
  completedChapterCount,
} from '../../engine/state.js';
import { speak } from '../../systems/speech.js';
import { sfx, unlockAudio } from '../../systems/audio.js';

function logo() {
  const node = el('h1', { class: 'brand__logo', 'aria-label': 'MURMUR' });
  const letters = Array.from('MURMUR');
  const spans = letters.map((letter) => {
    const span = el('span', { text: letter, 'aria-hidden': 'true' });
    node.append(span);
    return span;
  });
  return { node, spans };
}

export function renderTitle({ go }) {
  let timer = 0;
  let activeId = state.langId || DEFAULT_PACK_ID;

  const screen = el('div', { class: 'screen screen--center title-screen' });

  const brand = el('div', { class: 'brand' });
  const mark = logo();
  const tag = el('p', { class: 'brand__tag' }, [
    t('logoTag'),
    el('span', { class: 'en', text: 'MURMUR · the first words' }),
  ]);
  brand.append(mark.node, tag);

  // letters crystallize one by one, mirroring the core mechanic
  const stagger = () => {
    mark.spans.forEach((span, index) => {
      timer = setTimeout(() => span.classList.add('lit'), 140 + index * 130);
    });
  };
  stagger();

  const grid = el('div', { class: 'lang-grid' });
  const cards = new Map();

  const paint = () => {
    for (const [id, card] of cards) {
      const on = id === activeId;
      card.classList.toggle('is-active', on);
      card.setAttribute('aria-pressed', String(on));
    }
  };

  for (const pack of PACKS) {
    const card = el(
      'button',
      {
        class: 'lang-card',
        type: 'button',
        'aria-pressed': String(pack.id === activeId),
        onclick: () => {
          unlockAudio();
          sfx.tap();
          activeId = pack.id;
          setLanguage(pack.id);
          paint();
          speak(surfaceOf(pack, 'hello'), pack);
          startBtn.textContent = t('start');
        },
      },
      [
        el('span', { class: 'lang-card__flag', text: pack.flag, 'aria-hidden': 'true' }),
        el('span', { class: 'lang-card__meta' }, [
          el('span', { class: 'lang-card__name', text: pack.native }),
          el('span', { class: 'lang-card__sub', text: `${pack.name === pack.native ? '' : pack.name + ' · '}${pack.caption}` }),
        ]),
      ]
    );
    card.dataset.lang = pack.id;
    cards.set(pack.id, card);
    grid.append(card);
  }
  paint();

  const pick = el('div', { class: 'pick' }, [
    el('div', { class: 'pick__label', text: t('chooseLang') }),
    grid,
  ]);

  const startBtn = el(
    'button',
    {
      class: 'btn btn--primary btn--wide',
      type: 'button',
      onclick: () => {
        unlockAudio();
        setLanguage(activeId);
        sfx.chime();
        go('journey');
      },
    },
    hasProgress() ? t('continueGame') : t('start')
  );

  const known = knownCount(CONCEPT_KEYS);
  const done = completedChapterCount(CHAPTERS);
  const progressLine = known
    ? t('wordsOf', { known, total: CONCEPT_KEYS.length }) + ' · ' + t('progressOf', { done, total: CHAPTERS.length })
    : t('howTo');

  const uiToggle = el('div', { class: 'link-row' });
  for (const lang of UI_LANGS) {
    uiToggle.append(
      el('button', {
        type: 'button',
        text: lang.short,
        'aria-pressed': String(getUiLang() === lang.id),
        style: { opacity: getUiLang() === lang.id ? '1' : '0.55', color: getUiLang() === lang.id ? 'var(--accent)' : '' },
        onclick: () => {
          setUiLang(lang.id);
          setUiLangPref(lang.id);
          sfx.page();
          go('title');
        },
      })
    );
  }

  const links = el('div', { class: 'link-row' }, [
    el('button', {
      type: 'button',
      text: t('howTo'),
      onclick: async () => {
        await openSheet({
          title: t('howToTitle'),
          body: el('ul', {}, (t('howToBody')).map((line) => el('li', { text: line }))),
          actions: [{ id: 'ok', label: t('next'), variant: 'primary' }],
        });
      },
    }),
    el('button', {
      type: 'button',
      text: t('about'),
      onclick: async () => {
        await openSheet({
          title: t('aboutTitle'),
          body: el('p', { text: t('aboutBody') }),
          actions: [{ id: 'ok', label: t('next'), variant: 'primary' }],
        });
      },
    }),
    hasProgress()
      ? el('button', {
          type: 'button',
          text: t('reset'),
          onclick: async () => {
            const answer = await openSheet({
              title: t('resetTitle'),
              body: el('p', { text: t('resetBody') }),
              actions: [
                { id: 'cancel', label: t('cancel') },
                { id: 'reset', label: t('confirm'), variant: 'primary' },
              ],
            });
            if (answer === 'reset') {
              resetState();
              toast(t('reset'), 'good');
              go('title');
            }
          },
        })
      : null,
  ]);

  const actions = el('div', { class: 'title-actions' }, [
    startBtn,
    el('p', { class: 'hint-line', text: progressLine }),
    links,
    uiToggle,
  ]);

  screen.append(brand, pick, actions);

  return {
    el: screen,
    cleanup() {
      clearTimeout(timer);
    },
  };
}
