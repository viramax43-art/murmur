// Play screen: runs one chapter's beats against a live stage.
// Beats are sequential: every interaction resolves the same pending `settle()`.

import { el, clear, toast, wait } from '../dom.js';
import { t, getUiLang } from '../i18n.js';
import {
  packById,
  surfaceOf,
  romanOf,
  lineSpeech,
  lineWords,
  unitsOf,
  chipsFor,
  shuffleList,
} from '../../lang/index.js';
import { CHAPTERS, chapterById, loc } from '../../content/index.js';
import { conceptSprite } from '../../content/concepts.js';
import { spriteCanvas } from '../../systems/sprites.js';
import { createStage3D } from '../../systems/stage3d.js';
import {
  speak,
  stopSpeaking,
  listen as listenMic,
  asrAvailable,
  speechMatches,
  ttsAvailable,
} from '../../systems/speech.js';
import { state, isKnown, markHeard, learnWord, markAnswer, markObjectDone } from '../../engine/state.js';
import { sfx, unlockAudio } from '../../systems/audio.js';
import { renderLine, wordSpan, murmurWord } from '../line.js';
import { openNotebookSheet } from './notebook.js';
import { showChapterEnd } from '../chapterflow.js';

export function renderPlay({ go, params }) {
  unlockAudio();
  const chapter = chapterById(params && params.chapterId) || CHAPTERS[0];
  const pack = packById(state.langId || undefined);
  const lang = getUiLang();

  // The walkable room hands us one object's worth of beats; opening a chapter
  // straight from the map still plays all of them.
  const all = chapter.beats;
  const fromRoom = Boolean(params && params.from === 'explore');
  const startAt = Number.isInteger(params && params.beatStart) ? Math.max(0, params.beatStart) : 0;
  const endAt = Number.isInteger(params && params.beatEnd)
    ? Math.min(all.length - 1, params.beatEnd)
    : all.length - 1;
  const beats = all.slice(startAt, endAt + 1);

  let cancelled = false;
  let settled = null;
  let followHandler = null;
  let beatIndex = 0;

  function settle(value) {
    const resolve = settled;
    settled = null;
    if (resolve) resolve(value);
  }

  function awaitBeat() {
    return new Promise((resolve) => {
      settled = resolve;
    });
  }

  async function pause(ms, value) {
    await wait(ms);
    if (!cancelled) settle(value);
  }

  /* ---------- shell ---------- */

  const counter = el('span', { class: 'hud__chapter', text: '' });
  const meterFill = el('i', { class: 'meter__fill' });
  const title = el('span', { class: 'hud__chapter', text: loc(chapter.title, lang) });

  const hud = el('div', { class: 'hud' }, [
    el('button', {
      class: 'btn btn--small btn--ghost',
      type: 'button',
      text: '←',
      'aria-label': t('backToJourney'),
      onclick: () => {
        sfx.page();
        if (fromRoom) go('explore', { chapterId: chapter.id });
        else go('journey');
      },
    }),
    el('div', { class: 'hud__meta' }, [
      el('div', { class: 'hud__row' }, [title, counter]),
      el('div', { class: 'meter' }, [meterFill]),
    ]),
    el('button', {
      class: 'btn btn--small btn--ghost',
      type: 'button',
      text: '▤',
      'aria-label': t('notebookBtn'),
      onclick: () => {
        sfx.page();
        openNotebookSheet();
      },
    }),
  ]);

  const stage = el('div', { class: 'stage', dataset: { bg: chapter.bg } }, [el('div', { class: 'stage__light' })]);
  const layer = el('div', { class: 'layer' });
  const objects = new Map();

  for (const entry of chapter.cast) {
    const tag = el('span', { class: 'obj__tag' });
    const node = el(
      'div',
      {
        class: 'obj',
        dataset: { id: entry.id, size: entry.size || 'md', flip: entry.flip ? '1' : '0' },
        style: { left: `${entry.x}%`, top: `${entry.y}%` },
      },
      // The stage draws its cast large, so this is the one slot that opts in to
      // the hi-res atlas (see docs/sprites.md for the size sums).
      [spriteCanvas(entry.sprite, 'obj__sprite', 8, { art: true }), tag]
    );
    node.addEventListener('click', () => {
      sfx.tap();
      if (followHandler) followHandler(entry.id);
    });
    objects.set(entry.id, node);
    stage.append(node);
  }

  stage.append(layer);

  // The 3D stage: a real room, real light, and the same cast standing in it as
  // billboards. Opt out with ?stage=2d; without WebGL2 createStage3D() returns
  // null and this screen is exactly the CSS stage it was before.
  const search = typeof location === 'undefined' ? '' : location.search;
  const wants3D = !/[?&]stage=2d/.test(search);
  const stage3d = wants3D ? createStage3D({ cast: chapter.cast, bg: chapter.bg, search }) : null;
  if (stage3d) {
    stage.classList.add('stage--3d');
    stage.append(stage3d.el);
    stage3d.bind(objects);
  }

  const wrap = el('div', { class: 'stage-wrap' }, [stage]);
  const screen = el('div', { class: 'screen screen--play' }, [hud, wrap]);

  function setFocus(id) {
    for (const [key, node] of objects) node.classList.toggle('is-focus', key === id);
  }

  function setSpeaking(id) {
    for (const [key, node] of objects) node.classList.toggle('is-speaking', key === id);
  }

  function updateHud() {
    counter.textContent = `${Math.min(beatIndex + 1, beats.length)} / ${beats.length}`;
    meterFill.style.width = `${Math.round((beatIndex / Math.max(1, beats.length)) * 100)}%`;
  }

  function sayLine(text, who) {
    setSpeaking(who || null);
    return speak(text, pack).then((ok) => {
      if (!cancelled) setSpeaking(null);
      return ok;
    });
  }

  function speakerLabel(who) {
    if (!who) return el('span', { text: t('narrator') });
    return el('span', {}, [wordSpan(pack, who)]);
  }

  /* ---------- beat builders ---------- */

  async function beatNarrate(beat) {
    const dialog = el('div', { class: 'dialog' }, [
      el('div', { class: 'dialog__who' }, [el('span', { text: t('narrator') })]),
      el('p', { class: 'dialog__line', text: loc(beat.text, lang) }),
      el('div', { class: 'dialog__tools' }, [
        el('span', { class: 'dialog__hint', text: t('tapNext') }),
        el('button', {
          class: 'btn btn--small',
          type: 'button',
          text: t('next'),
          onclick: () => settle('next'),
        }),
      ]),
    ]);
    dialog.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      settle('next');
    });
    layer.append(dialog);
    await awaitBeat();
  }

  async function beatSay(beat) {
    for (const key of lineWords(pack, beat.line)) markHeard(key);

    let answered = false;
    const next = () => {
      if (answered) return;
      answered = true;
      settle('next');
    };

    const dialog = el('div', { class: 'dialog' }, [
      el('div', { class: 'dialog__who' }, [speakerLabel(beat.who)]),
      el('p', { class: 'dialog__line' }, [renderLine(pack, beat.line)]),
      el('div', { class: 'dialog__tools' }, [
        el('div', { class: 'dialog__left' }, [
          el('button', {
            class: 'btn btn--small btn--ghost',
            type: 'button',
            text: `▸ ${t('listen')}`,
            onclick: () => {
              sfx.blip();
              sayLine(lineSpeech(pack, beat.line), beat.who);
            },
          }),
        ]),
        el('div', { class: 'dialog__right' }, [
          el('span', { class: 'dialog__hint', text: t('tapNext') }),
          el('button', { class: 'btn btn--small', type: 'button', text: t('next'), onclick: next }),
        ]),
      ]),
    ]);

    layer.append(dialog);
    sayLine(lineSpeech(pack, beat.line), beat.who)
      .then((ok) => (ok ? wait(520) : null))
      .then(next);
    await awaitBeat();
    setSpeaking(null);
  }

  function buildCards({ options, answerKey, onWin }) {
    const row = el('div', { class: 'cards' });
    const cards = new Map();

    shuffleList(options).forEach((key, index) => {
      const card = el(
        'button',
        { class: 'card', type: 'button', 'aria-label': `${index + 1}` },
        [spriteCanvas(conceptSprite(key), 'card__sprite', 6)]
      );
      card.addEventListener('click', () => {
        if (cancelled) return;
        sfx.tap();
        if (card.classList.contains('is-dim') || card.classList.contains('is-correct')) return;
        if (key === answerKey) {
          card.classList.add('is-correct');
          for (const [otherKey, other] of cards) {
            if (otherKey !== key) other.classList.add('is-dim');
          }
          onWin();
        } else {
          markAnswer(answerKey, false);
          sfx.wrong();
          card.classList.add('is-wrong');
          toast(t('wrong'), 'bad');
          setTimeout(() => card.classList.remove('is-wrong'), 430);
        }
      });
      cards.set(key, card);
      row.append(card);
    });

    return row;
  }


  function quizPanel({ titleNode, sub, body, word }) {
    return el('div', { class: 'panel' }, [
      el('div', { class: 'panel__inner' }, [
        titleNode,
        sub,
        body,
        el('div', { class: 'panel__foot' }, [
          el('button', {
            class: 'btn btn--small btn--ghost',
            type: 'button',
            text: `▸ ${t('listen')}`,
            onclick: () => {
              sfx.blip();
              speak(surfaceOf(pack, word), pack);
            },
          }),
          el('span', { class: 'dialog__hint', text: t('whichWord') }),
        ]),
      ]),
    ]);
  }

  async function beatInfer(beat) {
    markHeard(beat.word);
    const titleNode = el('div', { class: 'panel__title' }, [murmurWord(pack, beat.word)]);
    const sub = el('p', { class: 'panel__sub', text: loc(beat.hint, lang) || t('whichWord') });

    const cards = buildCards({
      options: beat.options,
      answerKey: beat.word,
      onWin: () => {
        markAnswer(beat.word, true);
        learnWord(beat.word);
        titleNode.replaceChildren(wordSpan(pack, beat.word, { fresh: true }));
        sub.textContent = t('correct');
        sfx.learn();
        toast(`${t('newWord')} · ${surfaceOf(pack, beat.word)}`, 'good');
        pause(950, 'ok');
      },
    });

    layer.append(quizPanel({ titleNode, sub, body: cards, word: beat.word }));
    speak(surfaceOf(pack, beat.word), pack);
    await awaitBeat();
  }

  async function beatListen(beat) {
    const titleNode = el('div', { class: 'panel__title', text: t('whichWord') });
    const sub = el('p', {
      class: 'panel__sub',
      text: romanOf(pack, beat.word) ? `〔${romanOf(pack, beat.word)}〕` : t('tapToHear'),
    });

    const cards = buildCards({
      options: beat.options,
      answerKey: beat.word,
      onWin: () => {
        markAnswer(beat.word, true);
        learnWord(beat.word);
        sfx.correct();
        toast(t('correct'), 'good');
        pause(720, 'ok');
      },
    });

    layer.append(quizPanel({ titleNode, sub, body: cards, word: beat.word }));
    markHeard(beat.word);
    speak(surfaceOf(pack, beat.word), pack);
    await awaitBeat();
  }

  async function beatFollow(beat) {
    const prompt = el('div', { class: 'ask' }, [
      el('span', { text: `${t('tapThe', { word: '' }).trim()} ` }),
      wordSpan(pack, beat.word),
    ]);
    layer.append(prompt);

    if (!isKnown(beat.word)) markHeard(beat.word);
    speak(surfaceOf(pack, beat.word), pack);

    for (const node of objects.values()) node.classList.add('is-tap');

    let solved = false;
    followHandler = (id) => {
      if (solved || cancelled) return;
      const node = objects.get(id);
      if (!node) return;
      if (id === beat.word) {
        solved = true;
        node.classList.add('is-good');
        learnWord(beat.word);
        sfx.correct();
        toast(t('correct'), 'good');
        pause(640, 'ok');
        return;
      }
      markAnswer(beat.word, false);
      sfx.wrong();
      toast(t('wrong'), 'bad');
      node.classList.add('is-wrong');
      setTimeout(() => node.classList.remove('is-wrong'), 430);
    };

    await awaitBeat();
    followHandler = null;
    for (const node of objects.values()) node.classList.remove('is-tap', 'is-good');
  }


  async function beatSpell(beat) {
    const units = unitsOf(pack, beat.word);
    const assembled = new Array(units.length).fill(null);
    const slots = [];
    const chips = [];
    let solved = false;

    const slotRow = el('div', { class: 'slots' });
    const chipRow = el('div', { class: 'chips' });

    const paint = () => {
      const next = assembled.indexOf(null);
      slots.forEach((slot, i) => {
        slot.textContent = assembled[i] || '';
        slot.classList.toggle('is-filled', Boolean(assembled[i]));
        slot.classList.toggle('is-next', i === next);
      });
    };

    const win = () => {
      if (solved) return;
      solved = true;
      learnWord(beat.word);
      markAnswer(beat.word, true);
      sfx.learn();
      toast(`${t('correct')} · ${surfaceOf(pack, beat.word)}`, 'good');
      pause(820, 'ok');
    };

    const check = () => {
      if (assembled.some((ch) => ch === null)) return;
      if (assembled.join('') === units.join('')) {
        win();
        return;
      }
      sfx.wrong();
      toast(t('wrong'), 'bad');
      for (const slot of slots) slot.classList.add('is-bad');
      wait(560).then(() => {
        if (cancelled) return;
        for (const slot of slots) slot.classList.remove('is-bad');
        assembled.fill(null);
        for (const chip of chips) {
          delete chip.dataset.slot;
          chip.classList.remove('is-used');
        }
        paint();
      });
    };

    units.forEach((_, i) => {
      const slot = el('button', { class: 'slot', type: 'button', 'aria-label': `${i + 1}` });
      slot.addEventListener('click', () => {
        if (cancelled || !assembled[i]) return;
        const chip = chips.find((c) => c.dataset.slot === String(i));
        if (chip) {
          delete chip.dataset.slot;
          chip.classList.remove('is-used');
        }
        assembled[i] = null;
        sfx.tap();
        paint();
      });
      slots.push(slot);
      slotRow.append(slot);
    });

    for (const ch of chipsFor(pack, beat.word, 3)) {
      const chip = el('button', { class: 'chip', type: 'button', text: ch });
      chip.dataset.ch = ch;
      chip.addEventListener('click', () => {
        if (cancelled || solved || chip.classList.contains('is-used')) return;
        const i = assembled.indexOf(null);
        if (i === -1) return;
        assembled[i] = ch;
        chip.dataset.slot = String(i);
        chip.classList.add('is-used');
        sfx.tap();
        paint();
        check();
      });
      chips.push(chip);
      chipRow.append(chip);
    }

    paint();

    const titleNode = el('div', { class: 'panel__title' }, [
      el('span', { class: 'known', text: surfaceOf(pack, beat.word) }),
    ]);

    layer.append(
      el('div', { class: 'panel' }, [
        el('div', { class: 'panel__inner' }, [
          el('p', { class: 'panel__sub', text: t('spellIt') }),
          titleNode,
          slotRow,
          chipRow,
          el('div', { class: 'panel__foot' }, [
            el('button', {
              class: 'btn btn--small btn--ghost',
              type: 'button',
              text: `▸ ${t('listen')}`,
              onclick: () => {
                sfx.blip();
                speak(surfaceOf(pack, beat.word), pack);
              },
            }),
            el('span', { class: 'dialog__hint', text: t('spellHint') }),
          ]),
        ]),
      ])
    );

    speak(surfaceOf(pack, beat.word), pack);
    await awaitBeat();
  }


  async function beatSpeak(beat) {
    const target = surfaceOf(pack, beat.word);
    const transcript = el('div', { class: 'transcript', text: t('micTap') });
    const mic = el('button', { class: 'mic', type: 'button', text: '🎤', 'aria-label': t('micTap') });

    let answered = false;
    const finishBeat = (value) => {
      if (answered) return;
      answered = true;
      settle(value);
    };

    const titleNode = el('div', { class: 'panel__title' }, [
      el('span', { class: 'known', text: target }),
      romanOf(pack, beat.word) ? el('span', { class: 'line-sub', text: romanOf(pack, beat.word) }) : null,
    ]);

    let busy = false;
    mic.addEventListener('click', async () => {
      if (busy || cancelled) return;
      busy = true;
      sfx.mic();
      mic.classList.add('is-listening');
      transcript.textContent = t('listening');

      const heard = await listenMic(pack);

      mic.classList.remove('is-listening');
      busy = false;
      if (cancelled) return;

      if (!heard || !heard.length) {
        transcript.textContent = t('micTap');
        toast(t('micDenied'), 'bad');
        return;
      }

      transcript.textContent = t('heard', { text: heard[0].text });
      if (speechMatches(target, heard)) {
        learnWord(beat.word);
        markAnswer(beat.word, true);
        sfx.correct();
        toast(t('correct'), 'good');
        wait(900).then(() => finishBeat('ok'));
      }
    });

    layer.append(
      el('div', { class: 'panel' }, [
        el('div', { class: 'panel__inner' }, [
          el('p', { class: 'panel__sub', text: t('sayIt') }),
          titleNode,
          el('div', { class: 'speak' }, [mic, transcript]),
          el('div', { class: 'panel__foot' }, [
            el('button', {
              class: 'btn btn--small btn--ghost',
              type: 'button',
              text: `▸ ${t('listen')}`,
              onclick: () => {
                sfx.blip();
                speak(target, pack);
              },
            }),
            el('button', {
              class: 'btn btn--small btn--ghost',
              type: 'button',
              text: t('skip'),
              onclick: () => finishBeat('skip'),
            }),
          ]),
        ]),
      ])
    );

    if (!asrAvailable()) {
      toast(t('micDenied'));
      wait(1500).then(() => finishBeat('skip'));
    } else {
      speak(target, pack);
    }

    await awaitBeat();
  }

  async function finish() {
    stopSpeaking();
    // In a room, one object ends a slice of the chapter: drop the player back on
    // the floor and let the room decide when the chapter itself is over.
    if (fromRoom) {
      if (params.objectId) markObjectDone(chapter.id, params.objectId);
      go('explore', { chapterId: chapter.id });
      return;
    }
    await showChapterEnd({ chapter, go });
  }

  /* ---------- beat loop ---------- */

  async function run() {
    if (!ttsAvailable()) toast(t('noVoice', { lang: pack.native }));
    for (beatIndex = 0; beatIndex < beats.length; beatIndex += 1) {
      if (cancelled) return;
      updateHud();
      await playBeat(beats[beatIndex]);
      if (cancelled) return;
    }
    meterFill.style.width = '100%';
    finish();
  }

  function playBeat(beat) {
    clear(layer);
    setFocus(beat.focus || null);
    switch (beat.type) {
      case 'narrate':
        return beatNarrate(beat);
      case 'say':
        return beatSay(beat);
      case 'infer':
        return beatInfer(beat);
      case 'listen':
        return beatListen(beat);
      case 'follow':
        return beatFollow(beat);
      case 'spell':
        return beatSpell(beat);
      case 'speak':
        return beatSpeak(beat);
      default:
        return Promise.resolve();
    }
  }

  run();

  return {
    el: screen,
    cleanup() {
      cancelled = true;
      settle('cancel');
      stopSpeaking();
      if (stage3d) stage3d.dispose();
      clear(layer);
    },
  };
}
