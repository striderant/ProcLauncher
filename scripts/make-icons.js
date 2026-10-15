// Regenerates installer icons from the chip painter in electron/trayIcon.js:
//   build/icon.png  - 512px PNG (Linux)
//   build/icon.ico  - multi-image ICO 16–256px (Windows)
//   build/icon.icns - PNG-compressed icon elements 32–1024px (macOS)
// Run: npm run icons
const fs = require('fs');
const path = require('path');
const { buildAppIconPng, pngToIco } = require('../electron/trayIcon');

const BUILD_DIR = path.join(__dirname, '..', 'build');
fs.mkdirSync(BUILD_DIR, { recursive: true });

// PNG payload types macOS accepts inside .icns (OSType -> pixel size).
const ICNS_ENTRIES = [
  ['ic11', 32],
  ['ic12', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
];

function icns(images) {
  const parts = [];
  let total = 8;
  for (const { type, data } of images) {
    const header = Buffer.alloc(8);
    header.write(type, 0, 'ascii');
    header.writeUInt32BE(data.length + 8, 4);
    parts.push(header, data);
    total += data.length + 8;
  }
  const magic = Buffer.alloc(8);
  magic.write('icns', 0, 'ascii');
  magic.writeUInt32BE(total, 4);
  return Buffer.concat([magic, ...parts]);
}

// Sanity: magic + plausible entry table.
function checkIcns(buf) {
  if (buf.toString('ascii', 0, 4) !== 'icns') throw new Error('bad icns magic');
  if (buf.readUInt32BE(4) !== buf.length) throw new Error('bad icns length');
}

const png512 = buildAppIconPng(512);
fs.writeFileSync(path.join(BUILD_DIR, 'icon.png'), png512);
console.log('icon.png bytes=' + png512.length);

const ico = pngToIco([16, 24, 32, 48, 64, 128, 256].map(size => ({ size, data: buildAppIconPng(size) })));
fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), ico);
console.log('icon.ico bytes=' + ico.length);

const icnsBuf = icns(ICNS_ENTRIES.map(([type, size]) => ({ type, data: buildAppIconPng(size) })));
checkIcns(icnsBuf);
fs.writeFileSync(path.join(BUILD_DIR, 'icon.icns'), icnsBuf);
console.log('icon.icns bytes=' + icnsBuf.length);
console.log('icons OK');
