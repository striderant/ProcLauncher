// Unit: self-update engine event mapping (electron-updater -> renderer
// states) with a stubbed autoUpdater. No network, no Electron needed.
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let updaterModule;
let harness;

function makeHarness(updateChannel = 'beta', packaged = true) {
  const sent = [];
  const listeners = {};
  const calls = { check: 0, download: 0 };
  const fakeAU = {
    autoDownload: true,
    allowPrerelease: false,
    logger: null,
    installedArgs: null,
    on: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    checkForUpdates: async () => { calls.check++; return {}; },
    downloadUpdate: async () => { calls.download++; return ['/tmp/setup.exe']; },
    quitAndInstall: (...args) => { fakeAU.installedArgs = args; },
  };
  const updaterPath = require.resolve('electron-updater');
  require.cache[updaterPath] = {
    id: updaterPath, filename: updaterPath, loaded: true,
    exports: { autoUpdater: fakeAU },
  };
  const logs = [];
  const updater = updaterModule.createUpdater({
    app: { isPackaged: packaged, getPath: () => '/tmp/userdata' },
    getPrefs: () => ({ updateChannel }),
    logger: {
      info: (m) => logs.push(['info', m]),
      warn: (m) => logs.push(['warn', m]),
      error: (m) => logs.push(['error', m]),
      debug: () => {},
    },
    send: (msg) => sent.push(msg),
  });
  return { sent, listeners, fakeAU, calls, logs, updater };
}

function fire(listeners, ev, payload) {
  for (const fn of listeners[ev] || []) fn(payload);
}

before(() => {
  // eslint-disable-next-line global-require
  updaterModule = require('../electron/updater');
});

describe('update event mapping', () => {
  it('forwards available with version', () => {
    const h = makeHarness();
    h.updater.checkForUpdates();
    fire(h.listeners, 'update-available', { version: '0.2.0' });
    assert.deepEqual(h.sent[h.sent.length - 1], { state: 'available', version: '0.2.0' });
  });

  it('forwards download progress rounded with pending version', () => {
    const h = makeHarness();
    h.updater.checkForUpdates();
    fire(h.listeners, 'update-available', { version: '0.2.0' });
    fire(h.listeners, 'download-progress', { percent: 42.6 });
    assert.deepEqual(h.sent[h.sent.length - 1], { state: 'downloading', percent: 43, version: '0.2.0' });
  });

  it('forwards downloaded and not-available', () => {
    const h = makeHarness();
    h.updater.checkForUpdates();
    fire(h.listeners, 'update-downloaded', { version: '0.2.0' });
    assert.deepEqual(h.sent[h.sent.length - 1], { state: 'downloaded', version: '0.2.0' });
    fire(h.listeners, 'update-not-available', {});
    assert.deepEqual(h.sent[h.sent.length - 1], { state: 'none' });
  });

  it('forwards errors with messages', () => {
    const h = makeHarness();
    h.updater.checkForUpdates();
    fire(h.listeners, 'error', new Error('net down'));
    assert.deepEqual(h.sent[h.sent.length - 1], { state: 'error', error: 'net down' });
  });

  it('wires listeners once across repeated checks', () => {
    const h = makeHarness();
    h.updater.checkForUpdates();
    h.updater.checkForUpdates();
    assert.equal(h.listeners['update-available'].length, 1);
    assert.equal(h.calls.check, 2);
  });
});

describe('channel + config', () => {
  it('forces manual download and follows the beta channel', () => {
    const h = makeHarness('beta');
    h.updater.checkForUpdates();
    assert.equal(h.fakeAU.autoDownload, false);
    assert.equal(h.fakeAU.allowPrerelease, true);
    assert.ok(h.fakeAU.logger);
  });

  it('disables prereleases on stable', () => {
    const h = makeHarness('stable');
    h.updater.checkForUpdates();
    assert.equal(h.fakeAU.allowPrerelease, false);
  });
});

describe('dev gates', () => {
  it('skips checks outside packaged builds', () => {
    const h = makeHarness('stable', false);
    assert.deepEqual(h.updater.checkForUpdates(), { checked: false });
    assert.equal(h.calls.check, 0);
  });

  it('rejects download/install outside packaged builds', async () => {
    const h = makeHarness('stable', false);
    await assert.rejects(h.updater.downloadUpdate(), /packaged/);
    assert.throws(() => h.updater.installUpdate(), /packaged/);
  });

  it('installs via quitAndInstall when packaged', async () => {
    const h = makeHarness('stable', true);
    assert.deepEqual(h.updater.installUpdate(), { installing: true });
    assert.deepEqual(h.fakeAU.installedArgs, [false, true]);
  });
});
