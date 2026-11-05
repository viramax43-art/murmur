// Pixel-art painter for the explorable rooms.
//
// Everything is authored on an 8-art-pixel grid (one art pixel = one tile cell
// of 8), rendered once into a small canvas and then scaled up by CSS with
// `image-rendering: pixelated`. That keeps edges hard, sprites cheap and the
// whole room a single texture instead of hundreds of DOM nodes.

export const ART = 8;

export const THEMES = {
  nursery: {
    floor: '#4a3550',
    floorB: '#523b58',
    fleck: '#40304a',
    seam: '#3a2d44',
    wall: '#2b2346',
    wallTop: '#382c58',
    wallDark: '#1b1630',
    ink: '#120e1f',
    rug: '#7a3f5c',
    rugB: '#8f4a68',
    accent: '#ffcf6b',
    glow: 'rgba(255, 207, 107, 0.22)',
  },
  yard: {
    floor: '#4f7f4d',
    floorB: '#548a52',
    fleck: '#436b43',
    seam: '#456f45',
    wall: '#3a5f3c',
    wallTop: '#4a7448',
    wallDark: '#2a452c',
    ink: '#1a2a1c',
    rug: '#6f9a5f',
    rugB: '#7fae6b',
    accent: '#ffefb0',
    glow: 'rgba(255, 240, 200, 0.26)',
  },
  kindergarten: {
    floor: '#8a6157',
    floorB: '#7d574e',
    fleck: '#6f4d45',
    seam: '#6a4a42',
    wall: '#45305a',
    wallTop: '#57406e',
    wallDark: '#2f2140',
    ink: '#1a1326',
    rug: '#3f7f6f',
    rugB: '#4d9380',
    accent: '#ffcf6b',
    glow: 'rgba(255, 230, 190, 0.18)',
  },
  classroom: {
    floor: '#5d4c43',
    floorB: '#665246',
    fleck: '#4b3f3a',
    seam: '#4a3d36',
    wall: '#26333f',
    wallTop: '#33414e',
    wallDark: '#18222b',
    ink: '#0d1419',
    rug: '#3a5a58',
    rugB: '#447070',
    accent: '#7ee0c8',
    glow: 'rgba(160, 230, 210, 0.16)',
  },
  evening: {
    floor: '#2a2740',
    floorB: '#302c48',
    fleck: '#241f36',
    seam: '#232030',
    wall: '#1d1b45',
    wallTop: '#2a2757',
    wallDark: '#12102c',
    ink: '#0a0918',
    rug: '#3a2a4a',
    rugB: '#463456',
    accent: '#a0beff',
    glow: 'rgba(160, 190, 255, 0.22)',
  },
};

/** Deterministic speckle: same room, same grain, every run. */
function grain(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** A canvas sized in art pixels, with a real 2D context when the DOM has one. */
export function surface(widthArt, heightArt, scale = 4) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(widthArt * scale));
  canvas.height = Math.max(1, Math.round(heightArt * scale));
  const ctx = canvas.getContext && canvas.getContext('2d');
  const ready = Boolean(ctx && typeof ctx.scale === 'function' && typeof ctx.fillRect === 'function');
  if (ready) {
    ctx.imageSmoothingEnabled = false;
    ctx.scale(scale, scale);
  }
  return { canvas, ctx, ready };
}

/* ---------- floor and walls ---------- */

function isFloor(room, x, y) {
  const h = room.map.length;
  const w = room.map[0].length;
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  return room.map[y][x] !== '#';
}

function floorTile(ctx, theme, name, tx, ty) {
  const x = tx * ART;
  const y = ty * ART;

  if (name === 'yard') {
    rect(ctx, x, y, ART, ART, theme.floor);
    const seed = grain(tx * 3, ty * 7);
    if (seed > 0.6) rect(ctx, x + 1 + Math.floor(seed * 5), y + 2 + Math.floor(seed * 4), 1, 3, theme.fleck);
    if (seed > 0.93) rect(ctx, x + 4, y + 5, 2, 1, theme.fleck);
    return;
  }

  if (name === 'evening') {
    rect(ctx, x, y, ART, ART, grain(tx, ty) > 0.72 ? theme.floorB : theme.floor);
    if (grain(tx * 5, ty * 2) > 0.76) rect(ctx, x + 2, y + 5, 3, 1, theme.fleck);
    return;
  }

  if (name === 'kindergarten') {
    rect(ctx, x, y, ART, ART, theme.floor);
    rect(ctx, x, y, ART, 1, theme.seam);
    rect(ctx, x, y, 1, ART, theme.seam);
    return;
  }

  // wooden floor: boards run the width of the room, two tiles deep
  const board = Math.floor(ty / 2);
  rect(ctx, x, y, ART, ART, board % 2 === 0 ? theme.floor : theme.floorB);
  if (ty % 2 === 1) rect(ctx, x, y + ART - 1, ART, 1, theme.seam);
  const seed = grain(tx * 2, ty * 3);
  if (seed > 0.78) rect(ctx, x + 2, y + 3, 2, 1, theme.fleck);
}

function wallTile(ctx, theme, hasFloorBelow, isTopRow) {
  rect(ctx, 0, 0, ART, ART, theme.wall);
  if (isTopRow) rect(ctx, 0, 0, ART, 1, theme.wallTop);
  if (hasFloorBelow) {
    rect(ctx, 0, ART - 3, ART, 3, theme.wallDark);
    rect(ctx, 0, ART - 1, ART, 1, theme.ink);
  }
}

/** Floor first, then the walls on top, so joints read as one band. */
export function paintGround(ctx, room, theme) {
  const h = room.map.length;
  const w = room.map[0].length;

  for (let ty = 0; ty < h; ty += 1) {
    for (let tx = 0; tx < w; tx += 1) {
      if (room.map[ty][tx] === '#') continue;
      floorTile(ctx, theme, room.theme, tx, ty);
    }
  }

  for (let ty = 0; ty < h; ty += 1) {
    for (let tx = 0; tx < w; tx += 1) {
      if (room.map[ty][tx] !== '#') continue;
      ctx.save();
      ctx.translate(tx * ART, ty * ART);
      wallTile(ctx, theme, isFloor(room, tx, ty + 1), ty === 0);
      ctx.restore();
    }
  }
}


/* ---------- floor decor: painted per tile, never solid ---------- */

export const DECOR = {
  rug(ctx, theme) {
    rect(ctx, 0, 0, ART, ART, theme.rug);
    rect(ctx, 2, 2, 1, 1, theme.rugB);
    rect(ctx, 5, 5, 1, 1, theme.rugB);
    rect(ctx, 3, 6, 1, 1, theme.rugB);
  },
  mat(ctx, theme) {
    rect(ctx, 0, 0, ART, ART, theme.wallDark);
    rect(ctx, 3, 1, 2, 1, theme.wall);
    rect(ctx, 3, 4, 2, 1, theme.wall);
  },
  window(ctx, theme) {
    rect(ctx, 0, 0, ART, ART, theme.wallTop);
    rect(ctx, 1, 1, ART - 2, ART - 2, theme.accent);
    rect(ctx, 3, 1, 1, ART - 2, theme.wallTop);
    rect(ctx, 1, 3, ART - 2, 1, theme.wallTop);
    rect(ctx, 0, ART - 1, ART, 1, theme.ink);
  },
  door(ctx, theme) {
    rect(ctx, 0, 0, ART, ART, theme.wallDark);
    rect(ctx, 1, 1, ART - 2, ART - 1, '#6b4a3a');
    rect(ctx, 5, 4, 1, 1, theme.accent);
  },
  plant(ctx) {
    rect(ctx, 2, 4, 4, 3, '#5b3a2a');
    rect(ctx, 1, 1, 6, 3, '#3f7f55');
    rect(ctx, 2, 0, 4, 2, '#4e9a68');
    rect(ctx, 0, 2, 2, 2, '#3f7f55');
    rect(ctx, 6, 2, 2, 2, '#3f7f55');
  },
  chalk(ctx) {
    rect(ctx, 2, 3, 4, 1, 'rgba(255,255,255,0.28)');
    rect(ctx, 3, 5, 3, 1, 'rgba(255,255,255,0.18)');
  },
  puddle(ctx) {
    rect(ctx, 1, 2, 6, 4, 'rgba(160, 190, 255, 0.28)');
    rect(ctx, 2, 3, 3, 1, 'rgba(200, 220, 255, 0.4)');
  },
};

/** Decor that should read as one region, so it gets an outline instead of a grid. */
const OUTLINED = new Set(['rug', 'mat']);

/**
 * Floor decor, tile by tile, then one outline around each contiguous region —
 * that is what turns 24 rug tiles into a rug instead of a tiled floor.
 */
export function paintDecor(ctx, room, theme) {
  const h = room.map.length;
  const w = room.map[0].length;
  const legend = room.legend || {};
  const nameAt = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    return legend[room.map[y][x]] || null;
  };

  for (let ty = 0; ty < h; ty += 1) {
    for (let tx = 0; tx < w; tx += 1) {
      const name = nameAt(tx, ty);
      const paint = name && DECOR[name];
      if (!paint) continue;
      ctx.save();
      ctx.translate(tx * ART, ty * ART);
      paint(ctx, theme);
      ctx.restore();
    }
  }

  for (let ty = 0; ty < h; ty += 1) {
    for (let tx = 0; tx < w; tx += 1) {
      const name = nameAt(tx, ty);
      if (!OUTLINED.has(name)) continue;
      const same = (x, y) => nameAt(x, y) === name;
      ctx.save();
      ctx.translate(tx * ART, ty * ART);
      if (!same(tx, ty - 1)) rect(ctx, 0, 0, ART, 1, theme.ink);
      if (!same(tx, ty + 1)) rect(ctx, 0, ART - 1, ART, 1, theme.ink);
      if (!same(tx - 1, ty)) rect(ctx, 0, 0, 1, ART, theme.ink);
      if (!same(tx + 1, ty)) rect(ctx, ART - 1, 0, 1, ART, theme.ink);
      ctx.restore();
    }
  }
}

/* ---------- props and hotspots ---------- */

function wood(ctx, x, y, w, h, light = '#8a5a3c', dark = '#5f3d27') {
  rect(ctx, x, y, w, h, light);
  rect(ctx, x, y + h - 1, w, 1, dark);
  rect(ctx, x + w - 1, y, 1, h, dark);
}

export function person(ctx, cx, cy, { hair = '#4a3326', shirt = '#6f92e0', skin = '#f6cfa8', dir = 'down', tall = true, frame = 0, small = false } = {}) {
  const legShift = frame % 2 === 0 ? 0 : 1;
  const bodyTop = tall ? cy - 11 : cy - 7;
  const bodyH = tall ? 7 : 5;
  const narrow = dir === 'left' || dir === 'right';

  if (small) {
    // a child half the grown-ups' size: three rows of head, three of body
    rect(ctx, cx - 2, cy - 1, 1, 1 + legShift, '#2b2438');
    rect(ctx, cx + 1, cy - 1, 1, 2 - legShift, '#2b2438');
    rect(ctx, cx - 2, cy - 4, 4, 3, shirt);
    rect(ctx, cx - 2, cy - 4, 4, 1, 'rgba(255,255,255,0.16)');
    rect(ctx, cx - 3, cy - 3, 1, 1, skin);
    rect(ctx, cx + 2, cy - 3, 1, 1, skin);

    const headY = cy - 7;
    rect(ctx, cx - 2, headY, 4, 3, skin);
    rect(ctx, cx - 2, headY, 4, 1, hair);
    if (dir === 'down') {
      rect(ctx, cx - 1, headY + 2, 1, 1, '#17111f');
      rect(ctx, cx + 1, headY + 2, 1, 1, '#17111f');
    } else if (dir === 'up') {
      rect(ctx, cx - 2, headY, 4, 2, hair);
    } else {
      rect(ctx, cx + (dir === 'right' ? 1 : -2), headY + 2, 1, 1, '#17111f');
      rect(ctx, cx + (dir === 'right' ? -2 : 1), headY, 1, 2, hair);
    }
    return;
  }

  rect(ctx, cx - 2, bodyTop + bodyH - 1, 2, 2 + legShift, '#2b2438');
  rect(ctx, cx + 1, bodyTop + bodyH - 1, 2, 3 - legShift, '#2b2438');

  rect(ctx, cx - (narrow ? 2 : 3), bodyTop, narrow ? 4 : 6, bodyH, shirt);
  rect(ctx, cx - 3, bodyTop, 6, 1, 'rgba(255,255,255,0.16)');
  if (!narrow) {
    rect(ctx, cx - 4, bodyTop + 1, 1, bodyH - 2, shirt);
    rect(ctx, cx + 3, bodyTop + 1, 1, bodyH - 2, shirt);
  } else {
    rect(ctx, cx + 2, bodyTop + 1, 1, bodyH - 2, shirt);
  }

  const headY = bodyTop - 5;
  rect(ctx, cx - 3, headY, 6, 5, skin);
  rect(ctx, cx - 3, headY, 6, 2, hair);
  rect(ctx, cx - 3, headY + 1, 1, 2, hair);
  rect(ctx, cx + 2, headY + 1, 1, 2, hair);

  if (dir === 'down') {
    rect(ctx, cx - 2, headY + 3, 1, 1, '#17111f');
    rect(ctx, cx + 1, headY + 3, 1, 1, '#17111f');
  } else if (dir === 'up') {
    rect(ctx, cx - 3, headY, 6, 4, hair);
  } else {
    rect(ctx, cx + (dir === 'right' ? 1 : -2), headY + 3, 1, 1, '#17111f');
    rect(ctx, cx + (dir === 'right' ? -3 : 2), headY + 1, 1, 3, hair);
  }
}

/** Paint the static room: floor, walls, floor decor, then every prop. */
export function paintRoom(room) {
  const h = room.map.length;
  const w = room.map[0].length;
  const theme = THEMES[room.theme] || THEMES.nursery;
  const { canvas, ctx, ready } = surface(w * ART, h * ART);
  if (!ready) return { canvas, ready };

  paintGround(ctx, room, theme);
  paintDecor(ctx, room, theme);

  for (const object of [...(room.furniture || []), ...room.objects]) {
    const prop = PROPS[object.sprite];
    if (!prop) continue;
    ctx.save();
    ctx.translate(object.x * ART, object.y * ART);
    prop.paint(ctx, theme, object, 0);
    ctx.restore();
  }

  return { canvas, ready };
}

/** Redraw every moving body above the room. Cheap: a handful of rects each. */
export function paintActors(canvas, room, entities) {
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx || typeof ctx.setTransform !== 'function') return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(4, 4);

  const ordered = entities.slice().sort((a, b) => a.y - b.y);
  for (const entity of ordered) {
    const cx = Math.round(entity.x * ART);
    const cy = Math.round(entity.y * ART);
    rect(ctx, cx - 3, cy - 1, 6, 2, 'rgba(0,0,0,0.22)');
    if (entity.kind === 'baby') {
      person(ctx, cx, cy, {
        dir: entity.dir,
        frame: entity.frame,
        small: true,
        hair: '#4a3326',
        shirt: '#7ee0c8',
      });
    } else {
      person(ctx, cx, cy, {
        dir: entity.dir,
        tall: false,
        frame: entity.frame,
        hair: entity.hair || '#4a3326',
        shirt: entity.shirt || '#7ee0c8',
      });
    }
  }
}


export const PROPS = {
  crib: {
    w: 3, h: 2, solid: true,
    paint(ctx) {
      rect(ctx, 0, 0, 24, 16, '#4a2f1d');
      rect(ctx, 1, 1, 22, 14, '#8a5a3c');
      rect(ctx, 2, 2, 20, 12, '#f0e6f5');
      rect(ctx, 2, 9, 20, 5, '#cbb9d8');
      rect(ctx, 7, 3, 6, 5, '#f6cfa8');
      rect(ctx, 7, 3, 6, 1, '#4a3326');
      rect(ctx, 5, 5, 2, 2, '#f6cfa8');
      for (let x = 2; x < 23; x += 4) {
        rect(ctx, x, 0, 1, 2, '#f7f3ff');
        rect(ctx, x, 14, 1, 2, '#f7f3ff');
      }
      rect(ctx, 0, 0, 24, 1, '#6b4326');
    },
  },
  dresser: {
    w: 2, h: 1, solid: true,
    paint(ctx) {
      wood(ctx, 1, 1, 14, 6);
      rect(ctx, 2, 2, 12, 2, '#6f462c');
      rect(ctx, 2, 5, 12, 1, '#6f462c');
      rect(ctx, 7, 3, 2, 1, '#ffcf6b');
      rect(ctx, 7, 5, 2, 1, '#ffcf6b');
    },
  },
  bottle: {
    w: 1, h: 1, solid: false,
    paint(ctx) {
      rect(ctx, 3, 1, 2, 5, '#e9f2ff');
      rect(ctx, 3, 3, 2, 3, '#ffffff');
      rect(ctx, 3, 0, 2, 1, '#ffcf6b');
    },
  },
  mobile: {
    w: 1, h: 1, solid: false,
    paint(ctx, theme) {
      rect(ctx, 3, 0, 1, 3, theme.ink);
      rect(ctx, 1, 3, 6, 1, theme.ink);
      rect(ctx, 1, 4, 1, 1, theme.accent);
      rect(ctx, 6, 4, 1, 1, '#f08fb4');
      rect(ctx, 3, 4, 2, 2, theme.accent);
    },
  },
  sunlight: {
    w: 2, h: 2, solid: false,
    paint(ctx) {
      rect(ctx, 3, 1, 10, 13, 'rgba(255, 240, 200, 0.16)');
      rect(ctx, 2, 3, 12, 9, 'rgba(255, 240, 200, 0.16)');
      rect(ctx, 4, 2, 8, 11, 'rgba(255, 240, 200, 0.2)');
      rect(ctx, 5, 4, 6, 7, 'rgba(255, 248, 220, 0.22)');
    },
  },
  moonpatch: {
    w: 2, h: 2, solid: false,
    paint(ctx) {
      rect(ctx, 4, 1, 8, 13, 'rgba(160, 190, 255, 0.1)');
      rect(ctx, 2, 3, 12, 9, 'rgba(160, 190, 255, 0.1)');
      rect(ctx, 5, 2, 6, 11, 'rgba(180, 205, 255, 0.14)');
      rect(ctx, 6, 4, 4, 7, 'rgba(200, 220, 255, 0.16)');
      rect(ctx, 7, 0, 2, 3, 'rgba(230, 236, 255, 0.3)');
    },
  },
  dog: {
    w: 1, h: 1, solid: false,
    paint(ctx) {
      rect(ctx, 1, 3, 5, 3, '#9b6a44');
      rect(ctx, 5, 2, 3, 3, '#8a5c39');
      rect(ctx, 6, 1, 1, 2, '#5f3d27');
      rect(ctx, 8, 2, 1, 2, '#5f3d27');
      rect(ctx, 2, 6, 1, 1, '#5f3d27');
      rect(ctx, 4, 6, 1, 1, '#5f3d27');
      rect(ctx, 6, 3, 1, 1, '#17111f');
    },
  },
  ball: {
    w: 1, h: 1, solid: false,
    paint(ctx) {
      rect(ctx, 2, 2, 4, 4, '#e5533d');
      rect(ctx, 3, 2, 1, 4, '#f7f3ff');
      rect(ctx, 2, 2, 1, 1, '#b83a2a');
    },
  },
  fence: {
    w: 4, h: 1, solid: true,
    paint(ctx) {
      rect(ctx, 0, 2, 32, 2, '#8a5a3c');
      rect(ctx, 0, 5, 32, 2, '#8a5a3c');
      for (let x = 1; x < 32; x += 6) {
        rect(ctx, x, 0, 2, 8, '#a06a45');
        rect(ctx, x, 0, 2, 1, '#c08a5e');
      }
    },
  },
  tree: {
    w: 2, h: 2, solid: true,
    paint(ctx) {
      rect(ctx, 6, 10, 4, 6, '#5f3d27');
      rect(ctx, 3, 2, 10, 9, '#3f7f55');
      rect(ctx, 1, 4, 14, 5, '#4e9a68');
      rect(ctx, 4, 1, 8, 3, '#5fae78');
      rect(ctx, 5, 3, 3, 2, '#7cc47f');
      rect(ctx, 9, 6, 3, 2, '#3f7f55');
    },
  },
  teacher: {
    w: 1, h: 2, solid: false,
    paint(ctx, theme, object, frame) {
      person(ctx, 4, 16, { hair: '#3a2a20', shirt: '#b9aed6', tall: true, frame });
    },
  },
  friend: {
    w: 1, h: 1, solid: false,
    paint(ctx, theme, object, frame) {
      person(ctx, 4, 9, { hair: '#4a3326', shirt: '#7cc47f', tall: false, frame });
    },
  },
  mama: {
    w: 1, h: 2, solid: false,
    paint(ctx, theme, object, frame) {
      person(ctx, 4, 16, { hair: '#5a3a28', shirt: '#f08fb4', tall: true, frame });
    },
  },
  papa: {
    w: 1, h: 2, solid: false,
    paint(ctx, theme, object, frame) {
      person(ctx, 4, 16, { hair: '#2f2a24', shirt: '#6f92e0', tall: true, frame });
    },
  },
  shelf: {
    w: 3, h: 1, solid: true,
    paint(ctx) {
      wood(ctx, 0, 0, 24, 8, '#6f462c', '#4a2f1d');
      const books = ['#e5533d', '#ffcf6b', '#6f92e0', '#7cc47f', '#9a68c8', '#f0913c'];
      books.forEach((color, index) => rect(ctx, 1 + index * 4, 1, 3, 6, color));
    },
  },
  snack: {
    w: 2, h: 1, solid: true,
    paint(ctx) {
      wood(ctx, 0, 2, 16, 6, '#8a5a3c', '#5f3d27');
      rect(ctx, 3, 0, 4, 4, '#e5533d');
      rect(ctx, 4, 1, 1, 1, '#ffcf6b');
      rect(ctx, 9, 1, 4, 4, '#f7f3ff');
      rect(ctx, 9, 3, 4, 2, '#d9d2e8');
    },
  },
  signs: {
    w: 2, h: 1, solid: true,
    paint(ctx) {
      // green card, white check
      rect(ctx, 0, 1, 8, 7, '#0f1720');
      rect(ctx, 1, 2, 6, 5, '#7cc47f');
      rect(ctx, 2, 5, 1, 1, '#f7f3ff');
      rect(ctx, 3, 6, 1, 1, '#f7f3ff');
      rect(ctx, 4, 5, 1, 1, '#f7f3ff');
      rect(ctx, 5, 4, 1, 1, '#f7f3ff');
      rect(ctx, 6, 3, 1, 1, '#f7f3ff');
      // red card, white cross
      rect(ctx, 8, 1, 8, 7, '#0f1720');
      rect(ctx, 9, 2, 6, 5, '#e5533d');
      rect(ctx, 10, 3, 1, 1, '#f7f3ff');
      rect(ctx, 11, 4, 1, 1, '#f7f3ff');
      rect(ctx, 12, 5, 1, 1, '#f7f3ff');
      rect(ctx, 13, 3, 1, 1, '#f7f3ff');
      rect(ctx, 12, 4, 1, 1, '#f7f3ff');
      rect(ctx, 11, 5, 1, 1, '#f7f3ff');
    },
  },
  board: {
    w: 3, h: 1, solid: true,
    paint(ctx) {
      rect(ctx, 0, 0, 24, 8, '#4a3326');
      rect(ctx, 1, 1, 22, 6, '#2f5f4a');
      rect(ctx, 3, 2, 8, 1, 'rgba(255,255,255,0.5)');
      rect(ctx, 3, 4, 12, 1, 'rgba(255,255,255,0.32)');
      rect(ctx, 17, 2, 4, 1, 'rgba(255,255,255,0.24)');
    },
  },
  table: {
    w: 3, h: 2, solid: true,
    paint(ctx) {
      wood(ctx, 0, 2, 24, 13, '#8a5a3c', '#5f3d27');
      rect(ctx, 2, 4, 20, 9, '#a06a45');
      rect(ctx, 4, 6, 7, 5, '#d9a05b');
      rect(ctx, 5, 7, 5, 3, '#f7f3ff');
      rect(ctx, 15, 5, 4, 6, '#f7f3ff');
      rect(ctx, 15, 8, 4, 3, '#e9f2ff');
      rect(ctx, 16, 4, 2, 1, '#ffcf6b');
    },
  },
  lamp: {
    w: 1, h: 1, solid: true,
    paint(ctx) {
      // pool of lamplight, then the post
      rect(ctx, -3, -3, 14, 14, 'rgba(255, 220, 150, 0.06)');
      rect(ctx, -2, -2, 12, 12, 'rgba(255, 220, 150, 0.08)');
      rect(ctx, 3, 2, 2, 5, '#3a3358');
      rect(ctx, 2, 1, 4, 2, '#ffe6a8');
      rect(ctx, 3, 0, 2, 2, '#cbb9d8');
      rect(ctx, 1, 6, 6, 1, 'rgba(0, 0, 0, 0.35)');
    },
  },
  house: {
    w: 3, h: 2, solid: true,
    paint(ctx) {
      rect(ctx, 0, 0, 24, 16, '#2a2748');
      rect(ctx, 1, 1, 22, 14, '#3a3358');
      rect(ctx, 1, 1, 22, 3, '#4a4070');
      rect(ctx, 5, 6, 6, 5, '#ffcf6b');
      rect(ctx, 6, 7, 4, 3, '#fff3c9');
      rect(ctx, 14, 6, 6, 5, '#1d1b45');
      rect(ctx, 15, 7, 4, 3, '#12102c');
    },
  },
  flowers: {
    w: 2, h: 1, solid: true,
    paint(ctx) {
      rect(ctx, 0, 3, 16, 5, '#3f7f55');
      const petals = ['#f08fb4', '#ffcf6b', '#f7f3ff', '#e5533d'];
      petals.forEach((color, index) => {
        rect(ctx, 1 + index * 4, 1, 2, 2, color);
        rect(ctx, 1 + index * 4, 5, 1, 2, '#4e9a68');
      });
    },
  },
};

/** Names the validator can check room data against. */
export const PROP_NAMES = Object.keys(PROPS);
