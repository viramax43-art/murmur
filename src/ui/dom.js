// Tiny DOM helpers. No framework, no dependencies.

export function el(tag, props = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : String(value));
  }
  append(node, kids);
  return node;
}

export function append(node, kids) {
  const list = Array.isArray(kids) ? kids.flat(4) : [kids];
  for (const kid of list) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.firstChild.remove();
  return node;
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function shuffle(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickSome(list, count, mustInclude) {
  const pool = list.filter((item) => item !== mustInclude);
  const chosen = shuffle(pool).slice(0, Math.max(0, count - (mustInclude ? 1 : 0)));
  const out = mustInclude ? [mustInclude, ...chosen] : chosen;
  return shuffle(out);
}

let toastTimer = 0;

export function toast(message, kind = '') {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.className = `toast is-on${kind ? ` is-${kind}` : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.className = 'toast';
  }, 2400);
}

/**
 * Modal sheet. Resolves with the id of the pressed action, or null when dismissed.
 */
export function openSheet({ title, body = [], actions = [{ id: 'ok', label: 'OK' }] }) {
  const host = document.getElementById('overlay');
  if (!host) return Promise.resolve(null);
  clear(host);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      host.hidden = true;
      clear(host);
      host.onclick = null;
      resolve(value);
    };

    const buttons = actions.map((action) =>
      el(
        'button',
        {
          class: `btn${action.variant === 'primary' ? ' btn--primary' : ''}`,
          type: 'button',
          onclick: () => finish(action.id),
        },
        action.label
      )
    );

    const sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, [
      el('h3', { class: 'sheet__title', text: title }),
      body,
      el('div', { class: 'sheet__actions' }, buttons),
    ]);

    host.append(sheet);
    host.hidden = false;
    host.onclick = (event) => {
      if (event.target === host) finish(null);
    };
    buttons[buttons.length - 1]?.focus();
  });
}

export function closeSheet() {
  const host = document.getElementById('overlay');
  if (!host) return;
  host.hidden = true;
  clear(host);
}

export function iconLabel(glyph, label, className = 'btn btn--small') {
  return el('button', { class: className, type: 'button' }, [
    el('span', { text: glyph, 'aria-hidden': 'true' }),
    label ? el('span', { text: label }) : null,
  ]);
}
