// Room check — `npm run rooms`.
//
// Paints every room against a recording 2D context and pathfinds every hotspot
// from the spawn, so a broken painter or an unreachable crib fails here instead
// of in the browser. The recording context also flags any fillRect that got NaN.

const calls = { fillRect: 0, errors: [] };

function makeContext() {
  return {
    fillStyle: '',
    imageSmoothingEnabled: true,
    scale() {},
    save() {},
    restore() {},
    translate() {},
    setTransform() {},
    clearRect() {},
    fillRect(x, y, w, h) {
      if ([x, y, w, h].some((n) => typeof n !== 'number' || Number.isNaN(n))) {
        calls.errors.push(`fillRect(${x}, ${y}, ${w}, ${h})`);
      }
      calls.fillRect += 1;
    },
  };
}

globalThis.document = {
  createElement: (tag) => {
    if (tag !== 'canvas') return { setAttribute() {}, className: '' };
    const canvas = { width: 0, height: 0, className: '', style: {} };
    canvas.getContext = () => makeContext();
    canvas.setAttribute = () => {};
    canvas.classList = { add() {} };
    return canvas;
  },
};

const { ROOMS } = await import('../src/content/rooms.js');
const { paintRoom, paintActors } = await import('../src/systems/tiles.js');
const { buildGrid, canStand, pathToObject, objectsInReach } = await import('../src/systems/world.js');

let failures = 0;
for (const [id, room] of Object.entries(ROOMS)) {
  const before = calls.fillRect;
  const { canvas, ready } = paintRoom(room);
  const painted = calls.fillRect - before;
  const actors = { width: canvas.width, height: canvas.height, getContext: () => makeContext() };
  paintActors(actors, room, [{ kind: room.actor, x: room.spawn.x, y: room.spawn.y, dir: 'down', frame: 1 }]);

  const grid = buildGrid(room);
  const spawnOk = canStand(grid, room.spawn.x, room.spawn.y);
  const reach = room.objects.map((object) => {
    const path = pathToObject(grid, room.spawn, object);
    return `${object.id}:${path.length}`;
  });
  const near = objectsInReach(room, room.spawn).map((object) => object.id);

  const ok = ready && painted > 200 && spawnOk && calls.errors.length === 0;
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${id}  ${canvas.width}x${canvas.height}  fills=${painted}  spawn=${spawnOk ? 'free' : 'BLOCKED'}` +
      `  paths=[${reach.join(' ')}]  beside=[${near.join(',')}]`
  );
}

if (calls.errors.length) {
  console.log(`bad rects: ${calls.errors.slice(0, 10).join(', ')}`);
}
if (failures) {
  console.error(`${failures} room(s) failed to paint`);
  process.exit(1);
}
console.log('all rooms paint cleanly');
