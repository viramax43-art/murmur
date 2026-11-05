// Chapter 4 — School. The board, the body, and the first time you speak on purpose.

export default {
  id: 'ch4',
  title: { en: 'The green board', ru: 'Зелёная доска' },
  blurb: {
    en: 'Letters on the wall start pointing at things. Your mouth starts working on its own.',
    ru: 'Буквы на стене начинают указывать на вещи. Рот начинает работать сам.',
  },
  bg: 'classroom',
  words: ['hand', 'eye', 'bread', 'milk', 'more', 'thank'],
  cast: [
    { id: 'teacher', sprite: 'teacher', x: 20, y: 84, size: 'xl' },
    { id: 'friend', sprite: 'friend', x: 40, y: 92, size: 'lg' },
    { id: 'baby', sprite: 'baby', x: 54, y: 94, size: 'md' },
    { id: 'hand', sprite: 'hand', x: 68, y: 34, size: 'sm' },
    { id: 'eye', sprite: 'eye', x: 84, y: 34, size: 'sm' },
    { id: 'bread', sprite: 'bread', x: 76, y: 80, size: 'sm' },
    { id: 'milk', sprite: 'milk', x: 90, y: 80, size: 'sm' },
  ],
  beats: [
    {
      type: 'narrate',
      text: {
        en: 'Somebody has written your name on a card. You recognise its shape before you can read it.',
        ru: 'Кто-то написал твоё имя на карточке. Ты узнаёшь её форму раньше, чем умеешь читать.',
      },
    },
    { type: 'say', who: 'teacher', focus: 'hand', line: 'hand' },
    {
      type: 'infer',
      word: 'hand',
      options: ['hand', 'eye', 'book'],
      hint: {
        en: 'She holds it up, open, and waits for you to do the same.',
        ru: 'Она поднимает это, раскрытое, и ждёт, чтобы ты сделал так же.',
      },
    },
    { type: 'say', who: 'teacher', focus: 'eye', line: 'eye' },
    {
      type: 'infer',
      word: 'eye',
      options: ['eye', 'hand', 'apple'],
      hint: {
        en: 'She points at her own face. You close yours and everything goes dark.',
        ru: 'Она показывает на своё лицо. Ты закрываешь своё — и всё становится тёмным.',
      },
    },
    { type: 'follow', word: 'eye' },
    { type: 'say', who: 'friend', focus: 'milk', line: 'milk' },
    { type: 'listen', word: 'milk', options: ['milk', 'bread', 'ball', 'shoe'] },
    { type: 'say', who: 'friend', focus: 'bread', line: 'bread' },
    {
      type: 'infer',
      word: 'bread',
      options: ['bread', 'apple', 'book'],
      hint: {
        en: 'Soft, sliced, and it leaves crumbs on the table.',
        ru: 'Мягкое, нарезанное, и оставляет крошки на столе.',
      },
    },
    { type: 'spell', word: 'bread' },
    { type: 'say', who: 'friend', focus: 'bread', line: 'more bread' },
    {
      type: 'infer',
      word: 'more',
      options: ['more', 'yes', 'no'],
      hint: {
        en: 'One short word, and the plate fills again.',
        ru: 'Одно короткое слово — и тарелка снова наполняется.',
      },
    },
    { type: 'say', who: 'teacher', focus: 'friend', line: 'thank' },
    {
      type: 'infer',
      word: 'thank',
      options: ['thank', 'hello', 'no'],
      hint: {
        en: 'It is what you say when the plate comes back to you.',
        ru: 'Так говорят, когда тарелка возвращается к тебе.',
      },
    },
    { type: 'say', who: 'friend', focus: 'friend', line: 'thank' },
    { type: 'speak', word: 'thank' },
    {
      type: 'narrate',
      text: {
        en: 'The word leaves your mouth before you decide to say it. That is how it starts.',
        ru: 'Слово выходит изо рта раньше, чем ты решаешь его сказать. Так всё и начинается.',
      },
    },
  ],
};
