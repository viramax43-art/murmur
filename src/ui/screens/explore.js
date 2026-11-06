// A chapter you can walk around in — the Escapists-shaped half of MURMUR.
//
// The room is one painted canvas, the player is a tiny sprite on a second
// canvas, and every hotspot owns a slice of the chapter's beats. Walk up to
// something, press Space (or tap it), and those beats play as an overlay; when
// they are done you are back on the floor with one fewer thing left to learn.

import { el, toast, wait } from '../dom.js';
import { t, getUiLang } from '../i18n.js';
import { chapterById, CHAPTERS, loc } from '../../content/index.js';
import { roomFor, orderedObjects } from '../../content/rooms.js';
import { buildGrid, moveEntity, findPath, pathToObject, objectsInReach, facingFor } from '../../systems/world.js';
import { paintRoom, paintActors } from '../../systems/tiles.js';
import { createScene3D } from '../../systems/scene3d.js';
import { countObjectsDone, isObjectDone } from '../../engine/state.js';
import { sfx, unlockAudio } from '../../systems/audio.js';
import { openNotebookSheet } from './notebook.js';
import { showChapterEnd } from '../chapterflow.js';

const SPEEDS = { child: 3.6, baby: 2.8 };
const STEP_MS = 170;
const ARRIVE = 0.07;

export function renderExplore({ go, params }) {
  unlockAudio();
  const chapter = chapterById(params && params.chapterId) || CHAPTERS[0];
  const room = roomFor(chapter.id) || roomFor('ch1');
  const lang = getUiLang();
  const grid = buildGrid(room);
  const objects = orderedObjects(room);
  const roomW = room.map[0].length;
  const roomH = room.map.length;

  let cancelled = false;
  let leaving = false;
  let rafId = 0;
  let lastTime = 0;
  let stepClock = 0;
  let pending = null;
  let waypoints = [];
  const held = new Set();

  const player = {
    kind: room.actor || 'child',
    x: room.spawn.x,
    y: room.spawn.y,
    dir: room.spawn.dir || 'down',
    frame: 0,
  };

  /* ---------- shell ---------- */

  const meterFill = el('i', { class: 'meter__fill' });
  const counter = el('span', { class: 'hud__chapter', text: '' });

  const hud = el('div', { class: 'hud' }, [
    el('button', {
      class: 'btn btn--small btn--ghost',
      type: 'button',
      text: '←',
      'aria-label': t('backToJourney'),
      onclick: () => {
        sfx.page();
        go('journey');
      },
    }),
    el('div', { class: 'hud__meta' }, [
      el('div', { class: 'hud__row' }, [
        el('span', { class: 'hud__chapter', text: loc(room.title, lang) }),
        counter,
      ]),
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

  /* ---------- room layers ---------- */

  // The painted room is the fallback, not the default: when WebGL2 answers, the
  // 3D scene draws the same room as a place with a floor, walls, light and a
  // camera that walks with the player. Everything else in this screen — the
  // grid, the keys, the pathfinding, the beats — is untouched either way.
  const search = typeof location === 'undefined' ? '' : location.search;
  const wants3D = !/[?&]world=2d/.test(search);

  // Painted layers, built only if the 3D scene cannot be built. `painted` stays
  // null when the renderer answers, which is what roomEl checks.
  let painted = null;
  let actors = null;

  const spots = el('div', { class: 'room__spots' });
  const spotNodes = new Map();

  for (const object of objects) {
    const label = loc(object.label, lang);
    const node = el(
      'button',
      {
        class: 'hotspot',
        type: 'button',
        'aria-label': label,
        dataset: { id: object.id },
        style: {
          left: `${(((object.w || 1) / 2 + object.x) / roomW) * 100}%`,
          top: `${((object.y + (object.h || 1) - 0.25) / roomH) * 100}%`,
        },
        onclick: (event) => {
          if (typeof event.stopPropagation === 'function') event.stopPropagation();
          approach(object);
        },
      },
      [
        el('span', { class: 'hotspot__pip', 'aria-hidden': 'true' }),
        el('span', { class: 'hotspot__label', text: label }),
      ]
    );
    spotNodes.set(object.id, node);
    spots.append(node);
  }

  const hint = el('div', { class: 'room__hint' }, [
    el('span', { class: 'room__hint-key', text: 'E' }),
    el('span', { class: 'room__hint-label', text: t('look') }),
    el('span', { class: 'room__hint-text', text: loc(room.hint, lang) }),
  ]);

  const keys = el('p', { class: 'room__keys', text: t('walkHint') });

  const scene3d = wants3D
    ? createScene3D({
        room,
        provider: () => player,
        onTile: (tile) => walkToTile(tile.tx, tile.ty),
        onProp: (id) => {
          const object = objects.find((entry) => entry.id === id);
          if (object) approach(object);
        },
        nodes: spotNodes,
        search,
      })
    : null;

  // No WebGL2, no shader, no canvas: the room is exactly what it was in 2D.
  if (!scene3d) {
    painted = paintRoom(room);
    painted.canvas.classList.add('room__floor');
    painted.canvas.setAttribute('aria-hidden', 'true');

    actors = document.createElement('canvas');
    actors.className = 'room__actors';
    actors.width = painted.canvas.width || roomW * 32;
    actors.height = painted.canvas.height || roomH * 32;
    actors.setAttribute('aria-hidden', 'true');
  }

  const roomEl = el(
    'div',
    {
      class: scene3d ? 'room room--3d' : 'room',
      dataset: { theme: room.theme },
      style: { aspectRatio: `${roomW} / ${roomH}` },
    },
    scene3d ? [scene3d.el, spots, hint] : [painted.canvas, actors, spots, hint]
  );

  const stage = el('div', { class: 'room-stage' }, [roomEl]);
  const wrap = el('div', { class: 'room-wrap' }, [stage, keys]);
  const screen = el('div', { class: 'screen screen--play' }, [hud, wrap]);


  /* ---------- progress ---------- */

  function lockedObject(object) {
    const index = objects.findIndex((entry) => entry.id === object.id);
    if (index <= 0) return false;
    return objects.slice(0, index).some((entry) => !isObjectDone(chapter.id, entry.id));
  }

  function paintHud() {
    const done = countObjectsDone(chapter.id, objects);
    counter.textContent = `${done} / ${objects.length}`;
    if (meterFill.style) meterFill.style.width = `${Math.round((done / Math.max(1, objects.length)) * 100)}%`;
    const allDone = done >= objects.length;
    let markedNext = false;
    for (const object of objects) {
      const node = spotNodes.get(object.id);
      if (!node) continue;
      const finished = isObjectDone(chapter.id, object.id);
      node.classList.toggle('is-done', finished);
      node.classList.toggle('is-locked', !finished && lockedObject(object));
      node.disabled = allDone || finished;
      const next = !finished && !markedNext;
      if (next) markedNext = true;
      node.classList.toggle('is-next', next);
    }
    roomEl.classList.toggle('is-complete', allDone);
  }

  function paintSpotState(focusId) {
    for (const [id, node] of spotNodes) node.classList.toggle('is-near', id === focusId);
  }

  /* ---------- walking ---------- */

  function approach(object) {
    if (cancelled || leaving || !object || chapterComplete()) return;
    if (lockedObject(object)) {
      sfx.wrong();
      toast(t('notNow'));
      return;
    }
    if (objectsInReach(room, player).some((entry) => entry.id === object.id)) {
      interact(object);
      return;
    }
    const path = pathToObject(grid, player, object);
    if (!path.length || typeof requestAnimationFrame !== 'function') {
      interact(object);
      return;
    }
    waypoints = path;
    pending = object;
    sfx.blip();
  }

  function chapterComplete() {
    return countObjectsDone(chapter.id, objects) >= objects.length;
  }

  function interact(object) {
    if (cancelled || leaving || !object || chapterComplete()) return;
    if (lockedObject(object)) {
      sfx.wrong();
      toast(t('notNow'));
      return;
    }
    leaving = true;
    sfx.tap();
    go('play', {
      chapterId: chapter.id,
      from: 'explore',
      objectId: object.id,
      beatStart: object.beats[0],
      beatEnd: object.beats[1],
    });
  }

  function walkToTile(tx, ty) {
    if (cancelled || leaving) return;
    pending = null;
    waypoints = findPath(grid, player, { tx, ty });
    if (waypoints.length) sfx.blip();
  }

  function step(dt) {
    let vx = 0;
    let vy = 0;

    if (held.has('left')) vx -= 1;
    if (held.has('right')) vx += 1;
    if (held.has('up')) vy -= 1;
    if (held.has('down')) vy += 1;

    if (vx || vy) {
      waypoints = [];
      pending = null;
    } else if (waypoints.length) {
      const target = waypoints[0];
      const dx = target.x - player.x;
      const dy = target.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist < ARRIVE) {
        waypoints.shift();
        if (!waypoints.length && pending) {
          const object = pending;
          pending = null;
          interact(object);
          return;
        }
      } else {
        vx = dx / dist;
        vy = dy / dist;
      }
    }

    const speed = SPEEDS[player.kind] || SPEEDS.child;
    if (vx || vy) {
      const len = Math.hypot(vx, vy) || 1;
      const next = moveEntity(grid, player, (vx / len) * speed * dt, (vy / len) * speed * dt);
      player.dir = facingFor(vx, vy, player.dir);
      if (next.x !== player.x || next.y !== player.y) {
        player.x = next.x;
        player.y = next.y;
        stepClock += dt * 1000;
        if (stepClock >= STEP_MS) {
          stepClock = 0;
          player.frame = player.frame ? 0 : 1;
        }
      } else if (!waypoints.length) {
        stepClock = 0;
        player.frame = 0;
      }
    } else {
      player.frame = 0;
      stepClock = 0;
    }

    const reach = objectsInReach(room, player);
    paintSpotState(reach.length ? reach[0].id : null);
  }


  /* ---------- input ---------- */

  const KEYMAP = {
    arrowleft: 'left', a: 'left',
    arrowright: 'right', d: 'right',
    arrowup: 'up', w: 'up',
    arrowdown: 'down', s: 'down',
  };

  function onKeyDown(event) {
    const target = event.target;
    if (target && typeof target.closest === 'function' && target.closest('button, input, textarea')) return;
    const key = String(event.key || '').toLowerCase();
    const dir = KEYMAP[key];
    if (dir) {
      held.add(dir);
      if (typeof event.preventDefault === 'function') event.preventDefault();
      return;
    }
    if (key === ' ' || key === 'enter' || key === 'e') {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      const reach = objectsInReach(room, player);
      if (reach.length) interact(reach[0]);
    }
  }

  function onKeyUp(event) {
    const dir = KEYMAP[String(event.key || '').toLowerCase()];
    if (dir) held.delete(dir);
  }

  function onBlur() {
    held.clear();
  }

  function onRoomClick(event) {
    if (leaving || scene3d) return; // in 3D the scene does the ray cast itself
    const rect = typeof roomEl.getBoundingClientRect === 'function' ? roomEl.getBoundingClientRect() : null;
    if (!rect || !rect.width || !rect.height) return;
    const tx = Math.floor(((event.clientX - rect.left) / rect.width) * roomW);
    const ty = Math.floor(((event.clientY - rect.top) / rect.height) * roomH);
    walkToTile(tx, ty);
  }

  function fit() {
    const width = stage.clientWidth || 0;
    const height = stage.clientHeight || 0;
    if (!width || !height) return;
    const scale = Math.min(width / roomW, height / roomH);
    roomEl.style.width = `${Math.floor(roomW * scale)}px`;
    roomEl.style.height = `${Math.floor(roomH * scale)}px`;
  }

  const hasWindow = typeof window !== 'undefined' && window && typeof window.addEventListener === 'function';
  const hasDocument = typeof document !== 'undefined' && document && typeof document.addEventListener === 'function';
  if (hasWindow) {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', fit);
  } else if (hasDocument) {
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
  }
  roomEl.addEventListener('click', onRoomClick);

  /* ---------- frame loop ---------- */

  function draw() {
    if (!actors) return; // the 3D scene reads the player's position itself
    paintActors(actors, room, [
      { kind: player.kind, x: player.x, y: player.y, dir: player.dir, frame: player.frame },
    ]);
  }

  function tick(now) {
    if (cancelled) return;
    const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
    lastTime = now;
    step(dt);
    if (leaving) return;
    draw();
    rafId = requestAnimationFrame(tick);
  }

  paintHud();
  draw();

  const animate = typeof requestAnimationFrame === 'function';
  if (animate) {
    // The screen is not in the document yet, so measure one frame later.
    rafId = requestAnimationFrame((now) => {
      fit();
      lastTime = now;
      tick(now);
    });
  } else {
    fit();
  }

  /* ---------- a finished chapter, revisited ---------- */

  if (countObjectsDone(chapter.id, objects) >= objects.length) {
    (async () => {
      await wait(180);
      if (cancelled) return;
      await showChapterEnd({ chapter, go });
    })();
  }

  return {
    el: screen,
    cleanup() {
      cancelled = true;
      if (rafId && animate && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
      if (hasWindow) {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('resize', fit);
      } else if (hasDocument) {
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
      }
      if (typeof roomEl.removeEventListener === 'function') roomEl.removeEventListener('click', onRoomClick);
      if (scene3d) scene3d.dispose();
      held.clear();
    },
  };
}
