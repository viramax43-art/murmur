// Chapter cutscenes: one rendered still, full bleed, shown before a chapter and
// (when the art exists) after it. Observable, skippable, never blocking: if the
// PNG is missing the game simply carries on.

import { clear, el } from './dom.js';
import { t, getUiLang } from './i18n.js';
import { loc } from '../content/index.js';
import { cutsceneArt, cutsceneById } from '../content/cutscenes.js';
import { sfx } from '../systems/audio.js';

const DEFAULT_MS = 4200;
const FADE_MS = 260;

/**
 * Show one cutscene. Resolves with true once it is dismissed.
 *
 * @param {string} id - cutscene id from src/content/cutscenes.js
 * @param {{ duration?: number, host?: HTMLElement }} options
 */
export function playCutscene(id, { duration = DEFAULT_MS, host = null } = {}) {
  const scene = cutsceneById(id);
  const mount = host || document.getElementById('overlay');
  if (!scene || !mount) return Promise.resolve(false);

  clear(mount);

  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
      layer.classList.add('is-out');
      setTimeout(() => {
        clear(mount);
        mount.hidden = true;
        resolve(true);
      }, FADE_MS);
    };

    const onKey = (event) => {
      if (event.key === 'Escape' || event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        finish();
      }
    };

    const art = el('img', {
      class: 'cutscene__art',
      src: cutsceneArt(scene),
      alt: loc(scene.title, getUiLang()),
      draggable: 'false',
    });
    art.addEventListener('error', () => {
      layer.classList.add('is-missing');
      finish();
    });

    const layer = el('div', { class: 'cutscene', role: 'dialog', 'aria-modal': 'true' }, [
      art,
      el('div', { class: 'cutscene__fade', 'aria-hidden': 'true' }),
      el('div', { class: 'cutscene__bar' }, [
        el('span', { class: 'cutscene__title', text: loc(scene.title, getUiLang()) }),
        el('button', {
          class: 'cutscene__skip',
          type: 'button',
          text: t('skip'),
          onclick: (event) => {
            event.stopPropagation();
            finish();
          },
        }),
      ]),
    ]);

    layer.addEventListener('click', finish);
    mount.append(layer);
    mount.hidden = false;
    if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);
    sfx.page();
    timer = setTimeout(finish, duration);
  });
}
