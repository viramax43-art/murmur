# Sprites: from the concept sheet to the game

The art pack (`murmur_art_pack.zip`) ships one thing: a 1536×1024 concept
painting, `murmur_sprite_sheet_concept.png`. It is a concept sheet, not a game
atlas — cells differ in size, spacing is uneven, and the alpha is soft. This file
is both the pipeline that turns it into usable sprites and the record of what has
actually been swapped into the game.

```
assets/source/murmur/murmur_sprite_sheet_concept.png   the sheet, untouched
tools/png.mjs                                          PNG codec (node:zlib only)
tools/sprites.mjs                                      slicing, alignment, packing
tools/atlas-check.mjs                                  runtime loader check
assets/sprites/murmur/*.png                            24 cutouts, 1:1 pixels
assets/sprites/murmur/boy-walk.png                     4-frame strip for grid loaders
assets/sprites/murmur_atlas.png                        packed atlas, 1024x1414
assets/sprites/murmur_atlas.json                       frame rects, pivots, clips, map
src/systems/atlas.js                                   loader + drawing
```

```powershell
npm run sprites          # rebuild cutouts, atlas and report sheets
npm run sprites:verify   # fail if the committed atlas is stale or broken
npm run atlas            # exercise the loader with a stub canvas
```

## How the sheet is sliced

The pipeline is bottom-up, because the layout cannot be trusted:

1. **Alpha is the mask.** `ALPHA_CUT = 40` — everything below that is the concept's
   soft glow (140k pixels of the sheet are alpha 1–32). Pixels above it are
   snapped to `255`, so every cutout is fully opaque where it is drawn: no
   translucent body, no grey fringe on a dark stage.
2. **8-connected blobs** find the objects. The sheet yields exactly 24, one per
   object, so no flood fill from the borders and no colour keying is involved —
   white sleeves and cream curtains keep their pixels.
3. **Rows are named, not guessed.** `LAYOUT` in `tools/sprites.mjs` lists the
   names in reading order per row; if the detected count ever disagrees with the
   list the build fails loudly and prints the boxes it found instead of silently
   writing mislabelled art.
4. **Every frame is a 1:1 crop** with one transparent pixel of margin. Nothing is
   resampled, so what the artist drew is what the game shows.

`node tools/sprites.mjs --debug` prints the raw blob boxes per row — useful when
the sheet is redrawn and the layout shifts.

## The boy: one canvas, one pivot

The top row holds eight poses of the same boy. Before packing they are re-laid
onto a shared canvas:

| clip        | frames                                   | fps | notes                          |
| ----------- | ---------------------------------------- | --- | ------------------------------ |
| `boy-idle`  | `boy-idle-front`                         | 1   | standing, facing the camera    |
| `boy-turn`  | `boy-idle-front`, `boy-idle-side`        | 6   | a turn, not a loop of the mood |
| `boy-walk`  | `boy-walk-1` … `boy-walk-4`              | 8   | 125 ms per frame (guide: 100–140) |
| `boy-crouch`| `boy-crouch`                             | 1   | kneeling                       |
| `boy-happy` | `boy-happy`                              | 1   | arms up                        |

The pivot is the **middle of the lowest band of pixels** — the stance, not the
bottom row, so a pose with one foot lifted does not slide sideways. Every frame
is drawn so that this point lands on `(127, 299)` of a 254×300 canvas: same size,
same baseline, no jitter between frames, and the pivot is stored per frame in the
JSON. Walk frames are 300 px tall against a 300 px canvas, so there is no per-pose
scaling anywhere.


## The atlas

`murmur_atlas.json` is the contract between the pipeline and the game:

```json
"frames": {
  "apple": { "x": 640, "y": 32, "w": 120, "h": 129,
             "pivot": { "x": 60, "y": 129 }, "clip": null }
},
"clips": [{ "name": "boy-walk", "frames": ["boy-walk-1", "…"], "fps": 8, "loop": true }],
"map":   { "friend": "boy-idle-front", "ball": "ball", "apple": "apple" }
```

- `padding: 4` — frames never touch, so nothing bleeds at the edges.
- `pivot` — pixels from the top-left of the frame; bottom centre for props (they
  stand on their base), the stance for the boy.
- `clip` — which clip a frame belongs to, so a frame can never be orphaned.

`npm run sprites:verify` checks all of it: every frame inside the atlas, no two
frames closer than the padding, a fully transparent border on every cutout, equal
frame sizes inside a clip, every `map` target present, and the committed PNG and
JSON identical to a fresh build. It runs as part of `npm test`.

## Runtime: nearest, and nothing else

`src/systems/atlas.js` loads the JSON and the image once, then draws frames with
`drawImage(image, x, y, w, h, 0, 0, w, h)` — a crop, never a resize — with
`imageSmoothingEnabled = false` on every canvas. CSS then scales the canvas with
`image-rendering: pixelated`, exactly like the painted sprites next door.

Two details that keep the switch invisible to callers:

- **No blank frames.** `spriteCanvas()` paints the string map first, then asks
  `upgradeArt()` to repaint the same canvas when the atlas lands. A slow load
  shows the old art for a few milliseconds, a failed load keeps it for good.
- **No hard dependency.** `ART_MAP` in `src/systems/atlas.js` is the migration
  table, and a slot opts in explicitly:
  `spriteCanvas(entry.sprite, 'obj__sprite', 8, { art: true })`. Only the play
  stage passes it. Every other call site — the answer cards at 74 px, the lex
  cards at 42 px, anything still unswapped — keeps the painted map, so the same
  sprite can be a big drawing on stage and a crisp icon in the notebook. The
  headless tests never need an image, and `npm run atlas` checks both paths.


## The scale question

The painted game art is 8 art pixels per tile (`ART = 8` in `tiles.js`); the
concept art is roughly six times finer. That decides where each asset can go.
On the play stage (880×550) the cast sizes are `sm` 88 px, `md` 132 px, `lg`
209 px, `xl` 286 px, so:

| sprite   | frame            | painted box | art height | scale      | verdict    |
| -------- | ---------------- | ----------- | ---------- | ---------- | ---------- |
| `friend` | `boy-idle-front` | `lg`        | 300        | ×1.44 up   | swapped    |
| `ball`   | `ball`           | `sm` → `md` | 109        | ×1.21 up   | swapped    |
| `apple`  | `apple`          | `sm` → `md` | 129        | ×1.02      | swapped    |
| `book`   | `book`           | `sm`        | 154        | ×0.57 down | **not swapped** |

`book` stays painted on purpose: its scene box is smaller than the art, and
shrinking a 154 px painting to 88 px is exactly the resampling the pack forbids.
It needs a bigger slot in the scene first, or its own smaller drawing.

Small UI icons — the answer cards at 74 px and the lex cards at 42 px — stay
painted for the same reason: a 12×12 map reads better at icon size than a
downscaled painting.

## Figures: the cast, drawn rather than sliced

The sheet has one boy and no grown-ups, so `src/systems/figures.js` draws the rest
of the cast in code, in the same palette and with the same hard edges.

The problem it solves is a measurement. A painted map is 12×12 letters, and on the
play stage a `xl` slot is 286 px tall: one letter of `mama` is a fifth of her head.
Enlarging that map is what the module header of `sprites.js` calls a mosaic, and it
is what the cast looked like on the 3D stage.

So a figure is authored on its own grid — 44×64 cells for a grown-up, 30×24 for the
bird — and rasterized in three passes:

1. **Shape.** Spheres for heads, hands, eyes and snouts; capsules for torsos, arms,
   legs, tails and necks; plates and polygons for collars, soles, beaks and ears.
   Each one shades itself: a pixel's offset from the centre of a sphere (or from the
   axis of a capsule) is its normal, so a single key light from the upper left gives
   a highlight, a base and two shadows.
2. **Detail.** Face (sclera, iris, catchlight, nose, mouth, blush, spectacles), hair
   (a skull cap with the face cut out of it, then locks and a style), clothes
   (collar, placket, buttons, cuff, hem, folds, apron straps) and animals (muzzle,
   whiskers, stripes, tail bands, feather lines).
3. **Finish.** A contact shade on every cell with air under it, then the ink
   silhouette: one cell of `#17111f` wherever the body meets the air — the same ink
   the painted maps use.

Then the drawing is cropped to the columns it actually occupies, so the aspect a
billboard is sized from is the body's, not the authoring box's.

| body    | painted cells | figure cells | ratio |
| ------- | ------------- | ------------ | ----- |
| mama    | 88            | 1505         | 17.1× |
| papa    | 88            | 1464         | 16.6× |
| teacher | 92            | 1453         | 15.8× |
| dog     | 72            | 1016         | 14.1× |
| friend  | 90            | 1147         | 12.7× |
| baby    | 72            | 749          | 10.4× |
| cat     | 72            | 592          | 8.2×  |
| bird    | 70            | 309          | 4.4×  |

The smallest unit of a figure is one cell instead of a twelfth of a body, which is
the honest version of "sixteen times the detail": roughly sixteen times the *area*
for the grown-ups, a few times for the small animals.

```bash
npm run figures   # shapes, faces, views, walk cycles, determinism
```

`tools/figures-check.mjs` asserts all of it in Node, because the raster is data:
the detail budget above, an ink outline, at least twelve material/tone pairs, eyes
and a mouth on a person, `front`/`side`/`back` being different drawings, the four
walk frames moving, and the same call giving the same bytes twice.

Where each drawing is used:

* **the play stage** — every cast member that the atlas does not own: mama, papa,
  baby, teacher, dog. `friend` (the boy), `ball` and `apple` stay atlas frames,
  because a real drawing beats a generated one.
* **the walkable room** — every body, including the player, which is the one thing
  in the room that moves: `scene3d.js` keeps a sheet per view and walks the four
  frames while the player walks, then holds the idle drawing when they stop.
* **the 2D room fallback** — unchanged: `paintActors()` in `tiles.js` draws a ~10
  art-pixel figure, because that room is 32 device pixels per tile.

The stage and the room both stop the billboards down to `0.34` of the room's
exposure (`BILLBOARD_STOP`): the surfaces are dark, the cast is pale, and at the
surface stop a face arrives with three times the light it needs and clips to white.

## What is not wired yet

- **The room grid.** `paintActors()` still draws the 2D room's player as a ~10
  art-pixel figure on a room surface of 32 device pixels per tile. That room is the
  fallback now (`?world=2d`): the default room is the WebGL2 one, and it uses
  figures. Redrawing the floors at the new resolution would still be a full art
  pass, not a swap.
- **Collisions.** Untouched, deliberately. Walls and props are a tile grid
  (`src/content/rooms.js` → `buildGrid`), and no sprite pixel feeds physics, so
  swapping art cannot change where the player can stand.
- **The other 20 objects.** Sliced, packed and pivoted (blocks, rabbit, mug,
  plant, chair, window, curtain, rug, picture, monstera, bird, cat, chest…), but
  no scene shows them yet. Adding one to a cast is a content edit plus a line in
  `ART_MAP`.

## Pre-merge checklist

- [x] Every PNG has a transparent background with no halo — alpha above 40 only,
      and `sprites:verify` fails if a cutout has an opaque pixel on its border.
- [x] Frames of one clip are the same size — 254×300 for all eight boy frames.
- [x] The character pivot matches between frames — one canvas, one stance point.
- [x] No blur, no bilinear filtering, no mipmaps — the slicer never resamples,
      the loader sets `imageSmoothingEnabled = false`, CSS uses `pixelated`.
- [x] Collisions unchanged — the grid is data; `npm run rooms` still passes.
- [x] Scenes with swapped assets checked — the chapter 2/3 slots were measured
      against the art (table above) and composed at their real box sizes into
      `tools/out/sprites/stage-preview.png`; the atlas also serves 200 with the
      right MIME type from `npm start`.
- [x] Old assets are still referenced — nothing was deleted, `SPRITES` remains the
      fallback and the icons.

## Redrawing the sheet

Replace `assets/source/murmur/murmur_sprite_sheet_concept.png`, run
`npm run sprites`, then look at `tools/out/sprites/row1.png` … `row3.png`: they
put every frame on a checkerboard, which is where halos, clipped hair and a
drifting baseline show up first. If the row/column order changed, update `LAYOUT`
— the build refuses to write anything until the counts agree again.
