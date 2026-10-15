// Unit: managed-Java-first resolution, version parsing, and JDK checksum
// verification. No network, no real Java required.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

let tmp;
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'proc-java-')); });
after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

// eslint-disable-next-line global-require
const java = require('../electron/java');

describe('parseJavaMajor', () => {
  it('parses modern and legacy schemes', () => {
    assert.equal(java.parseJavaMajor('openjdk version "17.0.9" 2023-10-17'), 17);
    assert.equal(java.parseJavaMajor('openjdk version "21.0.1" 2023-10-17'), 21);
    assert.equal(java.parseJavaMajor('java version "1.8.0_391"'), 8);
    assert.equal(java.parseJavaMajor('openjdk version "8u392"'), 8);
  });

  it('returns null for garbage', () => {
    assert.equal(java.parseJavaMajor(''), null);
    assert.equal(java.parseJavaMajor('no version here'), null);
    assert.equal(java.parseJavaMajor(null), null);
  });
});

describe('systemJavaMatches', () => {
  it('matches only the required major (stderr carries the output)', async () => {
    const exec17 = async () => ({ stdout: '', stderr: 'openjdk version "17.0.9" 2023-10-17\n' });
    assert.equal(await java.systemJavaMatches(17, exec17), true);
    assert.equal(await java.systemJavaMatches(21, exec17), false);
  });

  it('returns false when java is missing', async () => {
    assert.equal(await java.systemJavaMatches(17, async () => { throw new Error('ENOENT'); }), false);
  });
});

describe('getJavaPath', () => {
  it('prefers the managed JDK without probing the system', async () => {
    const bin = path.join(tmp, 'java', 'jdk17', 'temurin', 'bin');
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, 'java.exe'), 'fake');
    const res = await java.getJavaPath(tmp, 17);
    assert.equal(res.needsDownload, false);
    assert.ok(res.javaPath.endsWith('java.exe'));
  });

  it('requests a download when nothing usable exists', async () => {
    // Version 999 can never match a real system Java.
    const res = await java.getJavaPath(tmp, 999);
    assert.equal(res.javaPath, 'java');
    assert.equal(res.needsDownload, true);
  });
});

describe('JDK checksum', () => {
  it('parses the Adoptium sidecar hash (hash-first format)', async () => {
    const axiosPath = require.resolve('axios');
    const orig = require.cache[axiosPath];
    const want = 'a'.repeat(64);
    require.cache[axiosPath] = {
      id: axiosPath, filename: axiosPath, loaded: true,
      exports: { get: async (url) => {
        assert.match(url, /\.sha256\.txt$/);
        if (String(url).includes('/binary')) {
          return { data: `${want}  OpenJDK17U-jdk_x64_windows_hotspot_17.0.9_9.zip\n` };
        }
        return { data: 'not-a-hash\n' };
      } },
    };
    try {
      delete require.cache[require.resolve('../electron/java')];
      // eslint-disable-next-line global-require
      const fresh = require('../electron/java');
      assert.equal(await fresh.fetchAdoptiumChecksum('https://x/binary'), want);
      await assert.rejects(fresh.fetchAdoptiumChecksum('https://x/other'), /not a SHA-256/);
    } finally {
      if (orig) require.cache[axiosPath] = orig;
      else delete require.cache[axiosPath];
    }
  });

  it('hashes files with sha256', async () => {
    const file = path.join(tmp, 'blob.bin');
    fs.writeFileSync(file, 'proc-launcher-checksum-fixture');
    const expected = crypto.createHash('sha256').update('proc-launcher-checksum-fixture').digest('hex');
    assert.equal(await java.sha256File(file), expected);
  });
});
