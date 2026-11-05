// A very small PNG codec: just enough to slice the art pack and rebuild an
// atlas, with no dependencies at all (Node's zlib does the compression).
//
// Decoding covers what a drawing tool exports for sprite work: 8-bit greyscale,
// RGB, palette, greyscale+alpha and RGBA, non-interlaced. Encoding always writes
// 8-bit RGBA, filter 0 (None) per row — an atlas is read once by the browser, so
// a fast, predictable encoder beats a clever one.

import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
}

/** Decode a PNG buffer into `{ width, height, data }` with RGBA bytes in `data`. */
export function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('not a PNG: bad signature');
  }

  let cursor = 8;
  let header = null;
  let palette = null;
  let transparency = null;
  const idat = [];

  while (cursor + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(cursor);
    const type = buffer.toString('ascii', cursor + 4, cursor + 8);
    const body = buffer.subarray(cursor + 8, cursor + 8 + length);
    cursor += 12 + length;

    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === 'PLTE') {
      palette = Buffer.from(body);
    } else if (type === 'tRNS') {
      transparency = Buffer.from(body);
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (!header) throw new Error('not a PNG: missing IHDR');
  if (header.interlace !== 0) throw new Error('interlaced PNGs are not supported');
  if (header.depth !== 8) throw new Error(`only 8-bit PNGs are supported (got ${header.depth})`);
  const channels = CHANNELS[header.colorType];
  if (!channels) throw new Error(`unsupported colour type ${header.colorType}`);
  if (header.colorType === 3 && !palette) throw new Error('palette PNG without PLTE');

  const { width, height } = header;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const out = pixels.subarray(y * stride, y * stride + stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, (y - 1) * stride + stride) : null;

    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? out[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let value;
      switch (filter) {
        case 0: value = line[x]; break;
        case 1: value = line[x] + a; break;
        case 2: value = line[x] + b; break;
        case 3: value = line[x] + ((a + b) >> 1); break;
        case 4: value = line[x] + paeth(a, b, c); break;
        default: throw new Error(`bad PNG filter ${filter} on row ${y}`);
      }
      out[x] = value & 0xff;
    }
  }

  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const s = i * channels;
    const d = i * 4;
    switch (header.colorType) {
      case 0:
        data[d] = pixels[s];
        data[d + 1] = pixels[s];
        data[d + 2] = pixels[s];
        data[d + 3] = 255;
        break;
      case 2:
        data[d] = pixels[s];
        data[d + 1] = pixels[s + 1];
        data[d + 2] = pixels[s + 2];
        data[d + 3] = 255;
        break;
      case 3: {
        const index = pixels[s];
        data[d] = palette[index * 3];
        data[d + 1] = palette[index * 3 + 1];
        data[d + 2] = palette[index * 3 + 2];
        data[d + 3] = transparency && index < transparency.length ? transparency[index] : 255;
        break;
      }
      case 4:
        data[d] = pixels[s];
        data[d + 1] = pixels[s];
        data[d + 2] = pixels[s];
        data[d + 3] = pixels[s + 1];
        break;
      default:
        data[d] = pixels[s];
        data[d + 1] = pixels[s + 1];
        data[d + 2] = pixels[s + 2];
        data[d + 3] = pixels[s + 3];
        break;
    }
  }

  return { width, height, data };
}


/** Encode RGBA pixels (`width * height * 4` bytes) into a PNG buffer. */
export function encodePng({ width, height, data }) {
  if (data.length !== width * height * 4) throw new Error('encodePng: pixel buffer size mismatch');

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
