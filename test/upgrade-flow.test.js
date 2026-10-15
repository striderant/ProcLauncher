// Integration: full instance-upgrade flow through the real main.js IPC
// handlers with stubbed Electron + stubbed Modrinth API.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

let userData;
let handlers;

const MODRINTH = {
  // project P1: v1 works on 1.20.1, v2 works on 1.21
  P1: {
    '1.20.1': [{ id: 'v1', version_number: '1.0', files: [{ primary: true, url: 'http://x/v1.jar', filename: 'm1-1.0.jar' }] }],
    '1.21': [{ id: 'v2', version_number: '2.0', files: [{ primary: true, url: 'http://x/v2.jar', filename: 'm1-2.0.jar' }] }],
  },
  // project P2: only ever built for 1.20.1
  P2: {
    '1.20.1': [{ id: 'w1', version_number: '1.0', files: [{ primary: true, url: 'http://x/w1.jar', filename: 'm2-1.0.jar' }] }],
    '1.21': [],
  },
};

function fakeAxiosGet(url, opts) {
  const m = String(url).match(/\/project\/([^/]+)\/version/);
  if (!m) throw new Error(`unexpected url ${url}`);
  const gameVersions = JSON.parse(opts?.params?.game_versions || '[]');
  const mc = gameVersions[0];
  const list = (MODRINTH[m[1]] || {})[mc] || [];
  return Promise.resolve({ data: list });
}

before(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'proc-up-'));
  handlers = {};
  // Stub network BEFORE main.js loads so destructured imports bind to fakes.
  const axiosPath = require.resolve('axios');
  const fakeAxios = (cfg) => fakeAxiosGet(cfg.url, cfg);
  fakeAxios.get = fakeAxiosGet;
  fakeAxios.create = () => fakeAxios;
  require.cache[axiosPath] = { id: axiosPath, filename: axiosPath, loaded: true, exports: fakeAxios };
  const downloads = require('../electron/downloads');
  const AdmZipSeed = require('adm-zip');
  downloads.streamDownload = async (_url, destPath) => {
    const zip = new AdmZipSeed();
    zip.addFile('META-INF/MANIFEST.MF', Buffer.from('Manifest-Version: 1.0\n'));
    zip.writeZip(destPath);
  };
  const fakeElectron = {
    app: {
      isPackaged: false,
      getPath: (name) => (name === 'userData' ? userData : path.join(userData, name)),
      whenReady: () => Promise.resolve(),
      on: () => {},
      quit: () => {},
    },
    BrowserWindow: function () {
      return {
        on() {}, minimize() {}, maximize() {}, unmaximize() {}, isMaximized: () => false,
        close() {}, hide() {}, show() {}, focus() {}, isVisible: () => true,
        loadFile: async () => {}, loadURL: async () => {},
        webContents: { send: () => {}, on: () => {}, openDevTools: () => {} },
      };
    },
    ipcMain: {
      handle: (channel, fn) => { handlers[channel] = fn; },
      on: () => {},
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

const invoke = (channel, ...args) => handlers[channel]({ sender: { send: () => {} } }, ...args);

describe('instance upgrade flow', () => {
  it('plans, executes and summarizes an upgrade', async () => {
    const created = (await invoke('instance:create', { name: 'Pack', minecraft_version: '1.20.1' })).data;
    const modsDir = path.join(userData, 'minecraft', 'instances', created.id, 'mods');
    const AdmZip = require('adm-zip');
    const mkjar = (p) => {
      const zip = new AdmZip();
      zip.addFile('a.txt', Buffer.from('x'));
      zip.writeZip(p);
    };
    mkjar(path.join(modsDir, 'm1.jar'));
    mkjar(path.join(modsDir, 'm2.jar'));
    mkjar(path.join(modsDir, 'plain.jar'));
    const { registerMod } = require('../electron/instances');
    const root = path.join(userData, 'minecraft');
    registerMod(root, created.id, { filename: 'm1.jar', project_id: 'P1', version_id: 'v1', version_number: '1.0' });
    registerMod(root, created.id, { filename: 'm2.jar', project_id: 'P2', version_id: 'w1', version_number: '1.0' });

    const plan = (await invoke('instance:planUpgrade', created.id, '1.21')).data;
    assert.equal(plan.targetMc, '1.21');
    const byFile = Object.fromEntries(plan.mods.map(m => [m.filename, m.status]));
    assert.equal(byFile['m1.jar'], 'updatable');
    assert.equal(byFile['m2.jar'], 'failed');
    assert.equal(byFile['plain.jar'], 'local');

    const done = (await invoke('instance:upgradeInstance', {
      sourceId: created.id,
      name: 'Pack 1.21',
      minecraft_version: '1.21',
      downloads: ['P1'],
    })).data;
    assert.ok(done.instance);
    assert.notEqual(done.instance.id, created.id);
    assert.equal(done.instance.minecraft_version, '1.21');
    assert.deepEqual(done.summary.updated, ['m1-2.0.jar']);
    assert.ok(done.summary.failed.some(f => String(f).startsWith('m2.jar')));
    assert.deepEqual(done.summary.local, ['plain.jar']);

    const cloneMods = (await invoke('instance:getMods', done.instance.id)).data;
    const names = cloneMods.map(m => m.filename).sort();
    assert.deepEqual(names, ['m1-2.0.jar', 'm2.jar', 'plain.jar']);
    assert.equal(cloneMods.find(m => m.filename === 'm2.jar').enabled, false);
    assert.equal(cloneMods.find(m => m.filename === 'm1-2.0.jar').enabled, true);
    // Source instance untouched.
    const srcMods = (await invoke('instance:getMods', created.id)).data;
    assert.equal(srcMods.length, 3);
  });
});
