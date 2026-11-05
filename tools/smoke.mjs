// Headless smoke test: a tiny DOM stand-in lets the real screens run in Node.
// It walks title -> journey -> every chapter -> notebook and reports failures.
// Run with `node tools/smoke.mjs`.

const L = (name) => String(name).toUpperCase();

class FakeNode {
  constructor(tag) {
    this.tagName = L(tag);
    this.nodeType = tag === '#text' ? 3 : 1;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this._classes = new Set();
    this._text = '';
    this._listeners = new Map();
    this.hidden = false;
    this.onclick = null;
    if (this.tagName === 'CANVAS') {
      this.width = 0;
      this.height = 0;
      this.getContext = () => ({ fillRect() {}, imageSmoothingEnabled: true, fillStyle: '' });
    }
  }

  get className() {
    return [...this._classes].join(' ');
  }

  set className(value) {
    this._classes = new Set(String(value).split(/\s+/).filter(Boolean));
  }

  get classList() {
    const set = this._classes;
    return {
      add: (...names) => names.forEach((name) => set.add(name)),
      remove: (...names) => names.forEach((name) => set.delete(name)),
      contains: (name) => set.has(name),
      toggle: (name, force) => {
        const on = force === undefined ? !set.has(name) : Boolean(force);
        if (on) set.add(name);
        else set.delete(name);
        return on;
      },
    };
  }

  get textContent() {
    if (this.nodeType === 3) return this._text;
    return this.children.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    if (this.nodeType === 3) {
      this._text = String(value);
      return;
    }
    this.children = [];
    this.append(String(value));
  }

  set innerHTML(value) {
    this.children = [];
    this.append(String(value));
  }

  get innerHTML() {
    return this.textContent;
  }

  append(...nodes) {
    for (const kid of nodes) {
      const child = typeof kid === 'string' ? textNode(kid) : kid;
      if (!child) continue;
      if (child.nodeType === 11) {
        const inner = child.children.splice(0);
        for (const item of inner) {
          item.parentNode = this;
          this.children.push(item);
        }
        continue;
      }
      child.parentNode = this;
      this.children.push(child);
    }
    return this;
  }

  appendChild(node) {
    return this.append(node);
  }

  get firstChild() {
    return this.children[0] || null;
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  remove() {
    const parent = this.parentNode;
    if (!parent) return;
    parent.children = parent.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  addEventListener(type, handler) {
    const list = this._listeners.get(type) || [];
    list.push(handler);
    this._listeners.set(type, list);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  closest() {
    return null;
  }

  focus() {}

  click() {
    const event = { type: 'click', target: this, currentTarget: this, preventDefault() {} };
    for (const handler of this._listeners.get('click') || []) handler(event);
    if (typeof this.onclick === 'function') this.onclick(event);
  }
}

function textNode(text) {
  const node = new FakeNode('#text');
  node._text = String(text);
  return node;
}

const ids = new Map();
const app = new FakeNode('div');
const overlay = new FakeNode('div');
const toastHost = new FakeNode('div');
ids.set('app', app);
ids.set('overlay', overlay);
ids.set('toast', toastHost);
overlay.hidden = true;

globalThis.document = {
  documentElement: new FakeNode('html'),
  body: new FakeNode('body'),
  createElement: (tag) => new FakeNode(tag),
  createTextNode: (text) => textNode(text),
  createDocumentFragment: () => new FakeNode('#fragment'),
  getElementById: (id) => ids.get(id) || null,
  querySelector: () => null,
  addEventListener() {},
};
/* ---------- app under test ---------- */

const { state, resetState, knownCount } = await import('../src/engine/state.js');
const { setRoutes, mount, go, current } = await import('../src/ui/router.js');
const { renderTitle } = await import('../src/ui/screens/title.js');
const { renderJourney } = await import('../src/ui/screens/journey.js');
const { renderExplore } = await import('../src/ui/screens/explore.js');
const { renderPlay } = await import('../src/ui/screens/play.js');
const { renderNotebook } = await import('../src/ui/screens/notebook.js');
const { t } = await import('../src/ui/i18n.js');
const { CHAPTERS } = await import('../src/content/index.js');
const { CONCEPT_KEYS } = await import('../src/content/concepts.js');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function allNodes(root) {
  const out = [];
  const visit = (node) => {
    out.push(node);
    for (const child of node.children) visit(child);
  };
  visit(root);
  return out;
}

const byClass = (root, className) => allNodes(root).filter((node) => node.classList.contains(className));

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? `  (${extra})` : ''}`);
  if (!ok) failures += 1;
}

/* ---------- title ---------- */

resetState();
setRoutes({ title: renderTitle, journey: renderJourney, explore: renderExplore, play: renderPlay, notebook: renderNotebook });
mount(app);
go('title');

const langCards = byClass(app, 'lang-card');
check('title offers 7 language packs', langCards.length === 7, `${langCards.length}`);

const japanese = langCards.find((card) => card.dataset.lang === 'ja');
check('japanese card is present', Boolean(japanese));
japanese.click();
check('picking a language is saved', state.langId === 'ja', String(state.langId));

const startBtn = byClass(app, 'btn--primary')[0];
check('start button exists', Boolean(startBtn));
startBtn.click();
check('start opens the journey', current().name === 'journey', current().name);

/* ---------- journey ---------- */

const chapterCards = byClass(app, 'chapter');
check('journey lists 5 chapters', chapterCards.length === 5, `${chapterCards.length}`);
check(
  'only one chapter is open',
  chapterCards.filter((card) => card.classList.contains('is-current')).length === 1,
);
check(
  'the rest are locked',
  chapterCards.filter((card) => card.classList.contains('is-locked')).length === 4,
);

chapterCards[0].click();
const openingCut = byClass(overlay, 'cutscene')[0];
check('chapter 1 opens with a cutscene still', Boolean(openingCut));
if (openingCut) openingCut.click();
await new Promise((resolve) => setTimeout(resolve, 340)); // fade out
check('chapter 1 opens its walkable room', current().name === 'explore', current().name);

/* ---------- the room ---------- */

const hotspots = byClass(app, 'hotspot');
check('the room lays out its hotspots', hotspots.length === 4, `${hotspots.length}`);
check(
  'the first hotspot is the next thing to do',
  Boolean(hotspots[0]) && hotspots[0].classList.contains('is-next') && !hotspots[0].classList.contains('is-done'),
);
hotspots[0].click();
check(
  'a hotspot plays its own slice of the chapter',
  current().name === 'play' && current().params.from === 'explore',
  `${current().name}:${current().params && current().params.objectId}`,
);

/* ---------- autoplay through every chapter ---------- */

let lastPanel = null;
let triedCards = new Set();
let doneSheets = 0;
let steps = 0;
const startedAt = Date.now();

function sheetButtons() {
  const actions = byClass(overlay, 'sheet__actions')[0];
  return actions ? actions.children.filter((node) => node.tagName === 'BUTTON') : [];
}

async function solveBeat() {
  const spots = byClass(app, 'hotspot');
  if (spots.length) {
    const next = spots.find((node) => !node.classList.contains('is-done')) || spots[0];
    next.click();
    return 'hotspot';
  }

  const panel = byClass(app, 'panel')[0];
  if (panel) {
    if (panel !== lastPanel) {
      lastPanel = panel;
      triedCards = new Set();
    }

    const chips = byClass(panel, 'chip');
    if (chips.length) {
      const surface = Array.from(byClass(panel, 'panel__title')[0].textContent);
      for (const character of surface) {
        const chip = chips.find((node) => node.dataset.ch === character && !node.classList.contains('is-used'));
        if (!chip) return 'spell:stuck';
        chip.click();
        await sleep(4);
      }
      return 'spell';
    }

    const cards = byClass(panel, 'card');
    if (cards.length) {
      if (cards.some((card) => card.classList.contains('is-correct'))) return 'quiz:won';
      const card = cards.find((node) => !triedCards.has(node) && !node.classList.contains('is-dim'));
      if (card) {
        triedCards.add(card);
        card.click();
        return 'quiz';
      }
      return 'quiz:wait';
    }

    if (byClass(panel, 'mic').length) {
      const foot = byClass(panel, 'panel__foot')[0];
      const skip = foot.children.find((node) => node.tagName === 'BUTTON' && !node.textContent.startsWith('▸'));
      if (skip) skip.click();
      return 'speak';
    }
  }

  const dialog = byClass(app, 'dialog')[0];
  if (dialog) {
    const next = dialog.children
      .filter((node) => node.tagName === 'DIV')
      .flatMap((node) => node.children)
      .find((node) => node.tagName === 'BUTTON' && node.textContent === t('next'));
    if (next) next.click();
    else dialog.click();
    return 'dialog';
  }

  const ask = byClass(app, 'ask')[0];
  if (ask) {
    const objects = byClass(app, 'obj');
    const plain = objects.find((node) => !node.classList.contains('is-good') && !node.classList.contains('is-wrong'));
    if (plain) plain.click();
    return 'follow';
  }

  return 'wait';
}

while (steps < 3000 && Date.now() - startedAt < 180000) {
  steps += 1;

  if (!overlay.hidden) {
    if (byClass(overlay, 'sheet__title').some((node) => node.textContent === t('chapterDone'))) doneSheets += 1;
    const cut = byClass(overlay, 'cutscene')[0];
    if (cut) {
      cut.click();
      await sleep(300);
      continue;
    }
    const buttons = sheetButtons();
    if (buttons.length) buttons[0].click();
    await sleep(30);
    continue;
  }

  if (byClass(app, 'chapter').length) {
    const open = byClass(app, 'chapter').find((card) => card.classList.contains('is-current'));
    if (!open) break;
    open.click();
    await sleep(30);
    continue;
  }

  await solveBeat();
  await sleep(24);
}

check('all five chapters were completed', doneSheets >= CHAPTERS.length, `${doneSheets}/${CHAPTERS.length}`);
check('the journey is reachable again', current().name !== 'play', current().name);
check('words were learned', knownCount(CONCEPT_KEYS) >= 20, `${knownCount(CONCEPT_KEYS)}`);

/* ---------- notebook ---------- */

go('notebook');
const cells = byClass(app, 'lex');
const unknownCells = cells.filter((cell) => cell.classList.contains('is-unknown'));
check('notebook shows every concept', cells.length === CONCEPT_KEYS.length, `${cells.length}`);
check('some words stay unknown', unknownCells.length > 0, `${unknownCells.length}`);
check(
  'known cells show their word',
  cells
    .filter((cell) => !cell.classList.contains('is-unknown'))
    .every((cell) => byClass(cell, 'lex__word')[0].textContent !== '· · ·'),
);

/* ---------- report ---------- */

console.log('');
if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log(`all checks passed after ${steps} steps in ${Math.round((Date.now() - startedAt) / 1000)}s`);

