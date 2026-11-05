// WebAudio blips. Everything is synthesized, so there are no asset files to load.

let ctx = null;
let master = null;
let muted = false;

function ac() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  return ctx;
}

export function unlockAudio() {
  const context = ac();
  if (context && context.state === 'suspended') context.resume();
}

export function setMuted(value) {
  muted = Boolean(value);
  if (master) master.gain.value = muted ? 0 : 0.5;
}

export function isMuted() {
  return muted;
}

/**
 * One shaped note. Used by the named effects below.
 */
function note(freq, { at = 0, dur = 0.16, type = 'square', gain = 0.22, slideTo = null } = {}) {
  const context = ac();
  if (!context || muted) return;
  const start = context.currentTime + at;
  const osc = context.createOscillator();
  const env = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(env).connect(master);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function noise({ at = 0, dur = 0.18, gain = 0.16 } = {}) {
  const context = ac();
  if (!context || muted) return;
  const start = context.currentTime + at;
  const frames = Math.floor(context.sampleRate * dur);
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    const fade = 1 - i / frames;
    data[i] = (Math.random() * 2 - 1) * fade * fade;
  }
  const src = context.createBufferSource();
  const env = context.createGain();
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1200;
  env.gain.value = gain;
  src.buffer = buffer;
  src.connect(filter).connect(env).connect(master);
  src.start(start);
}

export const sfx = {
  tap() {
    note(420, { dur: 0.07, type: 'triangle', gain: 0.14 });
  },
  correct() {
    note(523.25, { dur: 0.1, type: 'triangle', gain: 0.2 });
    note(783.99, { at: 0.09, dur: 0.16, type: 'triangle', gain: 0.18 });
  },
  wrong() {
    note(196, { dur: 0.16, type: 'sawtooth', gain: 0.13, slideTo: 130 });
  },
  learn() {
    // the "crystallize" chime
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      note(f, { at: i * 0.075, dur: 0.26, type: 'sine', gain: 0.16 });
    });
    noise({ dur: 0.3, gain: 0.05 });
  },
  blip() {
    note(660, { dur: 0.06, type: 'square', gain: 0.1 });
  },
  page() {
    noise({ dur: 0.12, gain: 0.08 });
    note(300, { dur: 0.08, type: 'triangle', gain: 0.08 });
  },
  chime() {
    [392, 523.25, 659.25].forEach((f, i) => {
      note(f, { at: i * 0.12, dur: 0.4, type: 'sine', gain: 0.14 });
    });
  },
  mic() {
    note(880, { dur: 0.08, type: 'sine', gain: 0.12 });
  },
};
