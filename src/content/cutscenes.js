// Which chapter is bookended by which rendered still.
//
// The art is produced by tools/blender/build.py from the scenes in
// tools/blender/scenes.py; see docs/cutscenes.md for the shot list and for the
// reference images each shot was designed from. A cutscene without a rendered
// PNG simply does not play, so the game is never blocked by missing art.

export const CUTSCENES = [
  { id: 'ch1-in', chapter: 'ch1', at: 'start', title: { en: 'Above the crib', ru: 'Над кроваткой' } },
  { id: 'ch1-out', chapter: 'ch1', at: 'end', title: { en: 'Four words', ru: 'Четыре слова' } },
  { id: 'ch2-in', chapter: 'ch2', at: 'start', title: { en: 'The open door', ru: 'Открытая дверь' } },
  { id: 'ch2-out', chapter: 'ch2', at: 'end', title: { en: 'The ball in the grass', ru: 'Мяч в траве' } },
  { id: 'ch3-in', chapter: 'ch3', at: 'start', title: { en: 'The new room', ru: 'Новая комната' } },
  { id: 'ch3-out', chapter: 'ch3', at: 'end', title: { en: 'The first friend', ru: 'Первый друг' } },
  { id: 'ch4-in', chapter: 'ch4', at: 'start', title: { en: 'The green board', ru: 'Зелёная доска' } },
  { id: 'ch4-out', chapter: 'ch4', at: 'end', title: { en: 'Bread and milk', ru: 'Хлеб и молоко' } },
  { id: 'ch5-in', chapter: 'ch5', at: 'start', title: { en: 'Evening street', ru: 'Вечерняя улица' } },
  { id: 'ch5-out', chapter: 'ch5', at: 'end', title: { en: 'Goodbye', ru: 'Прощание' } },
];

const BY_ID = new Map(CUTSCENES.map((scene) => [scene.id, scene]));

export function cutsceneById(id) {
  return BY_ID.get(id) || null;
}

/** The still that opens or closes a chapter, or null if there is none. */
export function cutsceneFor(chapterId, at = 'start') {
  return CUTSCENES.find((scene) => scene.chapter === chapterId && scene.at === at) || null;
}

/** Where the rendered PNG lives, relative to the project root. */
export function cutsceneArt(scene) {
  return `assets/cutscenes/${scene.id}.png`;
}
