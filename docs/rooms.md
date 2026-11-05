# Rooms — the walkable chapters

Each chapter of MURMUR is one room you walk around in. The room is data, the
walking is a few pure functions, and the chapter's beats are cut into slices that
belong to furniture.

```
src/content/rooms.js     the rooms (data)          ← edit this to author a level
src/systems/world.js     grid, collision, pathfinding (pure, no DOM)
src/systems/tiles.js     the pixel painter
src/ui/screens/explore.js the screen
src/ui/chapterflow.js    opening still → room → closing still → chapter sheet
```

## Anatomy of a room

```js
ch1: {
  id: 'ch1',
  title: { en: 'The nursery', ru: 'Детская' },   // HUD, localized like everything else
  hint:  { en: 'Crawl. Stop at what interests you.', ru: '…' },
  theme: 'nursery',        // palette in src/systems/tiles.js → THEMES
  actor: 'baby',           // 'baby' crawls, 'child' walks; speeds in explore.js
  spawn: { x: 9.5, y: 5.5, dir: 'down' },
  legend: { ',': 'rug', w: 'window', p: 'plant' },  // map char → DECOR painter
  map: [                   // one char per tile, every row the same width
    '####ww############',
    '#................#',
    …
  ],
  furniture: [],           // props with no beats: solid, painted, not interactive
  objects: [ … ],          // the hotspots, in story order
}
```

`#` is wall, `.` is floor, and any other character must appear in `legend`.
Furniture and hotspots are boxes: `x`, `y`, `w`, `h`, `sprite`, and `solid: false`
for floor things you can stand on (a ball, a pool of light).

## Beat slices

A hotspot owns a contiguous slice of its chapter's beats:

```js
{ id: 'crib', sprite: 'crib', w: 3, h: 2, x: 2, y: 7, beats: [13, 16],
  label: { en: 'Your crib', ru: 'Твоя кроватка' } }
```

The slices of a room must cover `0 … chapter.beats.length - 1` **exactly, in
order** — no gaps, no overlaps, no reordering. `npm run validate` fails otherwise:

```
room "ch1" object "crib": starts at beat 13, expected 11 so the room covers the chapter in order
room "ch3": objects cover 16 of 18 beats — the chapter would be cut short
```

That single rule is what keeps the storytelling intact: you can walk anywhere, but
you cannot learn a word before the room has set it up. Hotspots unlock in order at
runtime too (`is-locked`, with a toast if you try to skip ahead).

## Walking

* `src/systems/world.js` builds a `Uint8Array` collision grid once per room from the
  walls plus every solid box, then moves the body **one axis at a time** so it slides
  along walls instead of sticking.
* Tapping an object runs a breadth-first search over tile centres and follows the
  waypoints; the same BFS backs the validator's "can the player reach this?" check.
* "Standing next to" is grid adjacency, including diagonals — no pixel-perfect
  hitboxes to explain to a player.
* The room is taught to fit the viewport by `fit()` in `explore.js` (no scrolling,
  no camera): rooms are one screen by design.

## Painting

`src/systems/tiles.js` draws on an **8 art-pixel grid per tile**. The canvas is
rendered at 4 device pixels per art pixel and scaled by CSS with
`image-rendering: pixelated`, so:

* the whole room is one texture, not 216 DOM nodes;
* the walk cycle costs a handful of `fillRect`s per frame on a second canvas;
* new props are code, not image files — `PROPS` next to `SPRITES`, same idea.

Adding a prop: write a painter in `PROPS` (`w`, `h`, `solid`, `paint(ctx, theme)`),
then reference it from `objects` or `furniture` with `sprite: 'name'`.

## Adding a room

1. Add an entry to `ROOMS` in `src/content/rooms.js` keyed by the chapter id.
2. Slice the chapter's beats across hotspots, in order, covering all of them.
3. `npm run validate` — checks the map is rectangular, the spawn is free, every
   hotspot is reachable, and the slices cover the chapter.
4. `npm run rooms` — paints every room and prints path lengths from the spawn.
5. `npm run smoke` — walks the whole game headlessly, hotspot by hotspot.

## Progress

`state.chapters[id].objects` records which hotspots are done. Walking into a
chapter from the journey map keeps that progress; replaying a finished chapter
(choosing it again on the map) clears it and starts from the first object. The
chapter sheet appears as soon as the last hotspot's beats finish — the room itself
decides when a chapter is over, not a script counter.
