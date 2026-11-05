// Chapter 3 — Kindergarten. A new room, a new adult, and the words yes / no.

export default {
  id: 'ch3',
  title: { en: 'The new room', ru: 'Новая комната' },
  blurb: {
    en: 'Someone kneels down to your height and says things you almost know.',
    ru: 'Кто-то опускается до твоего роста и говорит то, что ты почти понимаешь.',
  },
  bg: 'kindergarten',
  words: ['teacher', 'friend', 'book', 'apple', 'yes', 'no'],
  cast: [
    { id: 'teacher', sprite: 'teacher', x: 22, y: 84, size: 'xl' },
    { id: 'friend', sprite: 'friend', x: 42, y: 92, size: 'lg' },
    { id: 'baby', sprite: 'baby', x: 62, y: 94, size: 'md' },
    { id: 'book', sprite: 'book', x: 78, y: 78, size: 'sm' },
    { id: 'apple', sprite: 'apple', x: 90, y: 74, size: 'sm' },
    { id: 'yes', sprite: 'check', x: 68, y: 40, size: 'sm' },
    { id: 'no', sprite: 'cross', x: 82, y: 40, size: 'sm' },
  ],
  beats: [
    {
      type: 'narrate',
      text: {
        en: 'A room that smells of paint and other children. Somebody kneels down so their eyes are level with yours.',
        ru: 'Комната пахнет краской и другими детьми. Кто-то опускается на колени, чтобы глаза были на одном уровне с твоими.',
      },
    },
    { type: 'say', who: 'teacher', focus: 'teacher', line: 'hello hello' },
    {
      type: 'infer',
      word: 'teacher',
      options: ['teacher', 'friend', 'baby'],
      hint: {
        en: 'The tall one. She greets everyone at the door and knows all the names.',
        ru: 'Высокая. Она встречает всех у двери и знает все имена.',
      },
    },
    { type: 'say', who: 'teacher', focus: 'friend', line: 'friend' },
    {
      type: 'infer',
      word: 'friend',
      options: ['friend', 'teacher', 'baby'],
      hint: {
        en: 'A small person sits down next to you and copies everything you do.',
        ru: 'Маленький человек садится рядом и повторяет всё за тобой.',
      },
    },
    { type: 'say', who: 'friend', focus: 'friend', line: 'hello friend' },
    {
      type: 'say',
      who: 'teacher',
      focus: 'book',
      line: 'book',
    },
    {
      type: 'infer',
      word: 'book',
      options: ['book', 'apple', 'flower'],
      hint: {
        en: 'She holds up something flat, with pictures inside.',
        ru: 'Она поднимает что-то плоское, с картинками внутри.',
      },
    },
    { type: 'spell', word: 'book' },
    { type: 'listen', word: 'book', options: ['book', 'bread', 'ball', 'shoe'] },
    {
      type: 'say',
      who: 'teacher',
      focus: 'apple',
      line: 'apple',
    },
    {
      type: 'infer',
      word: 'apple',
      options: ['apple', 'ball', 'bread'],
      hint: {
        en: 'Red and round, and it is snack time.',
        ru: 'Красное и круглое, а время как раз для перекуса.',
      },
    },
    { type: 'follow', word: 'apple' },
    { type: 'say', who: 'teacher', focus: 'yes', line: 'yes' },
    { type: 'say', who: 'teacher', focus: 'no', line: 'no' },
    {
      type: 'infer',
      word: 'no',
      options: ['no', 'yes', 'more'],
      hint: {
        en: 'Two short sounds. This one stops things.',
        ru: 'Два коротких звука. Этот — останавливает.',
      },
    },
    { type: 'follow', word: 'no' },
    {
      type: 'narrate',
      text: {
        en: 'Nobody translated anything. You simply stood in the room long enough for the sounds to attach themselves.',
        ru: 'Никто ничего не переводил. Ты просто стоял в комнате достаточно долго, чтобы звуки прикрепились сами.',
      },
    },
  ],
};
