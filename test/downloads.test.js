const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const { validateJar } = require('../electron/downloads');

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proc-dl-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('validateJar', () => {
  it('accepts a real zip', async () => {
    const file = path.join(dir, 'good.jar');
    const zip = new AdmZip();
    zip.addFile('META-INF/MANIFEST.MF', Buffer.from('Manifest-Version: 1.0\n'));
    zip.writeZip(file);
    assert.equal(await validateJar(file), true);
  });

  it('rejects missing, empty, directory and corrupt paths', async () => {
    assert.equal(await validateJar(path.join(dir, 'missing.jar')), false);
    const empty = path.join(dir, 'empty.jar');
    fs.writeFileSync(empty, '');
    assert.equal(await validateJar(empty), false);
    const corrupt = path.join(dir, 'corrupt.jar');
    fs.writeFileSync(corrupt, 'this is not a zip file at all, just text!!!!!!!!!');
    assert.equal(await validateJar(corrupt), false);
    const subdir = path.join(dir, 'dir.jar');
    fs.mkdirSync(subdir);
    assert.equal(await validateJar(subdir), false);
  });
});
