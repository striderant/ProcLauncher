// Generates icons at runtime: outlined processor-chip marks (thin body + die
// outlines, three pins per side - same look as the boot splash) on
// transparency, matching the app palette. Avoids shipping binary image assets
// (except the prebuilt build/icon.ico used by the Windows installer).

const zlib = require('zlib');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function roundedRectContains(px, py, x0, y0, x1, y1, radius) {
  if (px < x0 || px >= x1 || py < y0 || py >= y1) return false;
  if (px >= x0 + radius && px < x1 - radius) return true; // vertical band
  if (py >= y0 + radius && py < y1 - radius) return true; // horizontal band
  const qx = px < x0 + radius ? (x0 + radius) - px : px - (x1 - radius);
  const qy = py < y0 + radius ? (y0 + radius) - py : py - (y1 - radius);
  return qx * qx + qy * qy <= radius * radius;
}

function encodePng(size, paint) {
  const rowBytes = size * 4 + 1;
  const raw = Buffer.alloc(size * rowBytes);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter type: None
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x + 0.5, y + 0.5);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      raw[o++] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: truecolor + alpha
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Distance from a point to a segment - pins are capsules, so rounded ends
// come for free.
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
// Band between a rounded rect and its inset - with inset 0 this is an
// outline stroke of `width` hugging the inside edge of the rect.
function roundedRingContains(px, py, rect, inset, width) {
  if (!roundedRectContains(px, py, rect.x0, rect.y0, rect.x1, rect.y1, rect.r)) return false;
  const ix0 = rect.x0 + inset;
  const iy0 = rect.y0 + inset;
  const ix1 = rect.x1 - inset;
  const iy1 = rect.y1 - inset;
  const ir = Math.max(0, rect.r - inset);
  if (!roundedRectContains(px, py, ix0, iy0, ix1, iy1, ir)) return false;
  return !roundedRectContains(
    px, py,
    ix0 + width, iy0 + width, ix1 - width, iy1 - width,
    Math.max(0, ir - width)
  );
}

// Outlined processor-chip painter. Geometry is expressed on a 24-unit grid
// (Lucide-style proportions) and scaled to the target pixel size, so the mark
// stays proportional from 16px tray up to 256px installer art.
// opts: { bodyW, dieW, pinW } - stroke widths in grid units.
function chipPainter(size, opts) {
  const s = (v) => (v / 24) * size;
  const body = { x0: s(4.5), y0: s(4.5), x1: s(19.5), y1: s(19.5), r: s(2.5) };
  const die = { x0: s(9), y0: s(9), x1: s(15), y1: s(15), r: 0 };
  const bodyW = s(opts.bodyW);
  const dieW = s(opts.dieW);
  const pinHalf = s(opts.pinW) / 2;
  const pinOuter = s(1.5);
  const centers = [8, 12, 16].map(s);

  const inPins = (px, py) => {
    for (const c of centers) {
      if (distToSeg(px, py, c, pinOuter, c, body.y0) <= pinHalf) return true;
      if (distToSeg(px, py, c, body.y1, c, size - pinOuter) <= pinHalf) return true;
      if (distToSeg(px, py, pinOuter, c, body.x0, c) <= pinHalf) return true;
      if (distToSeg(px, py, body.x1, c, size - pinOuter, c) <= pinHalf) return true;
    }
    return false;
  };

  return (px, py) => {
    const WHITE = [255, 255, 255, 255];
    const CLEAR = [0, 0, 0, 0];
    if (inPins(px, py)) return WHITE;
    if (roundedRingContains(px, py, body, 0, bodyW)) return WHITE;
    if (roundedRingContains(px, py, die, 0, dieW)) return WHITE;
    return CLEAR;
  };
}

// Outlined chip for window, installer and favicon art: thin strokes, three
// pins per side - matches the boot splash mark.
function buildAppIconPng(size = 64) {
  return encodePng(size, chipPainter(size, { bodyW: 1.6, dieW: 1.4, pinW: 1.6 }));
}

// Bolder outlined chip for the tray: thicker strokes so it stays legible
// down to 16px.
function buildTrayPng(size = 32) {
  return encodePng(size, chipPainter(size, { bodyW: 2.2, dieW: 2, pinW: 2.2 }));
}

// Wraps PNG buffers in a multi-image .ico container (valid for Windows).
// images: [{ size, data }]. Include 16–256px so taskbar, window and
// desktop renderings each get a native resolution.
function pngToIco(images) {
  const list = Array.isArray(images) ? images : [images];
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(list.length, 4); // image count
  let offset = 6 + 16 * list.length;
  const parts = [header];
  for (const { size, data } of list) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0; // color palette
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12); // image data offset
    offset += data.length;
    parts.push(entry);
  }
  for (const { data } of list) parts.push(data);
  return Buffer.concat(parts);
}

module.exports = { buildTrayPng, buildAppIconPng, pngToIco };
