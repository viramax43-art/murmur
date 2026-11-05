// Chapter 5 — Beyond. Evening, the street, and the first conversation that is not a lesson.

export default {
  id: 'ch5',
  title: { en: 'Evening street', ru: 'Вечерняя улица' },
  blurb: {
    en: 'The words are not separate objects any more. They point at each other.',
    ru: 'Слова больше не отдельные предметы. Они указывают друг на друга.',
  },
  bg: 'evening',
  words: ['moon', 'star', 'house', 'flower', 'bye', 'thank'],
  cast: [
    { id: 'moon', sprite: 'moon', x: 22, y: 20, size: 'md' },
    { id: 'star', sprite: 'star', x: 44, y: 16, size: 'sm' },
    { id: 'tree', sprite: 'tree', x: 12, y: 82, size: 'xl' },
    { id: 'house', sprite: 'house', x: 82, y: 84, size: 'xl' },
    { id: 'flower', sprite: 'flower', x: 62, y: 88, size: 'sm' },
    { id: 'baby', sprite: 'baby', x: 40, y: 94, size: 'md' },
    { id: 'friend', sprite: 'friend', x: 54, y: 90, size: 'lg' },
    { id: 'mama', sprite: 'mama', x: 70, y: 86, size: 'lg' },
  ],
  beats: [
    {
      type: 'narrate',
      text: {
        en: 'Evening. The street smells of rain and somebody else’s dinner. You are allowed to stay out a little longer.',
        ru: 'Вечер. Улица пахнет дождём и чьим-то ужином. Тебе разрешили погулять ещё немного.',
      },
    },
    { type: 'say', who: 'friend', focus: 'moon', line: 'moon' },
    {
      type: 'infer',
      word: 'moon',
      options: ['moon', 'sun', 'star'],
      hint: {
        en: 'A thin bright curve above the roofs. It was not there this afternoon.',
        ru: 'Тонкая яркая дуга над крышами. Днём её не было.',
      },
    },
    { type: 'say', who: 'friend', focus: 'star', line: 'star' },
    {
      type: 'infer',
      word: 'star',
      options: ['star', 'sun', 'flower'],
      hint: {
        en: 'You have to point at it before your friend can see it.',
        ru: 'Тебе приходится показать на неё, прежде чем друг её увидит.',
      },
    },
    { type: 'say', who: 'mama', focus: 'house', line: 'house' },
    {
      type: 'infer',
      word: 'house',
      options: ['house', 'tree', 'car'],
      hint: {
        en: 'One window is yellow. Inside it, someone is waiting for you.',
        ru: 'Одно окно жёлтое. Внутри кто-то ждёт тебя.',
      },
    },
    { type: 'follow', word: 'house' },
    { type: 'say', who: 'mama', focus: 'flower', line: 'flower' },
    {
      type: 'infer',
      word: 'flower',
      options: ['flower', 'tree', 'star'],
      hint: {
        en: 'Small, low to the ground, and it has been there all along.',
        ru: 'Маленькое, у самой земли, и оно было здесь всё это время.',
      },
    },
    { type: 'spell', word: 'flower' },
    { type: 'listen', word: 'flower', options: ['flower', 'tree', 'star', 'house'] },
    {
      type: 'narrate',
      text: {
        en: 'Your name is called from the yellow window. You know which word it is before you hear it.',
        ru: 'Твоё имя зовут из жёлтого окна. Ты знаешь, какое это слово, ещё до того, как услышал его.',
      },
    },
    { type: 'say', who: 'friend', focus: 'friend', line: 'bye' },
    {
      type: 'infer',
      word: 'bye',
      options: ['bye', 'hello', 'thank'],
      hint: {
        en: 'The same lifted hand as before — but now the person is walking away.',
        ru: 'Та же поднятая рука, что и раньше, — но человек уже уходит.',
      },
    },
    { type: 'say', who: 'friend', focus: 'friend', line: 'bye friend' },
    { type: 'speak', word: 'thank' },
    {
      type: 'narrate',
      text: {
        en: 'You answer without translating anything in your head. That was the whole point.',
        ru: 'Ты отвечаешь, ничего не переводя в голове. В этом и был весь смысл.',
      },
    },
  ],
};
