// Renders a scripted line: known words are solid, unknown words stay a murmur.
// Repeated exposure sharpens the blur a little, but only understanding resolves it.

import { tokenize, surfaceOf } from '../lang/index.js';
import { isKnown, wordStatus } from '../engine/state.js';
import { el } from './dom.js';

function exposure(heard) {
  if (heard >= 7) return '2';
  if (heard >= 3) return '1';
  return '0';
}

export function wordSpan(pack, key, { fresh = false } = {}) {
  const known = isKnown(key);
  const status = wordStatus(key);
  const node = el('span', {
    class: known ? 'known' : 'murmur',
    dataset: { word: key, exp: known ? undefined : exposure(status.heard) },
    text: surfaceOf(pack, key),
  });
  if (known && fresh) node.classList.add('is-fresh');
  return node;
}

export function renderLine(pack, line, { fresh = [] } = {}) {
  const fragment = document.createDocumentFragment();
  for (const token of tokenize(pack, line)) {
    if (token.type === 'word') {
      fragment.append(wordSpan(pack, token.key, { fresh: fresh.includes(token.key) }));
    } else {
      fragment.append(document.createTextNode(token.text));
    }
  }
  return fragment;
}

export function murmurWord(pack, key) {
  return el('span', { class: 'murmur', text: surfaceOf(pack, key) });
}
