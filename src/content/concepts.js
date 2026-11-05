// The concept set the prototype teaches. A concept is language-independent:
// it is the thing in the world. Each language pack supplies its own word for it.
// No glosses live here on purpose — the game never shows a translation.

export const CONCEPTS = {
  mama: { sprite: 'mama', group: 'people' },
  papa: { sprite: 'papa', group: 'people' },
  baby: { sprite: 'baby', group: 'people' },
  teacher: { sprite: 'teacher', group: 'people' },
  friend: { sprite: 'friend', group: 'people' },
  dog: { sprite: 'dog', group: 'animals' },
  cat: { sprite: 'cat', group: 'animals' },
  bird: { sprite: 'bird', group: 'animals' },
  fish: { sprite: 'fish', group: 'animals' },
  sun: { sprite: 'sun', group: 'world' },
  moon: { sprite: 'moon', group: 'world' },
  star: { sprite: 'star', group: 'world' },
  tree: { sprite: 'tree', group: 'world' },
  flower: { sprite: 'flower', group: 'world' },
  rain: { sprite: 'rain', group: 'world' },
  house: { sprite: 'house', group: 'things' },
  car: { sprite: 'car', group: 'things' },
  ball: { sprite: 'ball', group: 'things' },
  apple: { sprite: 'apple', group: 'things' },
  bread: { sprite: 'bread', group: 'things' },
  milk: { sprite: 'milk', group: 'things' },
  book: { sprite: 'book', group: 'things' },
  shoe: { sprite: 'shoe', group: 'things' },
  hat: { sprite: 'hat', group: 'things' },
  hand: { sprite: 'hand', group: 'body' },
  eye: { sprite: 'eye', group: 'body' },
  hello: { sprite: 'wave', group: 'social' },
  bye: { sprite: 'wave', group: 'social', flip: true },
  yes: { sprite: 'check', group: 'social' },
  no: { sprite: 'cross', group: 'social' },
  more: { sprite: 'plus', group: 'social' },
  thank: { sprite: 'heart', group: 'social' },
};

export const CONCEPT_KEYS = Object.keys(CONCEPTS);

export const GROUPS = ['people', 'animals', 'world', 'things', 'body', 'social'];

export function conceptSprite(key) {
  const concept = CONCEPTS[key];
  return concept ? concept.sprite : null;
}

export function isConcept(key) {
  return Object.prototype.hasOwnProperty.call(CONCEPTS, key);
}
