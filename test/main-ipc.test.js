// Integration: loads the real electron/main.js with a stubbed Electron runtime
// and drives IPC handlers against a temp userData dir. Catches wiring regressions
// (missing imports, unregistered channels) that syntax checks cannot.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

let userData;
let handlers;
let events;

function makeWindow() {
  return {
    on() {}, minimize() {}, maximize() {}, unmaximize() {}, isMaximized: () => false,
    close() {}, hide() {}, show() {}, focus() {}, isVisible: () => true,
    loadFile: async () => {}, loadURL: async () => {},
    webContents: { send: () => {}, on: () => {}, openDevTools: () => {} },
  };
}

before(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'proc-main-'));
  handlers = {};
  events = {};
  const fakeElectron = {
    app: {
      isPackaged: false,
      getVersion: () => '1.0.0-test',
      getPath: (name) => (name === 'userData' ? userData : path.join(userData, name)),
      whenReady: () => Promise.resolve(),
      on: () => {},
      quit: () => {},
    },
    BrowserWindow: function () { return makeWindow(); },
    ipcMain: {
      handle: (channel, fn) => {
        if (handlers[channel]) throw new Error(`double handler: ${channel}`);
        handlers[channel] = fn;
      },
      on: (channel, fn) => { events[channel] = fn; },
    },
    safeStorage: { isEncryptionAvailable: () => false },
    shell: { openPath: async () => '' },
    nativeImage: { createFromBuffer: () => ({}) },
    Menu: { buildFromTemplate: () => ({}) },
  };
  const electronPath = require.resolve('electron');
  require.cache[electronPath] = { id: electronPath, filename: electronPath, loaded: true, exports: fakeElectron };
  // eslint-disable-next-line global-require
  require('../electron/main.js');
});

after(() => {
  try { require('../electron/logger').closeLogger(); } catch {}
  fs.rmSync(userData, { recursive: true, force: true });
});

const invoke = (channel, ...args) => handlers[channel]({ sender: { send: () => {}, isDestroyed: () => true } }, ...args);

describe('main process wiring', () => {
  it('registers every channel the preload bridge exposes', () => {
    for (const channel of [
      'accounts:list', 'accounts:getSelected', 'accounts:createOffline',
      'accounts:select', 'accounts:remove',
      'accounts:startMicrosoftLogin', 'accounts:refreshMicrosoft', 'accounts:cancelMicrosoftLogin',
      'instance:list', 'instance:get', 'instance:getSelected', 'instance:create',
      'instance:update', 'instance:delete', 'instance:select', 'instance:getMods',
      'instance:setModEnabled', 'instance:deleteMod',
      'instance:checkModUpdates', 'instance:updateMod',
      'instance:openModsFolder', 'instance:planUpgrade', 'instance:upgradeInstance',
      'instance:listLocalMods', 'instance:addLocalMod',
      'get-installed-versions', 'fetch-all-vanilla-versions',
      'install-modrinth-version', 'launch-game', 'cancel-launch',
      'open-game-folder', 'open-versions-folder', 'open-mods-folder',
      'launcher:getPrefs', 'launcher:setPrefs', 'launcher:getVersion',
      'launcher:check-for-updates', 'launcher:download-update', 'launcher:install-update',
    ]) {
      assert.equal(typeof handlers[channel], 'function', `missing handler: ${channel}`);
    }
  });

  it('creates, lists and selects offline accounts', async () => {
    const created = await invoke('accounts:createOffline', 'Steve');
    assert.ok(created.id);
    assert.equal(created.username, 'Steve');
    const list = await invoke('accounts:list');
    assert.equal(list.length, 1);
    const selected = await invoke('accounts:getSelected');
    assert.equal(selected.id, created.id);
  });

  it('runs the instance lifecycle end to end', async () => {
    const created = (await invoke('instance:create', { name: 'Pack', minecraft_version: '1.20.1' })).data;
    assert.equal(created.id, 'pack');
    const list = (await invoke('instance:list')).data;
    // Startup migration seeds an empty Default instance alongside.
    assert.equal(list.length, 2);
    assert.ok(list.some(i => i.id === 'pack'));
    assert.ok(list.some(i => i.id === 'default'));
    const sel = (await invoke('instance:select', 'pack')).data;
    assert.equal(sel, 'pack');
    const modsDir = path.join(userData, 'minecraft', 'instances', 'pack', 'mods');
    fs.mkdirSync(modsDir, { recursive: true });
    fs.writeFileSync(path.join(modsDir, 'a.jar'), 'x');
    const mods = (await invoke('instance:getMods', 'pack')).data;
    assert.equal(mods.length, 1);
    const toggled = (await invoke('instance:setModEnabled', 'pack', 'a.jar', false)).data;
    assert.equal(toggled.enabled, false);
    const lib = (await invoke('instance:listLocalMods')).data;
    assert.ok(lib.some(m => m.filename === 'a.jar'));
    const deleted = (await invoke('instance:delete', 'pack')).data;
    assert.equal(deleted.deleted, 'pack');
  });

  it('validates upgrade plans without network', async () => {
    const created = (await invoke('instance:create', { name: 'Up', minecraft_version: '1.20.1' })).data;
    const same = await invoke('instance:planUpgrade', created.id, '1.20.1');
    assert.equal(same.success, false);
    assert.match(same.error, /same as the current/);
    const missing = await invoke('instance:planUpgrade', 'ghost', '1.21');
    assert.equal(missing.success, false);
    const noTarget = await invoke('instance:upgradeInstance', { sourceId: created.id });
    assert.equal(noTarget.success, false);
  });

  it('rejects launches without options', async () => {
    const missing = await invoke('launch-game', null);
    assert.equal(missing.success, false);
  });

  it('cancel with no game running reports stopped:false', async () => {
    const res = await invoke('cancel-launch');
    assert.deepEqual(res, { success: true, stopped: false });
  });

  it('lists installed versions on an empty root', async () => {
    const res = await invoke('get-installed-versions');
    assert.equal(res.success, true);
    assert.deepEqual(res.versions, []);
  });

  it('round-trips launcher prefs', async () => {
    const next = await invoke('launcher:setPrefs', { uiMode: 'classic' });
    assert.equal(next.uiMode, 'classic');
    assert.equal(next.closeBehavior, 'quit');
    const back = await invoke('launcher:getPrefs');
    assert.equal(back.uiMode, 'classic');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(userData, 'launcher.json'), 'utf8')).uiMode, 'classic');
  });

  it('opens folders and reports failures', async () => {
    const ok = await invoke('open-game-folder');
    assert.equal(ok.success, true);
    const electronStub = require('electron');
    const origOpen = electronStub.shell.openPath;
    electronStub.shell.openPath = async () => 'EPERM: operation not permitted';
    try {
      const bad = await invoke('open-mods-folder');
      assert.equal(bad.success, false);
      assert.match(bad.error, /EPERM/);
    } finally {
      electronStub.shell.openPath = origOpen;
    }
  });

  it('reports the app version', async () => {
    assert.equal(await invoke('launcher:getVersion'), '1.0.0-test');
  });

  it('gates self-update behind packaged builds in dev', async () => {
    assert.deepEqual(await invoke('launcher:check-for-updates'), { checked: false });
    await assert.rejects(invoke('launcher:download-update'), /packaged/);
    await assert.rejects(invoke('launcher:install-update'), /packaged/);
  });

  it('fails Microsoft login fast when credential storage is unavailable', async () => {
    await assert.rejects(
      invoke('accounts:startMicrosoftLogin'),
      /credential storage/,
    );
  });

  it('discards a late Microsoft login result after cancel', async () => {
    const electronStub = require('electron');
    const msAuth = require('../electron/accounts/microsoftAuth');
    const origLogin = msAuth.startMicrosoftLogin;
    const origAvailable = electronStub.safeStorage.isEncryptionAvailable;
    electronStub.safeStorage.isEncryptionAvailable = () => true;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    msAuth.startMicrosoftLogin = () => gate;
    try {
      const pending = invoke('accounts:startMicrosoftLogin');
      await invoke('accounts:cancelMicrosoftLogin');
      release({ profile: { id: 'abc', name: 'Late' }, tokens: { authCache: {} } });
      assert.deepEqual(await pending, { cancelled: true });
      const list = await invoke('accounts:list');
      assert.ok(!list.some(a => a.username === 'Late'), 'cancelled login must not save an account');
    } finally {
      msAuth.startMicrosoftLogin = origLogin;
      electronStub.safeStorage.isEncryptionAvailable = origAvailable;
    }
  });
});
