// Boot: load the save, wire the router, show the title.

import { loadState, state } from './engine/state.js';
import { setUiLang } from './ui/i18n.js';
import { setMuted } from './systems/audio.js';
import { mount, setRoutes, go } from './ui/router.js';
import { renderTitle } from './ui/screens/title.js';
import { renderJourney } from './ui/screens/journey.js';
import { renderNotebook } from './ui/screens/notebook.js';
import { renderExplore } from './ui/screens/explore.js';
import { renderPlay } from './ui/screens/play.js';

loadState();
setUiLang(state.uiLang || 'en');
setMuted(Boolean(state.muted));

const host = document.getElementById('app');
if (host) {
  mount(host);
  setRoutes({
    title: renderTitle,
    journey: renderJourney,
    notebook: renderNotebook,
    explore: renderExplore,
    play: renderPlay,
  });
  go('title');
}

// Scroll-into-view for tall sheets/keyboard, and a hard stop for stray drags.
document.addEventListener('gesturestart', (event) => event.preventDefault());
