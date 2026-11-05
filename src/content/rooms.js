// The rooms you can walk around in, one per chapter.
//
// A room is an ASCII map plus a list of hotspots. Each hotspot owns a slice of
// its chapter's beats, so walking to the crib really is what plays the crib
// beats — there is no "next" button left in the game.
//
//   #  wall          .  floor          ,  rug
//   w  window        p  plant          m  doormat
//   ~  chalk         u  puddle
//
// Legend characters are paint-only; anything you can bump into is either a wall
// or a prop in `furniture` / `objects`.

export const ROOMS = {
  ch1: {
    id: 'ch1',
    title: { en: 'The nursery', ru: 'Детская' },
    hint: { en: 'Crawl. Stop at what interests you.', ru: 'Ползи. Останавливайся там, где интересно.' },
    theme: 'nursery',
    actor: 'baby',
    spawn: { x: 9.5, y: 5.5, dir: 'down' },
    legend: { ',': 'rug', w: 'window', p: 'plant', m: 'mat' },
    map: [
      '####ww############',
      '#................#',
      '#.,,,,...........#',
      '#.,,,,...........#',
      '#................#',
      '#...........p....#',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '##################',
    ],
    furniture: [
      { id: 'dresser', sprite: 'dresser', w: 2, h: 1, x: 14, y: 1 },
      { id: 'mobile', sprite: 'mobile', solid: false, x: 4, y: 6 },
    ],
    objects: [
      {
        id: 'mama',
        sprite: 'mama',
        w: 1, h: 2,
        x: 2, y: 1,
        beats: [0, 3],
        label: { en: 'Mama, leaning over', ru: 'Мама, склонилась' },
      },
      {
        id: 'papa',
        sprite: 'papa',
        w: 1, h: 2,
        x: 9, y: 1,
        beats: [4, 7],
        label: { en: 'Papa, by the door', ru: 'Папа, у двери' },
      },
      {
        id: 'bottle',
        sprite: 'bottle',
        solid: false,
        x: 15, y: 2,
        beats: [8, 12],
        label: { en: 'The bottle', ru: 'Бутылочка' },
      },
      {
        id: 'crib',
        sprite: 'crib',
        w: 3, h: 2,
        x: 2, y: 7,
        beats: [13, 16],
        label: { en: 'Your crib', ru: 'Твоя кроватка' },
      },
    ],
  },

  ch2: {
    id: 'ch2',
    title: { en: 'The yard', ru: 'Двор' },
    hint: { en: 'Walk. The door stays open behind you.', ru: 'Иди. Дверь остаётся открытой.' },
    theme: 'yard',
    actor: 'child',
    spawn: { x: 8.5, y: 6.5, dir: 'down' },
    legend: { p: 'plant', u: 'puddle' },
    map: [
      '##################',
      '#................#',
      '#.p............p.#',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '#.p............p.#',
      '##################',
    ],
    furniture: [
      { id: 'tree', sprite: 'tree', w: 2, h: 2, x: 11, y: 1 },
      { id: 'fence', sprite: 'fence', w: 4, h: 1, x: 2, y: 9 },
    ],
    objects: [
      {
        id: 'sunlight',
        sprite: 'sunlight',
        solid: false,
        w: 2, h: 2,
        x: 3, y: 2,
        beats: [0, 3],
        label: { en: 'The light on the floor', ru: 'Свет на полу' },
      },
      {
        id: 'dog',
        sprite: 'dog',
        solid: false,
        x: 7, y: 4,
        beats: [4, 7],
        label: { en: 'The dog', ru: 'Собака' },
      },
      {
        id: 'ball',
        sprite: 'ball',
        solid: false,
        x: 5, y: 7,
        beats: [8, 11],
        label: { en: 'The ball', ru: 'Мяч' },
      },
      {
        id: 'friend',
        sprite: 'friend',
        w: 1, h: 2,
        x: 13, y: 7,
        beats: [12, 16],
        label: { en: 'A child at the fence', ru: 'Ребёнок у забора' },
      },
    ],
  },

  ch3: {
    id: 'ch3',
    title: { en: 'The new room', ru: 'Новая комната' },
    hint: { en: 'Everything here belongs to somebody.', ru: 'Всё здесь чьё-то.' },
    theme: 'kindergarten',
    actor: 'child',
    spawn: { x: 2.5, y: 6.5, dir: 'right' },
    legend: { ',': 'rug', w: 'window', p: 'plant', m: 'mat' },
    map: [
      '#####w######w#####',
      '#................#',
      '#................#',
      '#................#',
      '#....,,,,,,......#',
      '#....,,,,,,......#',
      '#....,,,,,,......#',
      '#................#',
      '#................#',
      '#.p............p.#',
      '#................#',
      '##################',
    ],
    furniture: [],
    objects: [
      {
        id: 'teacher',
        sprite: 'teacher',
        w: 1, h: 2,
        x: 8, y: 1,
        beats: [0, 2],
        label: { en: 'The tall one', ru: 'Высокая' },
      },
      {
        id: 'friend',
        sprite: 'friend',
        solid: false,
        x: 9, y: 5,
        beats: [3, 5],
        label: { en: 'The one who copies you', ru: 'Та, что повторяет' },
      },
      {
        id: 'shelf',
        sprite: 'shelf',
        w: 3, h: 1,
        x: 1, y: 8,
        beats: [6, 9],
        label: { en: 'The shelf of books', ru: 'Полка с книгами' },
      },
      {
        id: 'snack',
        sprite: 'snack',
        w: 2, h: 1,
        x: 14, y: 7,
        beats: [10, 12],
        label: { en: 'The snack table', ru: 'Стол для перекуса' },
      },
      {
        id: 'signs',
        sprite: 'signs',
        w: 2, h: 1,
        x: 8, y: 9,
        beats: [13, 17],
        label: { en: 'Two cards on an easel', ru: 'Две карточки на мольберте' },
      },
    ],
  },

  ch4: {
    id: 'ch4',
    title: { en: 'The classroom', ru: 'Класс' },
    hint: { en: 'Letters on the wall point at things.', ru: 'Буквы на стене указывают на вещи.' },
    theme: 'classroom',
    actor: 'child',
    spawn: { x: 2.5, y: 8.5, dir: 'up' },
    legend: { ',': 'rug', w: 'window', p: 'plant', '~': 'chalk' },
    map: [
      '####ww############',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '#.p............p.#',
      '#................#',
      '#................#',
      '##################',
    ],
    furniture: [{ id: 'shelf', sprite: 'shelf', w: 3, h: 1, x: 12, y: 1 }],
    objects: [
      {
        id: 'board',
        sprite: 'board',
        w: 3, h: 1,
        x: 2, y: 1,
        beats: [0, 2],
        label: { en: 'The green board', ru: 'Зелёная доска' },
      },
      {
        id: 'teacher',
        sprite: 'teacher',
        w: 1, h: 2,
        x: 7, y: 3,
        beats: [3, 5],
        label: { en: 'The teacher', ru: 'Учительница' },
      },
      {
        id: 'table',
        sprite: 'table',
        w: 3, h: 2,
        x: 11, y: 6,
        beats: [6, 12],
        label: { en: 'Bread and milk', ru: 'Хлеб и молоко' },
      },
      {
        id: 'friend',
        sprite: 'friend',
        w: 1, h: 2,
        x: 14, y: 3,
        beats: [13, 17],
        label: { en: 'Your neighbour', ru: 'Сосед по парте' },
      },
    ],
  },

  ch5: {
    id: 'ch5',
    title: { en: 'The street', ru: 'Улица' },
    hint: { en: 'You are allowed to stay out a little longer.', ru: 'Тебе разрешили погулять ещё немного.' },
    theme: 'evening',
    actor: 'child',
    spawn: { x: 6.5, y: 8.5, dir: 'up' },
    legend: { u: 'puddle', p: 'plant' },
    map: [
      '##################',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '##################',
    ],
    furniture: [
      { id: 'lamp', sprite: 'lamp', x: 10, y: 3 },
      { id: 'flowerbed', sprite: 'flowers', w: 2, h: 1, x: 14, y: 8 },
    ],
    objects: [
      {
        id: 'moonlight',
        sprite: 'moonpatch',
        solid: false,
        w: 2, h: 2,
        x: 2, y: 2,
        beats: [0, 4],
        label: { en: 'Moonlight on the pavement', ru: 'Лунный свет на асфальте' },
      },
      {
        id: 'house',
        sprite: 'house',
        w: 3, h: 2,
        x: 13, y: 1,
        beats: [5, 7],
        label: { en: 'Your house', ru: 'Твой дом' },
      },
      {
        id: 'flowers',
        sprite: 'flowers',
        w: 2, h: 1,
        x: 2, y: 8,
        beats: [8, 11],
        label: { en: 'The flowerbed', ru: 'Клумба' },
      },
      {
        id: 'friend',
        sprite: 'friend',
        w: 1, h: 2,
        x: 7, y: 4,
        beats: [12, 17],
        label: { en: 'Your friend', ru: 'Твой друг' },
      },
    ],
  },
};

export function roomFor(chapterId) {
  return ROOMS[chapterId] || null;
}

/** Objects in the order the story wants them, which is the order of the beats. */
export function orderedObjects(room) {
  return room.objects.slice().sort((a, b) => a.beats[0] - b.beats[0]);
}
