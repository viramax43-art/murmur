# Cutscenes: the shots, and the references they need

The explorable game is pixel art, drawn in code. The cutscenes are not: they are
rendered in Blender from real human base meshes, staged as stills. This file is
both the shot list and the brief for the reference images.

## How the pipeline works

```
tools/blender/scenes.py      one function per shot (blocking, light, camera)
tools/blender/lib_person.py  person(): base mesh + clothing + hair + eyes
tools/blender/lib_body.py    loads the body, paints cloth, grows the hair
tools/blender/lib_common.py  materials, lights, camera, render, film grade
tools/blender/build.py       CLI: render one shot or all of them
```

Render:

```powershell
# once, ~50 MB, official Blender human base meshes
powershell -ExecutionPolicy Bypass -File tools/blender/fetch_assets.ps1

# one shot, fast preview
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b -P tools/blender/build.py -- --scene ch1-in --res 1000x563 --samples 32

# all shots, final size
npm run cutscenes
```

Output: `assets/cutscenes/<id>.png`, 1600×900, sRGB, no text baked in. The game
reads them through `src/content/cutscenes.js` and `src/ui/cutscene.js`; a missing
PNG never blocks play.

## What a reference image should be

- **One PNG per shot**, at least 1280 px on the long side.
- **Wide shots**: 16:9. **Close-ups and hands**: 3:2 or 4:5.
- Photography, film still or realistic digital painting — not pixel art, not
  heavy stylisation: we copy *light, framing and wardrobe* from it.
- No text, no watermark, no UI overlays.
- Best value per shot, in this order: ① composition (where the bodies sit in
  frame), ② light direction and colour, ③ wardrobe and hair, ④ expression.
- Keep faces away from dead centre and out of flat frontal light: the baby is
  the camera in chapters 1–2, and the whole game is about not seeing clearly yet.

Optional but very useful: **one portrait per character** (3/4 view, neutral
light) so the same mother, father, teacher and friend look consistent across
chapters.

## The shots

| id | chapter | when | what happens | cast | light | what a reference should show |
| --- | --- | --- | --- | --- | --- | --- |
| `ch1-in` | 1 Infancy | opens the chapter | Baby POV from inside the crib: two faces lean over the bars, warm lamp behind them, the room mostly dark | mother, father | one warm practical behind the heads, cold window light from the left | a crib rail crossing the foreground, two adults leaning in, hands on the rail, faces partly in shadow |
| `ch1-out` | 1 | closes it | The bottle is held to the baby's mouth; a hand fills half the frame | mother's hand, bottle | warm, close, soft | extreme close-up of adult hands holding a baby bottle, skin detail, dark background |
| `ch2-in` | 2 The open door | opens | Looking out from a dark hallway into a blazing doorway; a figure waits in the light | mother (silhouette) | strong backlight, dust in the shaft | silhouette in a bright doorway, blown-out background, dust motes |
| `ch2-out` | 2 | closes | Grass at child height: a dog runs past, a ball in the foreground | dog, ball, child's legs | late golden hour, low sun | low camera in grass, a dog mid-run, shallow focus, sun flare |
| `ch3-in` | 3 The new room | opens | A kindergarten room seen from the door: too many children, one adult kneeling | teacher, other children | flat fluorescent ceiling light, a little sickly | wide wide-angle of a playroom, adult crouching to child height, other children out of focus |
| `ch3-out` | 3 | closes | Two small children, close, one holding out a book | child, friend | soft window light from the side | two 4–5 year olds at close range, one offering an object, both mid-expression |
| `ch4-in` | 4 The green board | opens | A classroom: the teacher writes at a green chalkboard, chalk dust in the light | teacher | hard side light through a window, dust | green chalkboard, adult arm and shoulder mid-gesture, chalk dust, no face |
| `ch4-out` | 4 | closes | A school desk from above: bread, a glass of milk, two hands | child's hands, teacher's hand | warm low sunlight across the table | overhead table top with bread and a glass of milk, hands entering frame |
| `ch5-in` | 5 Evening street | opens | The street at dusk: house windows lit, a lamp, the first star | — | deep blue ambient, warm windows | suburban street at blue hour, lit windows, wet asphalt reflections |
| `ch5-out` | 5 | closes | Mother and child under a streetlamp, backlit, saying goodbye | mother, child | warm lamp behind them, cold sky | two figures under a lamp at night, backlit, small in frame, sky above |

## Rules we hold the shots to

1. **No text in the image.** All language shown in game is either the target
   word or the interface shell; a baked-in caption would break the no-translation
   rule.
2. **Faces are earned.** Chapter 1–2 shots keep faces in shadow or out of frame:
   the player literally cannot see clearly yet. From chapter 3 faces are allowed
   to be lit.
3. **One light source per shot.** Mixed flat lighting is what makes CG look like
   CG; a single motivated source plus a rim is what makes it look photographed.
4. **Wardrobe is the character.** Mother, father, teacher and friend keep the
   same palette in every shot, so a silent film still reads as "the same person".
5. **1600×900, sRGB.** The player crops with `object-fit: cover`, so keep the
   subject inside the middle 80% of the frame.

## State

`ch1-in` and `ch5-out` are staged and rendering. The other eight are listed in
`CUTSCENES` and will silently skip until a reference arrives and the shot is
built. Until then the pipeline renders what it has, and the game is playable.
