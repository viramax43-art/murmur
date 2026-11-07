// Interface strings. The game itself never translates the target language —
// these strings are only the shell around it.

const en = {
  logoTag: "You don't learn a language. You grow into it.",
  chooseLang: 'Language you will grow into',
  uiLangLabel: 'Interface',
  start: 'Begin',
  continueGame: 'Continue',
  newGame: 'Start over',
  howTo: 'How it works',
  about: 'About',
  aboutTitle: 'MURMUR: The First Words',
  aboutBody:
    'A small prototype about acquiring a first language the way a child does: by sound, face and situation. Nothing is translated for you. Words start as blur and become clear only when you understand them.',
  howToTitle: 'How to play',
  howToBody: [
    'Speech you do not understand yet is drawn as blur — a murmur. You still hear the real sound.',
    'A word crystallizes when you work out its meaning from the scene. From then on it is written clearly.',
    'There is no translate button and no word list to memorise. Context is the whole method.',
    'Microphone practice is optional. Audio is handled by your browser and never leaves the device.',
  ],
  reset: 'Erase progress',
  resetTitle: 'Erase progress?',
  resetBody: 'Every crystallized word and every unlocked chapter will be forgotten.',
  cancel: 'Cancel',
  confirm: 'Erase',
  journeyTitle: 'Your first words',
  journeySub: 'Each chapter is a room you grow up in.',
  locked: 'Locked',
  current: 'Now',
  done: 'Done',
  play: 'Play',
  again: 'Again',
  notebookBtn: 'Notebook',
  notebookTitle: 'Your notebook',
  notebookSub: 'Words that have crystallized inside you.',
  knownLabel: 'Words',
  heardLabel: 'Heard',
  chaptersLabel: 'Rooms',
  unknownTap: "You haven't understood this one yet.",
  tapToHear: 'Tap to hear it',
  chapterLabel: 'Chapter',
  chapterDone: 'Chapter complete',
  chapterDoneBody: 'These words settled into you:',
  newWord: 'New word',
  backToJourney: 'Back to the road',
  nextChapter: 'Next chapter',
  back: 'Back',
  listen: 'Listen',
  next: 'Next',
  tapNext: 'Tap to continue',
  whatIsSaid: 'What is it?',
  whichWord: 'Listen, then choose',
  tapThe: 'Tap: {word}',
  spellIt: 'Build the word',
  spellHint: 'Tap a letter, tap a slot to take it back',
  sayIt: "Now you say it",
  micTap: 'Tap the mic and speak',
  listening: 'Listening…',
  skip: 'Skip',
  micDenied: 'No microphone — skipped.',
  heard: 'I heard: {text}',
  correct: 'Yes!',
  wrong: 'Not quite',
  tryAgain: 'Try again',
  wrongWord: 'That is {word}.',
  noVoice: 'This browser has no {lang} voice. Words stay silent, but the game still works.',
  sound: 'Sound',
  muted: 'Muted',
  unmuted: 'Unmuted',
  you: 'you',
  narrator: 'narrator',
  wordsOf: '{known} / {total} words',
  progressOf: '{done} / {total}',
  notYet: 'not yet',
  heardTimes: 'heard {n}×',
  emptyNotebook: 'Nothing yet. Go and live a chapter.',
  tapWordHint: 'Tap a word to hear it again.',
  walkHint: 'WASD to walk · mouse or drag to look · double-click for free look',
  look: 'Look',
  notNow: 'Not this one yet.',
};

const ru = {
  logoTag: 'Ты не учишь язык. Ты в него вырастаешь.',
  chooseLang: 'Язык, в который ты вырастешь',
  uiLangLabel: 'Интерфейс',
  start: 'Начать',
  continueGame: 'Продолжить',
  newGame: 'Начать заново',
  howTo: 'Как это работает',
  about: 'Об игре',
  aboutTitle: 'MURMUR: Первые слова',
  aboutBody:
    'Небольшой прототип о том, как ребёнок осваивает первый язык: через звук, лицо и ситуацию. За тебя ничего не переводят. Слова сначала размыты и становятся ясными только когда ты их понял.',
  howToTitle: 'Как играть',
  howToBody: [
    'Речь, которую ты ещё не понимаешь, показана размыто — как бормотание. Но звук ты слышишь настоящий.',
    'Слово «кристаллизуется», когда ты угадываешь его смысл по сцене. Дальше оно пишется чётко.',
    'Кнопки «перевести» нет и списка слов для зубрёжки тоже. Весь метод — контекст.',
    'Практика с микрофоном необязательна. Звук обрабатывает браузер, он никуда не отправляется.',
  ],
  reset: 'Стереть прогресс',
  resetTitle: 'Стереть прогресс?',
  resetBody: 'Все понятые слова и открытые главы будут забыты.',
  cancel: 'Отмена',
  confirm: 'Стереть',
  journeyTitle: 'Твои первые слова',
  journeySub: 'Каждая глава — комната, в которой ты растёшь.',
  locked: 'Закрыто',
  current: 'Сейчас',
  done: 'Готово',
  play: 'Играть',
  again: 'Ещё раз',
  notebookBtn: 'Блокнот',
  notebookTitle: 'Твой блокнот',
  notebookSub: 'Слова, которые уже сложились внутри.',
  knownLabel: 'Слова',
  heardLabel: 'Услышано',
  chaptersLabel: 'Комнаты',
  unknownTap: 'Это слово ты пока не понял.',
  tapToHear: 'Нажми, чтобы услышать',
  chapterLabel: 'Глава',
  chapterDone: 'Глава пройдена',
  chapterDoneBody: 'Эти слова теперь твои:',
  newWord: 'Новое слово',
  backToJourney: 'Назад в путь',
  nextChapter: 'Следующая глава',
  back: 'Назад',
  listen: 'Слушать',
  next: 'Дальше',
  tapNext: 'Нажми, чтобы продолжить',
  whatIsSaid: 'Что это?',
  whichWord: 'Послушай и выбери',
  tapThe: 'Нажми: {word}',
  spellIt: 'Собери слово',
  spellHint: 'Нажми на букву, нажми на слот, чтобы вернуть',
  sayIt: 'Теперь скажи сам',
  micTap: 'Нажми на микрофон и говори',
  listening: 'Слушаю…',
  skip: 'Пропустить',
  micDenied: 'Микрофона нет — пропускаем.',
  heard: 'Я услышал: {text}',
  correct: 'Да!',
  wrong: 'Не совсем',
  tryAgain: 'Попробуй ещё',
  wrongWord: 'Это {word}.',
  noVoice: 'В этом браузере нет голоса {lang}. Слова будут беззвучными, но игра работает.',
  sound: 'Звук',
  muted: 'Без звука',
  unmuted: 'Со звуком',
  you: 'ты',
  narrator: 'рассказчик',
  wordsOf: '{known} / {total} слов',
  progressOf: '{done} / {total}',
  notYet: 'ещё нет',
  heardTimes: 'слышал {n} раз',
  emptyNotebook: 'Пока пусто. Проживи хотя бы одну главу.',
  tapWordHint: 'Нажми на слово, чтобы услышать его снова.',
  walkHint: 'WASD — идти · мышь или свайп — смотреть · двойной клик — свободный обзор',
  look: 'Посмотреть',
  notNow: 'Не это сейчас.',
};

const STRINGS = { en, ru };

export const UI_LANGS = [
  { id: 'en', name: 'English', short: 'EN' },
  { id: 'ru', name: 'Русский', short: 'RU' },
];

let current = 'en';

export function setUiLang(id) {
  current = Object.prototype.hasOwnProperty.call(STRINGS, id) ? id : 'en';
  if (typeof document !== 'undefined') document.documentElement.lang = current;
  return current;
}

export function getUiLang() {
  return current;
}

/**
 * Look up a string and interpolate {placeholders}.
 */
export function t(key, vars = {}) {
  const table = STRINGS[current] || STRINGS.en;
  const raw = table[key] ?? STRINGS.en[key] ?? key;
  if (Array.isArray(raw)) return raw;
  return String(raw).replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}
