# MURMUR: The First Words

A vertical-slice prototype of a 2D pixel-art game about **acquiring** a first language
the way a child does — by sound, face and situation. Nothing is translated for you.
Speech you have not understood yet is drawn as blur (a *murmur*); a word crystallizes
only when you work out its meaning from the scene.

Seven language packs, five chapters, one shared lexicon keyed by concept — so what you
understand stays understood when you switch language.

## Run it

```bash
npm start        # http://localhost:5173
```

No dependencies, no build step: plain ES modules served by `server.mjs`.

## Check it

```bash
npm test         # everything below, in order
npm run validate # content + i18n + sprite + room audit (fails loudly on bad data)
npm run check    # imports every module under a DOM stub
npm run rooms    # paints every room and pathfinds every hotspot from the spawn
npm run smoke    # headless playthrough: title -> 5 rooms -> notebook
```

`smoke` drives the real screens through a fake DOM: it picks a language, walks into
every chapter's room, taps every hotspot until the chapter is done (answering quizzes,
spelling words, skipping speech), then reads the notebook. It exits non-zero on any
failed check.

## What is in the slice

| Area | Detail |
| --- | --- |
| Chapters | 5 rooms — nursery, yard, kindergarten, classroom, evening |
| Beats | 88 across the slice: `narrate`, `say`, `infer`, `listen`, `follow`, `spell`, `speak` |
| Concepts | 32 defined, 23 taught here; the rest are seeded for later chapters |
| Packs | ja, zh, ko, ru, en-US, en-UK, fr |
| UI languages | en, ru |

Beat types: narration, model speech, meaning inference, listening choice, "tap the
thing I named", spelling from letter chips, and optional microphone practice.

## Design rules the code enforces

* **No translation.** No string in the UI ever shows the target-language meaning.
* **One line, seven languages.** Chapter script lines are authored with concept keys
  (`"mama milk"`) and resolved per pack at render time; `tools/validate.mjs` fails if
  any two packs disagree about a line's concept sequence.
* **Blur means unknown.** Text rendering goes through `ui/line.js`, which blurs exactly
  the words whose concept is not yet known, in every pack's own script.
* **Lexicon by concept, not by word.** `engine/state.js` keys progress on
  `mama`/`milk`/… so switching target language keeps your understanding.
* **Romanization only where needed** — kana, han and hangul packs must carry one;
  Russian and Latin-script packs must not.
* **Speech is optional.** If Web Speech is missing, the game stays playable: no voice
  toast, and `speak` beats offer a skip.

## Rooms

Each chapter is a place you walk around in, Escapists-style: a top-down room on a
tile grid, a small sprite under your control, and furniture you can bump into.
There is no "next" button anywhere — **walking up to something and pressing
`E`/Space (or tapping it) is what plays that part of the chapter.** When its beats
finish you are back on the floor with one fewer thing left to understand, and the
chapter ends on its own once the room has nothing left to say.

| Input | Does |
| --- | --- |
| `W A S D` / arrows | walk (grid collisions, wall sliding) |
| `E` / `Space` / `Enter` | look at whatever you are standing next to |
| tap an object | walk there by itself, then look at it |
| tap the floor | walk to that tile |
| `▤` | notebook |

* `src/content/rooms.js` — the rooms: an ASCII map, a theme, and hotspots whose
  `beats: [first, last]` slices must cover their chapter exactly, in order
* `src/systems/world.js` — collision grid, axis-separated movement, breadth-first
  pathfinding, "what am I standing next to" (pure functions, no DOM)
* `src/systems/tiles.js` — the pixel painter: 8 art-pixels per tile, floors, walls,
  decor, furniture and the two-frame walk cycle, all drawn in code
* `src/ui/screens/explore.js` — the screen: keyboard, tap-to-walk, camera-free fit,
  hotspot markers, chapter progress
* `src/ui/chapterflow.js` — chapter boundaries: opening still → room → closing
  still → the sheet of words that settled
* `docs/rooms.md` — the room format *and* how to add a room without breaking order

Hotspots unlock in story order (the marker of the next one pulses), so a room can
never teach `book` before it has introduced the teacher.

## Cutscenes

Chapters are bookended by rendered stills — real human base meshes lit and
composited in Blender, not pixel art. The explorable game stays drawn in code;
the cutscenes are the only photographic images in the project.

```powershell
powershell -ExecutionPolicy Bypass -File tools/blender/fetch_assets.ps1   # once, ~50 MB
npm run cutscenes                                                         # 1600x900 PNGs
```

* `tools/blender/scenes.py` — one function per shot: blocking, light, camera
* `tools/blender/lib_person.py` — a person: real base mesh + cloth shell + hair + eyes
* `src/content/cutscenes.js` — which chapter is bookended by which still
* `src/ui/cutscene.js` — full-bleed player, skippable, never blocks play
* `docs/cutscenes.md` — the shot list **and** the reference images each shot needs

If a PNG is missing the cutscene is skipped silently, so art can land one shot at
a time.

## Layout

```
index.html            shell + #app
server.mjs            static file server
styles/main.css       all styling
src/main.js           boot: load save, apply prefs, mount router, go('title')
src/engine/state.js   save/load, lexicon, chapter + room-object progress
src/lang/             pack definitions + keyForToken/tokenize
src/content/          concepts, chapters 1-5, rooms, cutscene table, localization helper
src/systems/          speech (TTS + ASR), audio (sfx), sprites (pixel art), world, tiles
src/ui/               dom helpers, i18n, line rendering, router, cutscene, chapterflow, 5 screens
assets/cutscenes/     Blender renders (generated, safe to delete and rebuild)
tools/                validate.mjs, boot-check.mjs, room-check.mjs, smoke.mjs
tools/blender/        the cutscene pipeline (Python, runs inside Blender)
docs/                 room format, cutscene shot list + reference brief
```

## Known limits of the slice

* 9 concepts are defined but untaught (`baby`, `cat`, `bird`, `fish`, `tree`, `rain`,
  `car`, `shoe`, `hat`) — they exist for chapters beyond this slice.
* A room fits itself to the viewport instead of scrolling; rooms are one screen by
  design, so there is no camera follow yet.
* Mid-chapter state is "which objects are done", not which beat of a slice; leaving
  and returning restarts the object you were in the middle of.
* Speech recognition quality depends entirely on the browser; nothing leaves the device.
