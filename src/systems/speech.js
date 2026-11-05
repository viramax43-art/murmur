// Speech in, speech out.
// TTS gives the player real audio of the target language from beat one.
// ASR is optional: if the browser has no recognition, "speak" beats auto-pass.

let voices = [];
let voicesReady = false;
let currentUtterance = null;

const hasWindow = typeof window !== 'undefined';

function synth() {
  if (!hasWindow || !window.speechSynthesis) return null;
  return window.speechSynthesis;
}

function refreshVoices() {
  const s = synth();
  if (!s) return;
  const list = s.getVoices();
  if (list && list.length) {
    voices = list;
    voicesReady = true;
  }
}

if (synth()) {
  refreshVoices();
  synth().addEventListener?.('voiceschanged', refreshVoices);
}

export function ttsAvailable() {
  return Boolean(synth());
}

function scoreVoice(voice, pack) {
  const lang = (voice.lang || '').toLowerCase().replace('_', '-');
  const want = pack.voice.lang.toLowerCase();
  let score = 0;
  if (lang === want) score += 40;
  else if (lang.split('-')[0] === want.split('-')[0]) score += 20;
  else return -1;

  const name = voice.name || '';
  (pack.voice.prefer || []).forEach((hint, i) => {
    if (name.toLowerCase().includes(hint.toLowerCase())) score += 30 - i * 4;
  });
  if (voice.localService) score += 3;
  return score;
}

function pickVoice(pack) {
  if (!voicesReady) refreshVoices();
  let best = null;
  let bestScore = -1;
  for (const voice of voices) {
    const score = scoreVoice(voice, pack);
    if (score > bestScore) {
      bestScore = score;
      best = voice;
    }
  }
  return bestScore >= 0 ? best : null;
}

export function speak(text, pack, { rate = null, pitch = null } = {}) {
  const s = synth();
  if (!s) return Promise.resolve(false);
  if (!text) return Promise.resolve(false);
  const Utterance = window.SpeechSynthesisUtterance;
  if (!Utterance) return Promise.resolve(false);

  stopSpeaking();
  const u = new Utterance(text);
  u.lang = pack.voice.lang;
  u.rate = rate ?? pack.voice.rate ?? 0.9;
  u.pitch = pitch ?? pack.voice.pitch ?? 1;
  u.volume = 1;
  const voice = pickVoice(pack);
  if (voice) u.voice = voice;

  currentUtterance = u;
  return new Promise((resolve) => {
    let done = false;
    const end = (ok) => {
      if (done) return;
      done = true;
      currentUtterance = null;
      resolve(ok);
    };
    u.onend = () => end(true);
    u.onerror = () => end(false);
    // Safety net: some engines never fire onend (e.g. interrupted by a tab switch).
    setTimeout(() => end(false), 2000 + text.length * 260);
    try {
      s.speak(u);
    } catch {
      end(false);
    }
  });
}

export function stopSpeaking() {
  const s = synth();
  if (s) s.cancel();
  currentUtterance = null;
}

const Recognition = hasWindow ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export function asrAvailable() {
  return Boolean(Recognition);
}

/**
 * Listen once. Resolves with an array of alternative transcripts (best first),
 * or null when unavailable / denied / silent.
 */
export function listen(pack, { timeout = 9000 } = {}) {
  if (!Recognition) return Promise.resolve(null);
  stopSpeaking();

  return new Promise((resolve) => {
    let settled = false;
    let recognition;
    try {
      recognition = new Recognition();
    } catch {
      resolve(null);
      return;
    }

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        recognition.abort();
      } catch {
        /* noop */
      }
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), timeout);

    recognition.lang = pack.voice.asrLang || pack.voice.lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 4;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const results = [];
      const first = event.results?.[0];
      if (first) {
        for (let i = 0; i < first.length; i += 1) {
          const alt = first[i];
          if (alt?.transcript) results.push({ text: alt.transcript.trim(), confidence: alt.confidence ?? 0 });
        }
      }
      finish(results.length ? results : null);
    };
    recognition.onerror = () => finish(null);
    recognition.onend = () => finish(null);

    try {
      recognition.start();
    } catch {
      finish(null);
    }
  });
}

/** Strip punctuation, case and tone marks so ASR output can be compared loosely. */
export function normalizeSpeech(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\u3040-\u30ff\uac00-\ud7af]/gu, '')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** 0..1 similarity, used to accept near-misses from the recognizer. */
export function speechSimilarity(expected, transcript) {
  const a = normalizeSpeech(expected);
  const b = normalizeSpeech(transcript);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

export function speechMatches(expected, alternatives, { threshold = 0.68 } = {}) {
  if (!alternatives) return false;
  return alternatives.some((alt) => speechSimilarity(expected, alt.text ?? alt) >= threshold);
}
