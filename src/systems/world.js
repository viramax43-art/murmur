// The explorable room as a grid. Pure functions only: no DOM, no state, no time.
// A room is data (src/content/rooms.js) and this module is the only thing that
// knows what "solid" means, so walking and pathfinding can never disagree.

export const PLAYER_RADIUS = 0.26;

/** Build the collision grid once per room: walls plus solid props. */
export function buildGrid(room) {
  const h = room.map.length;
  const w = room.map[0].length;
  const solid = new Uint8Array(w * h);

  const set = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    solid[y * w + x] = 1;
  };

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (room.map[y][x] === '#') set(x, y);
    }
  }
  for (const object of [...(room.furniture || []), ...room.objects]) {
    if (object.solid === false) continue;
    for (let y = object.y; y < object.y + (object.h || 1); y += 1) {
      for (let x = object.x; x < object.x + (object.w || 1); x += 1) set(x, y);
    }
  }

  return { w, h, solid };
}

export function tileSolid(grid, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= grid.w || ty >= grid.h) return true;
  return grid.solid[ty * grid.w + tx] === 1;
}

/** Is the player box (a small square) free at this floating-point position? */
export function canStand(grid, x, y, radius = PLAYER_RADIUS) {
  const x0 = Math.floor(x - radius);
  const x1 = Math.floor(x + radius);
  const y0 = Math.floor(y - radius);
  const y1 = Math.floor(y + radius);
  for (let ty = y0; ty <= y1; ty += 1) {
    for (let tx = x0; tx <= x1; tx += 1) {
      if (tileSolid(grid, tx, ty)) return false;
    }
  }
  return true;
}

/**
 * Axis-separated movement, so a body sliding along a wall keeps sliding
 * instead of stopping dead. Returns a fresh position.
 */
export function moveEntity(grid, pos, dx, dy, radius = PLAYER_RADIUS) {
  let { x, y } = pos;
  if (dx) {
    const next = x + dx;
    if (canStand(grid, next, y, radius)) x = next;
  }
  if (dy) {
    const next = y + dy;
    if (canStand(grid, x, next, radius)) y = next;
  }
  return { x, y };
}

export function tileOf(pos) {
  return { tx: Math.floor(pos.x), ty: Math.floor(pos.y) };
}

/** Every tile a hotspot covers. */
export function footprint(object) {
  const tiles = [];
  const w = object.w || 1;
  const h = object.h || 1;
  for (let y = object.y; y < object.y + h; y += 1) {
    for (let x = object.x; x < object.x + w; x += 1) tiles.push({ tx: x, ty: y });
  }
  return tiles;
}

/** Walkable tiles touching a hotspot — where the player has to stand. */
export function approachTiles(grid, object) {
  const seen = new Set();
  const out = [];
  for (const { tx, ty } of footprint(object)) {
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const x = tx + dx;
      const y = ty + dy;
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (tileSolid(grid, x, y)) continue;
      out.push({ tx: x, ty: y });
    }
  }
  return out;
}

function centre(tile) {
  return { x: tile.tx + 0.5, y: tile.ty + 0.5 };
}

function nearestWalkableTile(grid, tx, ty) {
  if (!tileSolid(grid, tx, ty)) return { tx, ty };
  for (let ring = 1; ring <= 4; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        if (!tileSolid(grid, tx + dx, ty + dy)) return { tx: tx + dx, ty: ty + dy };
      }
    }
  }
  return null;
}

/**
 * Breadth-first walk over tile centres. Rooms are tiny (a few hundred tiles),
 * so the queue is cheap and the result is always the shortest path.
 */
export function findPath(grid, from, to) {
  const start = nearestWalkableTile(grid, Math.floor(from.x), Math.floor(from.y));
  const goal = nearestWalkableTile(grid, to.tx, to.ty);
  if (!start || !goal) return [];

  const key = (tile) => tile.ty * grid.w + tile.tx;
  const cameFrom = new Map();
  const queue = [start];
  const seen = new Set([key(start)]);
  let found = false;

  while (queue.length) {
    const current = queue.shift();
    if (current.tx === goal.tx && current.ty === goal.ty) {
      found = true;
      break;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const tx = current.tx + dx;
      const ty = current.ty + dy;
      if (tileSolid(grid, tx, ty)) continue;
      const next = { tx, ty };
      const id = key(next);
      if (seen.has(id)) continue;
      seen.add(id);
      cameFrom.set(id, current);
      queue.push(next);
    }
  }
  if (!found) return [];

  const path = [];
  let cursor = goal;
  while (cursor) {
    path.push(centre(cursor));
    cursor = cameFrom.get(key(cursor));
  }
  return path.reverse().slice(1);
}

/** The walkable tile next to a hotspot that is cheapest to reach. */
export function pathToObject(grid, from, object) {
  let best = null;
  for (const tile of approachTiles(grid, object)) {
    const path = findPath(grid, from, tile);
    if (!best || path.length < best.length) best = path;
  }
  return best || [];
}

/**
 * Hotspots the player is standing next to, nearest first. "Next to" is tile
 * adjacency (including diagonals), which is what the eye expects on a grid.
 */
export function objectsInReach(room, pos) {
  const here = { tx: Math.floor(pos.x), ty: Math.floor(pos.y) };
  const out = [];
  for (const object of room.objects) {
    let beside = false;
    let distance = Infinity;
    for (const tile of footprint(object)) {
      const steps = Math.max(Math.abs(tile.tx - here.tx), Math.abs(tile.ty - here.ty));
      const straight = Math.hypot(tile.tx + 0.5 - pos.x, tile.ty + 0.5 - pos.y);
      if (straight < distance) distance = straight;
      if (steps <= 1) beside = true;
    }
    if (beside) out.push({ object, distance });
  }
  out.sort((a, b) => a.distance - b.distance);
  return out.map((entry) => entry.object);
}

/** Which sprite row a walker should use. */
export function facingFor(dx, dy, fallback = 'down') {
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return fallback;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
