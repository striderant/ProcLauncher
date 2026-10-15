const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const instances = require('../electron/instances');

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'proc-inst-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('instances', () => {
  it('creates slugged instances and lists them', () => {
    const a = instances.createInstance(root, { name: 'My Pack!', icon: 'Grass', minecraft_version: '1.20.1' });
    assert.equal(a.id, 'my-pack');
    assert.equal(a.loader_type, 'fabric');
    assert.deepEqual(a.mods, {});
    assert.ok(fs.existsSync(path.join(root, 'instances', 'my-pack', 'instance.json')));
    assert.ok(fs.existsSync(path.join(root, 'instances', 'my-pack', 'mods')));
    const list = instances.listInstances(root);
    assert.equal(list.length, 1);
    assert.equal(list[0].modCount, 0);
  });

  it('dedupes slugs', () => {
    instances.createInstance(root, { name: 'Pack', minecraft_version: '1.20.1' });
    const b = instances.createInstance(root, { name: 'Pack', minecraft_version: '1.20.1' });
    assert.equal(b.id, 'pack-2');
  });

  it('rejects bad input', () => {
    assert.throws(() => instances.createInstance(root, { name: '', minecraft_version: '1.20.1' }), /name is required/);
    assert.throws(() => instances.createInstance(root, { name: 'X', minecraft_version: '' }), /Minecraft version is required/);
    assert.throws(() => instances.getInstance(root, 'nope'), /not found/);
  });

  it('updates allowlisted fields and clears the loader pin on MC change', () => {
    const a = instances.createInstance(root, { name: 'A', minecraft_version: '1.20.1' });
    const updated = instances.updateInstance(root, a.id, {
      name: 'B', loader_version: '0.16.14', fabric_profile_id: 'x', nope: 1,
    });
    assert.equal(updated.name, 'B');
    assert.equal(updated.loader_version, '0.16.14');
    assert.equal(updated.fabric_profile_id, 'x');
    assert.ok(!('nope' in updated));
    const afterMc = instances.updateInstance(root, a.id, { minecraft_version: '1.21' });
    assert.equal(afterMc.loader_version, '');
    assert.equal(afterMc.fabric_profile_id, '');
  });

  it('registers mods and toggles them on disk', () => {
    const a = instances.createInstance(root, { name: 'A', minecraft_version: '1.20.1' });
    const modsDir = path.join(root, 'instances', a.id, 'mods');
    fs.writeFileSync(path.join(modsDir, 'sodium.jar'), 'fake');
    instances.registerMod(root, a.id, { filename: 'sodium.jar', project_id: 'P1', version_id: 'v1', version_number: '1.0' });
    let mods = instances.getMods(root, a.id);
    assert.equal(mods.length, 1);
    assert.equal(mods[0].enabled, true);
    assert.deepEqual(instances.getInstance(root, a.id).modrinth_project_ids, ['P1']);

    instances.setModEnabled(root, a.id, 'sodium.jar', false);
    assert.ok(fs.existsSync(path.join(modsDir, 'sodium.jar.disabled')));
    assert.ok(!fs.existsSync(path.join(modsDir, 'sodium.jar')));
    assert.equal(instances.getMods(root, a.id)[0].enabled, false);

    instances.enforceModStates(root, a.id);
    assert.ok(fs.existsSync(path.join(modsDir, 'sodium.jar.disabled')));

    instances.deleteMod(root, a.id, 'sodium.jar');
    assert.deepEqual(instances.getMods(root, a.id), []);
  });

  it('syncs untracked jars from disk and prunes missing records', () => {
    const a = instances.createInstance(root, { name: 'A', minecraft_version: '1.20.1' });
    const modsDir = path.join(root, 'instances', a.id, 'mods');
    fs.writeFileSync(path.join(modsDir, 'manual.jar'), 'x');
    fs.writeFileSync(path.join(modsDir, 'off.jar.disabled'), 'x');
    fs.writeFileSync(path.join(modsDir, 'notes.txt'), 'x');
    const mods = instances.getMods(root, a.id);
    assert.equal(mods.length, 2);
    assert.equal(mods.find(m => m.filename === 'manual.jar').enabled, true);
    assert.equal(mods.find(m => m.filename === 'off.jar').enabled, false);
    assert.equal(mods.find(m => m.filename === 'manual.jar').project_id, null);
  });

  it('offers disabled jars in the local library and copies them back enabled', () => {
    const a = instances.createInstance(root, { name: 'A', minecraft_version: '1.20.1' });
    const b = instances.createInstance(root, { name: 'B', minecraft_version: '1.20.1' });
    const modsA = path.join(root, 'instances', a.id, 'mods');
    fs.writeFileSync(path.join(modsA, 'off.jar'), 'x');
    instances.registerMod(root, a.id, { filename: 'off.jar', project_id: 'P9', version_id: 'v9', version_number: '9.0' });
    instances.setModEnabled(root, a.id, 'off.jar', false);
    const lib = instances.listLocalMods(root);
    const entry = lib.find(m => m.filename === 'off.jar');
    assert.ok(entry, 'disabled jar is listed');
    assert.equal(entry.project_id, 'P9');
    const added = instances.addLocalMod(root, b.id, { filename: 'off.jar', sourceInstanceId: a.id });
    assert.equal(added.added, true);
    assert.ok(fs.existsSync(path.join(root, 'instances', b.id, 'mods', 'off.jar')));
    assert.equal(instances.getInstance(root, b.id).mods['off.jar'].project_id, 'P9');
  });

  it('classifies mods for a target version', () => {
    const { classifyModForTarget } = instances;
    assert.deepEqual(
      classifyModForTarget('local.jar', { project_id: null, version_id: null, version_number: null }, null, null, '1.21'),
      { filename: 'local.jar', project_id: null, current_version: 'unknown', status: 'local' }
    );
    assert.deepEqual(
      classifyModForTarget('a.jar', { project_id: 'P', version_id: 'v1', version_number: '1.0' }, null, null, '1.21'),
      { filename: 'a.jar', project_id: 'P', current_version: '1.0', status: 'failed', error: 'No build for 1.21' }
    );
    assert.deepEqual(
      classifyModForTarget('a.jar', { project_id: 'P', version_id: 'v1' }, null, 'boom', '1.21').status,
      'failed'
    );
    assert.deepEqual(
      classifyModForTarget('a.jar', { project_id: 'P', version_id: 'v1' }, { id: 'v1' }, null, '1.21').status,
      'kept'
    );
    assert.deepEqual(
      classifyModForTarget('a.jar', { project_id: 'P', version_id: 'v1' }, { id: 'v2', version_number: '2.0' }, null, '1.21'),
      { filename: 'a.jar', project_id: 'P', current_version: 'v1', status: 'updatable', latest_version: '2.0', latest_version_id: 'v2' }
    );
  });

  it('copies mod files between instances including disabled variants', () => {
    const a = instances.createInstance(root, { name: 'A', minecraft_version: '1.20.1' });
    const b = instances.createInstance(root, { name: 'B', minecraft_version: '1.20.1' });
    const modsA = path.join(root, 'instances', a.id, 'mods');
    fs.writeFileSync(path.join(modsA, 'x.jar'), 'x');
    fs.writeFileSync(path.join(modsA, 'y.jar.disabled'), 'y');
    assert.equal(instances.copyModFile(root, a.id, b.id, 'x.jar'), 'x.jar');
    assert.ok(fs.existsSync(path.join(root, 'instances', b.id, 'mods', 'x.jar')));
    assert.equal(instances.copyModFile(root, a.id, b.id, 'y.jar'), 'y.jar');
    assert.ok(fs.existsSync(path.join(root, 'instances', b.id, 'mods', 'y.jar')));
    assert.throws(() => instances.copyModFile(root, a.id, b.id, 'ghost.jar'), /not found/);
    assert.throws(() => instances.copyModFile(root, a.id, b.id, 'notes.txt'), /Only .jar/);
  });

  it('selects and deletes with selection fallback', () => {
    const a = instances.createInstance(root, { name: 'A', minecraft_version: '1.20.1' });
    const b = instances.createInstance(root, { name: 'B', minecraft_version: '1.20.1' });
    assert.equal(instances.getSelectedId(root), null);
    instances.setSelectedId(root, a.id);
    assert.equal(instances.getSelectedId(root), a.id);
    const res = instances.deleteInstance(root, a.id);
    assert.equal(res.deleted, a.id);
    assert.equal(instances.getSelectedId(root), b.id);
    assert.throws(() => instances.setSelectedId(root, 'ghost'), /not found/);
  });

  it('migrates legacy mods once into a Default instance', () => {
    fs.mkdirSync(path.join(root, 'mods'), { recursive: true });
    fs.writeFileSync(path.join(root, 'mods', 'old.jar'), 'x');
    fs.mkdirSync(path.join(root, 'versions', 'fabric-loader-0.16.14-1.20.1'), { recursive: true });
    const first = instances.migrateLegacyMods(root, '1.20.1');
    assert.equal(first.migrated, true);
    assert.ok(!fs.existsSync(path.join(root, 'mods', 'old.jar')));
    assert.ok(fs.existsSync(path.join(root, 'instances', first.instanceId, 'mods', 'old.jar')));
    assert.equal(instances.getSelectedId(root), first.instanceId);
    const second = instances.migrateLegacyMods(root, '1.20.1');
    assert.equal(second.migrated, false);
  });
});
