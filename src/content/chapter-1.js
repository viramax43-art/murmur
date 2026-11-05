// Chapter 1 — Infancy. The crib, two voices, and the first four words.

export default {
  id: 'ch1',
  title: { en: 'Above the crib', ru: 'Над кроваткой' },
  blurb: {
    en: 'Voices move over you in the dark. Nothing means anything yet.',
    ru: 'Голоса двигаются над тобой в темноте. Пока ничего не значит ничего.',
  },
  bg: 'nursery',
  words: ['mama', 'papa', 'milk', 'more'],
  cast: [
    { id: 'mama', sprite: 'mama', x: 24, y: 84, size: 'xl' },
    { id: 'papa', sprite: 'papa', x: 76, y: 84, size: 'xl' },
    { id: 'baby', sprite: 'baby', x: 50, y: 94, size: 'md' },
    { id: 'milk', sprite: 'milk', x: 63, y: 62, size: 'sm' },
  ],
  beats: [
    {
      type: 'narrate',
      text: {
        en: 'You are very small. The ceiling is far away. Two voices move somewhere above you.',
        ru: 'Ты совсем маленький. Потолок далеко. Два голоса двигаются где-то наверху.',
      },
    },
    { type: 'say', who: 'mama', focus: 'mama', line: 'mama' },
    {
      type: 'infer',
      word: 'mama',
      options: ['mama', 'papa', 'baby'],
      hint: {
        en: 'The voice is soft and close. A face leans over the crib.',
        ru: 'Голос мягкий и близкий. Над кроваткой склоняется лицо.',
      },
    },
    { type: 'say', who: 'mama', focus: 'mama', line: 'mama' },
    { type: 'say', who: 'papa', focus: 'papa', line: 'papa' },
    {
      type: 'infer',
      word: 'papa',
      options: ['papa', 'mama', 'baby'],
      hint: {
        en: 'A lower voice answers from the other side of the room.',
        ru: 'С другой стороны комнаты отвечает голос пониже.',
      },
    },
    { type: 'say', who: 'papa', focus: 'papa', line: 'papa' },
    { type: 'say', who: 'mama', focus: 'mama', line: 'mama papa' },
    {
      type: 'narrate',
      text: {
        en: 'Something warm is held to your mouth. It smells of morning.',
        ru: 'Что-то тёплое подносят к твоему рту. Пахнет утром.',
      },
    },
    {
      type: 'infer',
      word: 'milk',
      options: ['milk', 'apple', 'bread'],
      hint: {
        en: 'White, and it comes in a bottle.',
        ru: 'Белое, и оно в бутылочке.',
      },
    },
    { type: 'say', who: 'mama', focus: 'milk', line: 'milk' },
    { type: 'follow', word: 'milk' },
    { type: 'spell', word: 'mama' },
    { type: 'say', who: 'mama', focus: 'milk', line: 'more milk' },
    {
      type: 'infer',
      word: 'more',
      options: ['more', 'yes', 'no'],
      hint: {
        en: 'The bottle is empty. She lifts it and waits for your answer.',
        ru: 'Бутылочка пуста. Она поднимает её и ждёт твоего ответа.',
      },
    },
    { type: 'say', who: 'mama', focus: 'milk', line: 'more milk' },
    {
      type: 'narrate',
      text: {
        en: 'Four words. They are not sounds any more — they are things you can reach for.',
        ru: 'Четыре слова. Это больше не звуки — это вещи, до которых можно дотянуться.',
      },
    },
  ],
};
