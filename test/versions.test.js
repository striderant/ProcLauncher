const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  pushUniqueLibraries,
  mergeArgumentGroup,
  findVersionJsonPath,
  readVersionJson,
  resolveVersionInheritance,
  listInstalledVersions,
} = require('../electron/versions');

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'proc-ver-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeVersion(dirId, json) {
  const dir = path.join(root, 'versions', dirId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${dirId}.json`), JSON.stringify(json));
}

describe('versions', () => {
  it('dedupes libraries by name, child wins', () => {
    const target = [{ name: 'a', url: 'old' }];
    pushUniqueLibraries(target, [{ name: 'a', url: 'new' }, { name: 'b' }, { noName: true }]);
    assert.deepEqual(target, [{ name: 'a', url: 'new' }, { name: 'b' }, { noName: true }]);
  });

  it('merges argument groups, ignoring non-arrays', () => {
    assert.deepEqual(mergeArgumentGroup(['a'], ['b', 'c']), ['a', 'b', 'c']);
    assert.deepEqual(mergeArgumentGroup(['a'], 'single'), ['a']);
    assert.deepEqual(mergeArgumentGroup(null, undefined), []);
  });

  it('finds version json by id or falls back to first json', () => {
    writeVersion('1.20.1', { id: '1.20.1' });
    const dir = path.join(root, 'versions', '1.20.1');
    assert.ok(findVersionJsonPath(dir, '1.20.1').endsWith('1.20.1.json'));
    assert.equal(findVersionJsonPath(dir, 'missing'), path.join(dir, '1.20.1.json'));
    assert.equal(findVersionJsonPath(path.join(root, 'versions', 'nope')), null);
    const read = readVersionJson(dir, '1.20.1');
    assert.equal(read.json.id, '1.20.1');
  });

  it('merges parent inheritance with child winning', async () => {
    writeVersion('1.20.1', {
      id: '1.20.1', mainClass: 'net.minecraft.client.main.Main',
      assets: '5', libraries: [{ name: 'base-lib' }],
    });
    writeVersion('fabric-loader-0.16.14-1.20.1', {
      id: 'fabric-loader-0.16.14-1.20.1', inheritsFrom: '1.20.1',
      mainClass: 'net.fabricmc.devlaunchinjector.Main',
      libraries: [{ name: 'fabric-lib' }],
    });
    const merged = await resolveVersionInheritance('fabric-loader-0.16.14-1.20.1', root, null);
    assert.equal(merged.mainClass, 'net.fabricmc.devlaunchinjector.Main');
    assert.deepEqual(merged.libraries.map(l => l.name).sort(), ['base-lib', 'fabric-lib']);
    assert.equal(merged._baseVersion, '1.20.1');
  });

  it('lists installed versions and jar-only folders', () => {
    writeVersion('1.20.1', { id: '1.20.1' });
    const jarOnly = path.join(root, 'versions', 'custom');
    fs.mkdirSync(jarOnly, { recursive: true });
    fs.writeFileSync(path.join(jarOnly, 'custom.jar'), 'x');
    const { versions, jarOnlyVersions, locations } = listInstalledVersions(root);
    assert.deepEqual(versions.sort(), ['1.20.1', 'custom']);
    assert.deepEqual(jarOnlyVersions, ['custom']);
    assert.equal(locations['1.20.1'], 'local');
    assert.deepEqual(
      listInstalledVersions(path.join(root, 'empty')),
      { versions: [], jarOnlyVersions: [], locations: {} }
    );
  });

  it('merges an extra versions dir with first-source-wins locations', () => {
    writeVersion('shared', { id: 'shared' });
    const extra = path.join(root, 'other-versions');
    const dupDir = path.join(extra, 'shared');
    const extDir = path.join(extra, 'external');
    fs.mkdirSync(dupDir, { recursive: true });
    fs.writeFileSync(path.join(dupDir, 'shared.json'), JSON.stringify({ id: 'shared' }));
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(path.join(extDir, 'external.json'), JSON.stringify({ id: 'external' }));
    const { versions, locations } = listInstalledVersions(root, [extra]);
    assert.deepEqual(versions.sort(), ['external', 'shared']);
    assert.equal(locations['shared'], 'local');
    assert.equal(locations['external'], 'vanilla');
  });
});
