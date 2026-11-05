// Chapter 2 — Early childhood. The yard, a dog, and a word thrown across the fence.

export default {
  id: 'ch2',
  title: { en: 'The open door', ru: 'Открытая дверь' },
  blurb: {
    en: 'You can walk now. Outside, everything is loud and everything wants a name.',
    ru: 'Ты уже ходишь. Снаружи всё громкое, и всему хочется дать имя.',
  },
  bg: 'yard',
  words: ['sun', 'dog', 'ball', 'hello'],
  cast: [
    { id: 'sun', sprite: 'sun', x: 84, y: 24, size: 'md' },
    { id: 'tree', sprite: 'tree', x: 10, y: 82, size: 'xl' },
    { id: 'dog', sprite: 'dog', x: 26, y: 90, size: 'lg' },
    { id: 'baby', sprite: 'baby', x: 46, y: 94, size: 'md' },
    { id: 'ball', sprite: 'ball', x: 60, y: 88, size: 'sm' },
    { id: 'mama', sprite: 'mama', x: 72, y: 84, size: 'xl' },
    { id: 'friend', sprite: 'friend', x: 92, y: 82, size: 'lg' },
  ],
  beats: [
    {
      type: 'narrate',
      text: {
        en: 'The door stays open all afternoon. Light lies across the floor like something spilled.',
        ru: 'Дверь открыта весь день. Свет лежит на полу, как что-то разлитое.',
      },
    },
    { type: 'say', who: 'mama', focus: 'sun', line: 'sun' },
    {
      type: 'infer',
      word: 'sun',
      options: ['sun', 'moon', 'star'],
      hint: {
        en: 'It is high up, and looking at it makes you screw up your eyes.',
        ru: 'Оно высоко, и от взгляда на него ты жмуришься.',
      },
    },
    { type: 'say', who: 'mama', focus: 'sun', line: 'sun' },
    { type: 'say', who: 'mama', focus: 'dog', line: 'dog' },
    {
      type: 'infer',
      word: 'dog',
      options: ['dog', 'cat', 'bird'],
      hint: {
        en: 'Four legs, a wet nose, and it is already running at you.',
        ru: 'Четыре лапы, мокрый нос, и оно уже бежит к тебе.',
      },
    },
    { type: 'follow', word: 'dog' },
    { type: 'spell', word: 'dog' },
    { type: 'say', who: 'mama', focus: 'ball', line: 'ball' },
    {
      type: 'infer',
      word: 'ball',
      options: ['ball', 'apple', 'bread'],
      hint: {
        en: 'Round, and it rolls away as soon as you touch it.',
        ru: 'Круглое, и укатывается, стоит его коснуться.',
      },
    },
    { type: 'follow', word: 'ball' },
    { type: 'listen', word: 'ball', options: ['ball', 'apple', 'dog', 'milk'] },
    {
      type: 'narrate',
      text: {
        en: 'A child leans over the fence. She lifts one hand and moves it side to side.',
        ru: 'Через забор перегибается ребёнок. Она поднимает руку и машет ею.',
      },
    },
    { type: 'say', who: 'friend', focus: 'friend', line: 'hello' },
    {
      type: 'infer',
      word: 'hello',
      options: ['hello', 'yes', 'no'],
      hint: {
        en: 'A hand, lifted and moved side to side. It is not a question.',
        ru: 'Рука, поднятая и двигающаяся из стороны в сторону. Это не вопрос.',
      },
    },
    { type: 'say', who: 'friend', focus: 'friend', line: 'hello hello' },
    {
      type: 'narrate',
      text: {
        en: 'You lift your own hand back. The word is yours now, and so is the gesture.',
        ru: 'Ты поднимаешь свою руку в ответ. Слово теперь твоё — как и жест.',
      },
    },
  ],
};
