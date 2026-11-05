// Pixel sprites are authored as string maps: one character per pixel,
// '.' means transparent. Everything else is looked up in PALETTE.
// The validator (tools/validate.mjs) enforces that every row of a sprite
// is the same width and that every character exists in the palette.

export const PALETTE = {
  '.': null,
  k: '#17111f', // outline / ink
  w: '#f7f3ff', // white
  g: '#b9aed6', // light grey
  d: '#55496f', // grey purple
  s: '#f6cfa8', // skin
  h: '#4a3326', // hair brown
  r: '#e5533d', // red
  o: '#f0913c', // orange
  y: '#ffcf6b', // yellow
  l: '#ffefb0', // pale yellow
  G: '#7cc47f', // green
  e: '#3f7f55', // dark green
  b: '#6f92e0', // blue
  B: '#3a4a86', // deep blue
  p: '#f08fb4', // pink
  P: '#9a68c8', // purple
  m: '#9b6a44', // brown
  M: '#5f3d27', // dark brown
  t: '#d9a05b', // tan
  c: '#7ee0c8', // aqua
  n: '#232a4d', // navy
};

export const SPRITES = {
  mama: [
    '....hhhh....',
    '...hhhhhh...',
    '..hhsssshh..',
    '..hssssssh..',
    '..hskssksh..',
    '..hssssssh..',
    '...hssssh...',
    '..pppppppp..',
    '.pppppppppp.',
    '.pppppppppp.',
    '..pppppppp..',
    '..ss....ss..',
  ],
  papa: [
    '....hhhh....',
    '...hhhhhh...',
    '..hssssssh..',
    '..hssssssh..',
    '..hskssksh..',
    '..hssssssh..',
    '...hssssh...',
    '..bbbbbbbb..',
    '.bbbbbbbbbb.',
    '.bbbbbbbbbb.',
    '..bbbbbbbb..',
    '..ss....ss..',
  ],
  baby: [
    '............',
    '....ssss....',
    '...ssssss...',
    '...skssks...',
    '...ssssss...',
    '..cccccccc..',
    '.cccccccccc.',
    '.cccccccccc.',
    '.cccccccccc.',
    '..cccccccc..',
    '...ss..ss...',
    '............',
  ],
  teacher: [
    '...hhhhhh...',
    '..hhhhhhhh..',
    '..hssssssh..',
    '..hkkkkkkh..',
    '..hssssssh..',
    '..hssssssh..',
    '...hssssh...',
    '..gggggggg..',
    '.gggggggggg.',
    '.gggggggggg.',
    '..gggggggg..',
    '..ss....ss..',
  ],
  friend: [
    '..GGGGGGGG..',
    '..GGGGGGGG..',
    '..hssssssh..',
    '..hskssksh..',
    '..hssssssh..',
    '...hssssh...',
    '..GGGGGGGG..',
    '.GGGGGGGGGG.',
    '.GGGGGGGGGG.',
    '..GGGGGGGG..',
    '..ss....ss..',
    '..ss....ss..',
  ],
  dog: [
    '..m......m..',
    '.mm......mm.',
    '.mmmmmmmmmm.',
    '.mmmmmmmmmm.',
    '.mmkkmmkkmm.',
    '.mmmttttmmm.',
    '..mmttttmm..',
    '..mmttkkmm..',
    '...mmmmmm...',
    '....mmmm....',
    '............',
    '............',
  ],
  cat: [
    '..P......P..',
    '.PP......PP.',
    '.PPPPPPPPPP.',
    '.PPPPPPPPPP.',
    '.PPkkPPkkPP.',
    '.PPPPPPPPPP.',
    '..PPttttPP..',
    '..PPttkkPP..',
    '...PPPPPP...',
    '....PPPP....',
    '............',
    '............',
  ],
  bird: [
    '............',
    '....bbbb....',
    '...bbbbbb...',
    '..bbkbbbbb..',
    '..bbbbbbby..',
    '...bbbbbb...',
    '..bbbbbbbb..',
    '..bbbbbbbb..',
    '.bbbbbbbbbb.',
    '..bbbbbbbb..',
    '...kk..kk...',
    '............',
  ],
  fish: [
    '............',
    'oo...oooo...',
    '.oo.oooooooo',
    '..oooooooooo',
    '..ookoooooo.',
    '..oooooooooo',
    '.oo.oooooooo',
    'oo...oooo...',
    '............',
  ],
  sun: [
    '..y.yyyy.y..',
    '...yyyyyy...',
    '..yyyyyyyy..',
    '.yyyyyyyyyy.',
    '.yyyyyyyyyy.',
    '..yyyyyyyy..',
    '...yyyyyy...',
    '..y.yyyy.y..',
  ],
  moon: [
    '...llll.....',
    '..llll......',
    '.lll........',
    '.lll........',
    '.lll........',
    '.lll........',
    '..llll......',
    '...llll.....',
  ],
  star: [
    '.....yy.....',
    '....yyyy....',
    '....yyyy....',
    '.yyyyyyyyyy.',
    '..yyyyyyyy..',
    '...yyyyyy...',
    '..yyyyyyyy..',
    '.yyyy..yyyy.',
    'yyy......yyy',
    '............',
  ],
  tree: [
    '....GGGG....',
    '...GGGGGG...',
    '..GGGGGGGG..',
    '.GGGGGGGGGG.',
    '..GGGGGGGG..',
    '.GGGGGGGGGG.',
    '...GGGGGG...',
    '....mmmm....',
    '....mmmm....',
    '....mmmm....',
    '...mmmmmm...',
    '............',
  ],
  flower: [
    '.....pp.....',
    '....pppp....',
    '..p.pppp.p..',
    '.ppppyypppp.',
    '..p.pppp.p..',
    '....pppp....',
    '.....pp.....',
    '.....GG.....',
    '....GGGG....',
    '.....GG.....',
    '.....GG.....',
    '............',
  ],
  rain: [
    '...gggggg...',
    '..gggggggg..',
    '.gggggggggg.',
    '.gggggggggg.',
    '..gggggggg..',
    '............',
    '..b.b..b.b..',
    '.b..b..b..b.',
    '............',
  ],
  house: [
    '....rrrr....',
    '...rrrrrr...',
    '..rrrrrrrr..',
    '.rrrrrrrrrr.',
    'rrrrrrrrrrrr',
    '..mmmmmmmm..',
    '..mmmmmmmm..',
    '..mmyyyymm..',
    '..mmyyyymm..',
    '..mmmmmmmm..',
    '..mmddddmm..',
    '..mmddddmm..',
  ],
  car: [
    '............',
    '...bbbbbb...',
    '..bbbbbbbb..',
    'bbbbbbbbbbbb',
    'bbbbbbbbbbbb',
    'bwbbbbbbbbwb',
    'bbbbbbbbbbbb',
    '.kkbbbbbbkk.',
    '.kk......kk.',
  ],
  ball: [
    '...rrrrrr...',
    '..rrwwrrrr..',
    '.rrrrrrrrrr.',
    '.rrwwrrrrrr.',
    '.rrrrrrwwrr.',
    '.rrrrrrrrrr.',
    '..rrrrrrrr..',
    '...rrrrrr...',
  ],
  apple: [
    '.....G......',
    '....G.G.....',
    '..rrrrrrrr..',
    '.rrwrrrrrrr.',
    'rrrrrrrrrrrr',
    'rrrrrrrrrrrr',
    'rrrrrrrrrrrr',
    '.rrrrrrrrrr.',
    '..rrrrrrrr..',
    '...rrrrrr...',
  ],
  bread: [
    '............',
    '..MMMMMMMM..',
    '.MttttttttM.',
    'tttttttttttt',
    'tttttttttttt',
    'tttttttttttt',
    '.tttttttttt.',
    '..tttttttt..',
    '............',
  ],
  milk: [
    '....gggg....',
    '....wwww....',
    '...wwwwww...',
    '..wwwwwwww..',
    '..wwwwwwww..',
    '..wwbbbbww..',
    '..wwwwwwww..',
    '..wwwwwwww..',
    '...wwwwww...',
  ],
  book: [
    '............',
    '.rbbbbbbbbb.',
    '.rbwwwwwwwb.',
    '.rbwwwwwwwb.',
    '.rbwwwwwwwb.',
    '.rbwwwwwwwb.',
    '.rbbbbbbbbb.',
    '............',
  ],
  shoe: [
    '............',
    '.....mmmm...',
    '....mmmmmm..',
    '....mmmmmm..',
    '....mmmmmmmm',
    '..mmmmmmmmmm',
    '.mmmmmmmmmm.',
    '.kkkkkkkkkk.',
    '............',
  ],
  hat: [
    '............',
    '...rrrrrr...',
    '..rrrrrrrr..',
    '.rrrrrrrrrr.',
    'rrrrrrrrrrrr',
    '............',
    '.mmmmmmmmmm.',
    '............',
  ],
  hand: [
    '...s.s.s....',
    '...s.s.s....',
    '..sssssss...',
    '..sssssss...',
    '..sssssss...',
    '...sssss....',
    '....sss.....',
    '............',
  ],
  eye: [
    '............',
    '...wwwwww...',
    '..wwwwwwww..',
    '.wwwkkkkwww.',
    'wwwkkbbkkwww',
    '.wwwkkkkwww.',
    '..wwwwwwww..',
    '...wwwwww...',
    '............',
  ],
  wave: [
    '............',
    '..s..s..s...',
    '..s..s..s...',
    '..ssssssss..',
    '..ssssssss..',
    '...ssssss...',
    '....ssss....',
    '............',
  ],
  check: [
    '............',
    '..........GG',
    '.........GG.',
    '........GG..',
    '..G....GG...',
    '..GG..GG....',
    '...GGGG.....',
    '....GG......',
    '............',
  ],
  cross: [
    '............',
    '.rr......rr.',
    '..rr....rr..',
    '...rr..rr...',
    '....rrrr....',
    '...rr..rr...',
    '..rr....rr..',
    '.rr......rr.',
    '............',
  ],
  plus: [
    '............',
    '.....cc.....',
    '.....cc.....',
    '..cccccccc..',
    '..cccccccc..',
    '.....cc.....',
    '.....cc.....',
    '............',
  ],
  heart: [
    '............',
    '.rrrr.rrrr..',
    'rrrrrrrrrrrr',
    'rrrrrrrrrrrr',
    '.rrrrrrrrrr.',
    '..rrrrrrrr..',
    '...rrrrrr...',
    '....rrrr....',
    '.....rr.....',
    '............',
  ],
};

/* ---------- renderer ---------- */

export function hasSprite(name) {
  return Object.prototype.hasOwnProperty.call(SPRITES, name);
}

export function spriteMetrics(name) {
  const rows = SPRITES[name];
  if (!rows || !rows.length) return null;
  return { width: rows[0].length, height: rows.length };
}

/**
 * Rasterize a sprite into a canvas. `unit` is the pixel size in device pixels;
 * CSS then scales the canvas, and `image-rendering: pixelated` keeps it crisp.
 */
export function drawSprite(name, { unit = 6 } = {}) {
  const rows = SPRITES[name];
  if (!rows) return null;
  const width = rows[0].length;
  const height = rows.length;

  const canvas = document.createElement('canvas');
  canvas.width = width * unit;
  canvas.height = height * unit;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  for (let y = 0; y < height; y += 1) {
    const row = rows[y];
    for (let x = 0; x < width; x += 1) {
      const color = PALETTE[row[x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * unit, y * unit, unit, unit);
    }
  }

  canvas.className = 'pix';
  canvas.setAttribute('aria-hidden', 'true');
  return canvas;
}

/** Sprite wrapped in a canvas with a class name, or an empty span if missing. */
export function spriteCanvas(name, className = '', unit = 6) {
  const canvas = drawSprite(name, { unit });
  if (!canvas) {
    const fallback = document.createElement('span');
    if (className) fallback.className = className;
    fallback.textContent = '?';
    return fallback;
  }
  if (className) canvas.className = `${className} pix`;
  return canvas;
}
