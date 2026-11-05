// Screen router. Screens are registered by main.js and returned as
// { el, cleanup? } so switching screens can tear down timers and speech.

import { clear } from './dom.js';
import { stopSpeaking } from '../systems/speech.js';

const ROUTES = new Map();
let host = null;
let teardown = null;
let currentName = null;
let currentParams = null;

export function setRoutes(map) {
  ROUTES.clear();
  for (const [name, render] of Object.entries(map)) ROUTES.set(name, render);
}

export function mount(node) {
  host = node;
}

export function go(name, params = {}) {
  if (!host) return;
  const render = ROUTES.get(name) || ROUTES.get('title');
  if (!render) return;

  if (teardown) {
    try {
      teardown();
    } catch {
      /* a screen teardown must never block navigation */
    }
    teardown = null;
  }
  stopSpeaking();
  clear(host);

  currentName = name;
  currentParams = params;
  const result = render({ go: go, params, state: () => ({ name: currentName, params: currentParams }) });
  const el = result && result.el ? result.el : result;
  teardown = (result && result.cleanup) || null;
  if (el) host.append(el);
}

export function refresh() {
  go(currentName || 'title', currentParams || {});
}

export function current() {
  return { name: currentName, params: currentParams };
}
