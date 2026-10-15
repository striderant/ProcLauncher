// Polyfills for libraries that expect browser globals in the Electron main process
if (typeof global.Blob === 'undefined') {
  global.Blob = class Blob {
    constructor(parts = [], options = {}) {
      this.parts = parts;
      this.type = options.type ?? '';
      this.size = parts.reduce((acc, part) => acc + (part.length ?? 0), 0);
    }
  };
}

if (typeof global.File === 'undefined') {
  global.File = class File extends global.Blob {
    constructor(parts, filename, options = {}) {
      super(parts, options);
      this.name = filename;
      this.lastModified = options.lastModified ?? Date.now();
    }
  };
}

const { app, BrowserWindow, ipcMain, safeStorage, shell, Tray, Menu, nativeImage } = require('electron');
const { getPrefs, setPrefs } = require('./prefs');
const { buildTrayPng, buildAppIconPng } = require('./trayIcon');
const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const { AccountStore } = require('./accounts/accountStore');
const msAuth = require('./accounts/microsoftAuth');
const { classifyAuthError, isSessionError } = msAuth;
const instances = require('./instances');
const { mapLimit } = require('./concurrent');
const logger = require('./logger');
const { streamDownload, validateJar } = require('./downloads');
const { fetchVersionManifest, findVersionJsonPath, resolveVersionInheritance, installFabric, listInstalledVersions } = require('./versions');
const { launchCustomClient, installModrinthVersion, safeModFileName, requestCancelLaunch, resetLaunchCancelled, isLaunchCancelled, isLaunchInFlight } = require('./launch');

let mainWindow = null;
let accountStore = null;
// Bumped by accounts:cancelMicrosoftLogin so a late device-flow result is
// discarded instead of saving an account the user already walked away from.
let msAuthEpoch = 0;

// --- Window Lifecycle & Framework Initialization ---

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0a0a0a',
    icon: nativeImage.createFromBuffer(buildAppIconPng(64)),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  win.on('close', (event) => {
    if (!isQuitting && getPrefs(app.getPath('userData')).closeBehavior === 'tray') {
      event.preventDefault();
      win.hide();
    }
  });

  // In development, Vite sets ELECTRON_RENDERER_URL to the dev server URL
  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  const isDev = !app.isPackaged && !!rendererUrl;
  const distPath = path.join(__dirname, '../dist/index.html');

  if (isDev) {
    // DevTools only when explicitly requested (npm run start:debug)
    if (process.env.DEBUG_LAUNCHER === 'true') {
      win.webContents.openDevTools();
    }

    // Retry inside Chromium until Vite has finished binding the port
    // (fixes ERR_CONNECTION_REFUSED race when Electron starts first)
    const maxAttempts = 60;
    let attempts = 0;
    const tryLoad = () => {
      attempts += 1;
      console.log(`[DevServer] Loading ${rendererUrl} (attempt ${attempts})...`);
      win.loadURL(rendererUrl);
    };
    win.webContents.on('did-fail-load', (_event, code, desc) => {
      if (code === -102 && attempts < maxAttempts) { // -102 = ERR_CONNECTION_REFUSED
        setTimeout(tryLoad, 500);
      } else if (attempts >= maxAttempts) {
        console.log(`[DevServer] Giving up after ${attempts} attempts: ${desc}`);
      }
    });
    tryLoad();
  } else {
    win.loadFile(distPath);
  }
  ipcMain.on('window-minimize', () => win.minimize());
  ipcMain.on('window-maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
  ipcMain.on('window-close', () => win.close());
  // shell.openPath resolves to '' on success or an error string - always
  // awaited and surfaced so a failure never vanishes silently.
  const openFolderShell = async (dir, label) => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const err = await shell.openPath(dir);
      if (err) throw new Error(err);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message || `Could not open ${label}` };
    }
  };
  ipcMain.handle('open-game-folder', async () => {
    const rootPath = path.join(app.getPath('userData'), 'minecraft');
    return openFolderShell(rootPath, 'game folder');
  });
  ipcMain.handle('open-versions-folder', async () => {
    const versionsPath = path.join(vanillaMinecraftRoot(), 'versions');
    return openFolderShell(versionsPath, 'versions folder');
  });
  ipcMain.handle('open-mods-folder', async () => {
    const libraryDir = path.join(minecraftRoot(), 'mods');
    return openFolderShell(libraryDir, 'mods library');
  });
  ipcMain.handle('instance:openModsFolder', async (_event, id) => {
    try {
      const root = minecraftRoot();
      const record = instances.getInstance(root, id);
      const modsDir = instances.ensureModsDir(instances.getInstanceDir(root, record.id));
      const err = await shell.openPath(modsDir);
      if (err) throw new Error(err);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message || 'Could not open mods folder' };
    }
  });
}

function sendMicrosoftStatus(event, message) {
  if (!event.sender.isDestroyed()) event.sender.send('accounts:microsoftStatus', message);
}

function sendMicrosoftCode(event, code) {
  if (!event.sender.isDestroyed()) event.sender.send('accounts:microsoftCode', code);
}

let tray = null;
let isQuitting = false;

function applyTrayMode() {
  const wantsTray = getPrefs(app.getPath('userData')).closeBehavior === 'tray';
  if (wantsTray && !tray) {
    const icon = nativeImage.createFromBuffer(buildTrayPng());
    tray = new Tray(icon);
    tray.setToolTip('Proc Launcher');
    tray.setContextMenu(Menu.buildFromTemplate([
      {
        label: 'Show',
        click: () => { mainWindow?.show(); mainWindow?.focus(); },
      },
      {
        label: 'Check for updates',
        click: () => getUpdater().checkForUpdates(true),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => { isQuitting = true; app.quit(); },
      },
    ]));
    tray.on('click', () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) mainWindow.hide();
      else { mainWindow.show(); mainWindow.focus(); }
    });
    logger.info('Minimize-to-tray enabled.');
  } else if (!wantsTray && tray) {
    try { tray.destroy(); } catch {}
    tray = null;
    logger.info('Minimize-to-tray disabled.');
  }
}

function registerPrefsIpc() {
  ipcMain.handle('launcher:getPrefs', () => getPrefs(app.getPath('userData')));
  ipcMain.handle('launcher:getVersion', () => app.getVersion());
  ipcMain.handle('launcher:check-for-updates', async () => getUpdater().checkForUpdates(true));
  ipcMain.handle('launcher:download-update', async () => getUpdater().downloadUpdate());
  ipcMain.handle('launcher:install-update', async () => getUpdater().installUpdate());
  ipcMain.handle('launcher:setPrefs', (_event, patch) => {
    const next = setPrefs(app.getPath('userData'), patch || {});
    applyTrayMode();
    return next;
  });
}

function registerAccountIpc() {
  ipcMain.handle('accounts:list', () => accountStore.list());
  ipcMain.handle('accounts:getSelected', () => accountStore.getSelected());
  ipcMain.handle('accounts:createOffline', (_event, username) => accountStore.createOffline(username));
  ipcMain.handle('accounts:select', (_event, id) => accountStore.select(id));
  ipcMain.handle('accounts:remove', (_event, id) => accountStore.remove(id));
  ipcMain.handle('accounts:startMicrosoftLogin', async (event) => {
    if (!safeStorage?.isEncryptionAvailable()) {
      throw new Error('Secure operating-system credential storage is unavailable, so Microsoft sign-in cannot save credentials on this PC.');
    }
    const epoch = msAuthEpoch;
    try {
      const result = await msAuth.startMicrosoftLogin(
        message => sendMicrosoftStatus(event, message),
        code => sendMicrosoftCode(event, code),
      );
      // Cancelled while the browser step was pending: discard the late result.
      if (epoch !== msAuthEpoch) return { cancelled: true };
      return accountStore.saveMicrosoft(result);
    } catch (err) {
      throw new Error(classifyAuthError(err));
    }
  });
  ipcMain.handle('accounts:cancelMicrosoftLogin', () => {
    msAuthEpoch += 1;
    return { cancelled: true };
  });
  ipcMain.handle('accounts:refreshMicrosoft', async (event, id) => {
    const account = accountStore.getInternal(id);
    if (account.type !== 'microsoft') throw new Error('Only Microsoft accounts can be refreshed.');
    const epoch = msAuthEpoch;
    try {
      const result = await msAuth.refreshMicrosoft(
        account.tokens,
        message => sendMicrosoftStatus(event, message),
        code => sendMicrosoftCode(event, code),
      );
      if (epoch !== msAuthEpoch) return { cancelled: true };
      return accountStore.saveMicrosoft(result, account.id, false);
    } catch (err) {
      throw new Error(classifyAuthError(err));
    }
  });
}

async function selectedLaunchAccount() {
  let account = accountStore.getSelectedInternal();
  if (!account) throw new Error('No account is selected. Add or select an account before launching.');

  if (account.type === 'microsoft' && Number(account.tokens.expiresAt || 0) <= Date.now() + 5 * 60 * 1000) {
    try {
      const refreshed = await msAuth.refreshMicrosoft(account.tokens);
      accountStore.saveMicrosoft(refreshed, account.id, false);
      account = accountStore.getSelectedInternal();
    } catch (error) {
      const err = new Error(classifyAuthError(error));
      if (isSessionError(error)) err.code = 'SESSION_EXPIRED';
      throw err;
    }
  }

  accountStore.select(account.id);

  if (account.type === 'microsoft') {
    return {
      type: account.type,
      username: account.username,
      uuid: account.uuid,
      accessToken: account.tokens.accessToken,
      userProperties: account.tokens.userProperties || {},
      xuid: account.tokens.xuid || '',
      userType: 'msa',
    };
  }

  return {
    type: 'offline',
    username: account.username,
    uuid: account.uuid,
    accessToken: '0',
    userProperties: {},
    xuid: '',
    userType: 'legacy',
  };
}

// Real system memory so the RAM slider never offers more than the PC has.
ipcMain.handle('system:getMemory', () => ({
  totalGB: os.totalmem() / 1024 ** 3,
  freeGB: os.freemem() / 1024 ** 3,
}));

ipcMain.handle('get-installed-versions', async () => {
  try {
    const rootPath = minecraftRoot();
    const vanillaVersionsDir = path.join(vanillaMinecraftRoot(), 'versions');
    return {
      success: true,
      ...listInstalledVersions(rootPath, rootPath === vanillaMinecraftRoot() ? [] : [vanillaVersionsDir]),
    };
  } catch (err) {
    return { success: false, error: err.message, versions: [], jarOnlyVersions: [], locations: {} };
  }
});

ipcMain.handle('fetch-all-vanilla-versions', async () => {
  try {
    const manifest = await fetchVersionManifest();
    const releases = manifest.versions
      .filter(v => v.type === 'release')
      .map(v => v.id);
    return { success: true, versions: releases };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('install-modrinth-version', async (event, versionId) => {
  return installModrinthVersion(event, versionId, minecraftRoot());
});

ipcMain.handle('launch-game', async (event, options) => {
  if (!options || !options.version) {
    event.sender.send('log', { type: 'error', message: 'Missing launch options or version' });
    return { success: false, error: 'Missing launch options or version' };
  }
  // Cheap early guard (the authoritative one lives in launchCustomClient):
  // keeps a second invoke from resetting the in-flight launch's cancel flag.
  if (isLaunchInFlight()) {
    return { success: false, code: 'ALREADY_LAUNCHING', error: 'A game launch is already in progress.' };
  }
  resetLaunchCancelled();

  let account;
  try {
    account = await selectedLaunchAccount();
  } catch (error) {
    if (error.code === 'SESSION_EXPIRED') {
      return { success: false, error: error.message, code: 'SESSION_EXPIRED' };
    }
    return { success: false, error: error.message, code: 'ACCOUNT_REQUIRED' };
  }

  const launchRequest = { ...options, account };
  const { version } = launchRequest;
  const modLoader = 'fabric';
  const rootPath = path.join(app.getPath('userData'), 'minecraft');
  const vanillaRoot = vanillaMinecraftRoot();
  // Versions resolve from our folder first, then the vanilla one.
  const versionsBase = launchRequest.versionBase === 'vanilla'
    ? path.join(vanillaRoot, 'versions')
    : path.join(rootPath, 'versions');
  const versionDir = path.join(versionsBase, version);

  // Resolve the instance up front so every launch path shares one gameDir.
  let instance = null;
  let instanceGameDir = null;
  if (launchRequest.instanceId) {
    try {
      instance = instances.getInstance(rootPath, launchRequest.instanceId);
    } catch (err) {
      return { success: false, error: err.message };
    }
    instanceGameDir = instances.getInstanceDir(rootPath, instance.id);
    fs.mkdirSync(instanceGameDir, { recursive: true });
    instances.ensureModsDir(instanceGameDir);
    instances.enforceModStates(rootPath, instance.id);
  }

  // Fix nested folder structure if needed (some zips extract as versions/Name/Name/...)
  const hasJson = Boolean(findVersionJsonPath(versionDir, version));
  const hasJar  = fs.existsSync(versionDir) && fs.readdirSync(versionDir).some(f => f.endsWith('.jar'));
  if (!hasJson && hasJar) {
    const subdirs = fs.readdirSync(versionDir).filter(f => fs.statSync(path.join(versionDir, f)).isDirectory());
    for (const subdir of subdirs) {
      const subJson = path.join(versionDir, subdir, `${subdir}.json`);
      if (fs.existsSync(subJson)) {
        event.sender.send('log', { type: 'info', message: `Fixing folder structure for ${version}...` });
        for (const item of fs.readdirSync(path.join(versionDir, subdir))) {
          const src = path.join(versionDir, subdir, item);
          const dest = path.join(versionDir, item);
          if (fs.existsSync(dest)) {
            fs.statSync(dest).isDirectory()
              ? fs.rmSync(dest, { recursive: true, force: true })
              : fs.unlinkSync(dest);
          }
          fs.renameSync(src, dest);
        }
        const movedJson = path.join(versionDir, `${version}.json`);
        if (fs.existsSync(movedJson)) {
          try {
            const j = JSON.parse(fs.readFileSync(movedJson, 'utf8'));
            if (j.id !== version) { j.id = version; fs.writeFileSync(movedJson, JSON.stringify(j, null, 2)); }
          } catch {}
        }
        break;
      }
    }
  }

  const finalHasJson = Boolean(findVersionJsonPath(versionDir, version));

  // Determine if this is a custom client (any locally installed version with a JSON,
  // or a non-vanilla version name, or a jar-only client).
  const isVanillaName = /^\d+\.\d+(\.\d+)?(-(pre\d*|rc\d*|beta\d*|alpha[\w.]+))?$/i.test(version);
  const loader = 'fabric';
  const isCustomClient = finalHasJson
    ? !isVanillaName
    : hasJar;                 // jar-only also goes through our path

  // --- CUSTOM CLIENT PATH: launch already-installed custom profiles directly ---
  if (isCustomClient) {
    let mergedVersionJson = null;
    let baseVersionNumber = '1.8.9';

    if (finalHasJson) {
      try {
        const resolved = await resolveVersionInheritance(version, rootPath, event, versionsBase);
        mergedVersionJson = resolved;
        const VANILLA_RE = /^\d+\.\d+(\.\d+)?(-(pre\d*|rc\d*|beta\d*|alpha[\w.]+))?$/i;
        if (resolved._baseVersion && VANILLA_RE.test(resolved._baseVersion)) {
          baseVersionNumber = resolved._baseVersion;
        }
        event.sender.send('log', { type: 'info', message: `Base version: ${baseVersionNumber}` });
      } catch (err) {
        event.sender.send('log', { type: 'warn', message: `Inheritance resolve failed: ${err.message}` });
      }
    }

    try {
      return await launchCustomClient(
        event,
        { ...launchRequest, gameDir: instanceGameDir, instanceId: instance?.id || null, versionDir, vanillaRoot },
        mergedVersionJson,
        baseVersionNumber,
        rootPath
      );
    } catch (err) {
      if (err?.code === 'ALREADY_LAUNCHING') return { success: false, code: 'ALREADY_LAUNCHING', error: err.message };
      if (isLaunchCancelled()) return { success: false, code: 'CANCELLED' };
      event.sender.send('log', { type: 'error', message: `Launch failed: ${err.message}` });
      return { success: false, error: err.message };
    }
  }

  // --- FABRIC PATH: always install Fabric on the selected Minecraft version ---
  // With an instance, its folder becomes --gameDir (process isolation) and the
  // pinned loader is reused instead of hitting the network.
  try {
    if (instance) {
      if (!instance.minecraft_version) {
        return { success: false, error: `Instance "${instance.name}" has no Minecraft version set.` };
      }
      event.sender.send('log', { type: 'info', message: `Launching instance "${instance.name}" (isolated gameDir)` });
    }

    const mcVersion = instance ? instance.minecraft_version : version;
    const gameDir = instanceGameDir;
    const { versionId: loaderVersionId, loaderVersion } = await installFabric(
      mcVersion, rootPath, event, instance?.loader_version || null
    );
    if (instance && !instance.loader_version) {
      try {
        instances.updateInstance(rootPath, instance.id, { loader_version: loaderVersion, fabric_profile_id: loaderVersionId });
      } catch {}
    }

    const mergedVersionJson = await resolveVersionInheritance(loaderVersionId, rootPath, event);
    event.sender.send('log', { type: 'info', message: `Launching ${loaderVersionId} (fabric) from installed profile...` });
    return await launchCustomClient(
      event,
      { ...launchRequest, version: loaderVersionId, gameDir, instanceId: instance?.id || null, versionDir: path.join(rootPath, 'versions', loaderVersionId), vanillaRoot },
      mergedVersionJson,
      mcVersion,
      rootPath
    );
  } catch (err) {
    if (err?.code === 'ALREADY_LAUNCHING') return { success: false, code: 'ALREADY_LAUNCHING', error: err.message };
    if (isLaunchCancelled()) return { success: false, code: 'CANCELLED' };
    event.sender.send('log', { type: 'error', message: `Fabric setup failed: ${err.message}` });
    return { success: false, error: `Fabric setup failed: ${err.message}` };
  }
});

ipcMain.handle('cancel-launch', async (event) => {
  return requestCancelLaunch(event);
});

function minecraftRoot() {
  return path.join(app.getPath('userData'), 'minecraft');
}

// Standard Mojang game directory: configs, saves, servers and mods for
// anything launched outside instances (Clients/Versions page) live here,
// exactly like the vanilla launcher.
function vanillaMinecraftRoot() {
  if (process.platform === 'darwin') return path.join(app.getPath('appData'), 'minecraft');
  if (process.platform === 'win32') return path.join(app.getPath('appData'), '.minecraft');
  return path.join(app.getPath('home'), '.minecraft');
}

function registerInstanceIpc() {
  const handle = (channel, fn) => ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { success: true, data: await fn(...args) };
    } catch (error) {
      return { success: false, error: error.message || 'Instance operation failed' };
    }
  });

  handle('instance:list', () => instances.listInstances(minecraftRoot()));
  handle('instance:get', (id) => instances.getInstance(minecraftRoot(), id));
  handle('instance:create', (fields) => instances.createInstance(minecraftRoot(), fields || {}));
  handle('instance:update', (id, patch) => instances.updateInstance(minecraftRoot(), id, patch || {}));
  handle('instance:delete', (id) => instances.deleteInstance(minecraftRoot(), id));
  handle('instance:select', (id) => instances.setSelectedId(minecraftRoot(), id ?? null));
  handle('instance:getSelected', () => {
    const root = minecraftRoot();
    const selectedId = instances.getSelectedId(root);
    if (!selectedId) return { selectedId: null, instance: null };
    try {
      return { selectedId, instance: instances.getInstance(root, selectedId) };
    } catch {
      return { selectedId, instance: null };
    }
  });
  handle('instance:getMods', (id) => instances.getMods(minecraftRoot(), id));
  handle('instance:listLocalMods', () => instances.listLocalMods(minecraftRoot()));
  handle('instance:addLocalMod', (id, payload) => instances.addLocalMod(minecraftRoot(), id, payload || {}));
  handle('instance:setModEnabled', (id, filename, enabled) =>
    instances.setModEnabled(minecraftRoot(), id, filename, enabled));
  handle('instance:deleteMod', (id, filename) =>
    instances.deleteMod(minecraftRoot(), id, filename));

  // Latest compatible Modrinth build, or null when none exists for the version.
  async function fetchLatestCompatible(projectId, mcVersion) {
    const { data } = await axios.get(
      `https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version`,
      {
        params: { loaders: JSON.stringify(['fabric']), game_versions: JSON.stringify([mcVersion]) },
        timeout: 15000,
        headers: { 'User-Agent': 'ProcLauncher/1.0' },
      }
    );
  const latest = Array.isArray(data) && data[0];
    return latest?.id ? latest : null;
  }

  // Download one Modrinth build into an instance and register it.
  // Download one Modrinth build into an instance and register it.
  async function downloadLatestModInto(event, root, instanceId, projectId, mcVersion) {
    const latest = await fetchLatestCompatible(projectId, mcVersion);
    if (!latest) throw new Error(`No compatible build for ${mcVersion}.`);
    const file = (latest.files || []).find(f => f.primary && f.url) || (latest.files || []).find(f => f.url);
    if (!file?.url) throw new Error('Latest version has no downloadable file.');
    const filename = safeModFileName(file.filename || `${latest.id}.jar`);
    if (!filename.toLowerCase().endsWith('.jar')) throw new Error('Latest file is not a jar.');
    const modsDir = instances.ensureModsDir(instances.getInstanceDir(root, instanceId));
    const destPath = path.join(modsDir, filename);
    event.sender.send('log', { type: 'info', message: `Downloading ${filename}...` });
    await streamDownload(file.url, destPath, (percent) => {
      event.sender.send('launch-progress', { type: 'mod-download', percent });
    });
    if (!(await validateJar(destPath))) {
      try { fs.unlinkSync(destPath); } catch {}
      throw new Error('Downloaded mod jar is invalid.');
    }
    return { latest, filename };
  }

  handle('instance:checkModUpdates', async (id) => {
    const root = minecraftRoot();
    const record = instances.getInstance(root, id);
    if (!record.minecraft_version) throw new Error(`Instance "${record.name}" has no Minecraft version set.`);
    const entries = Object.entries(record.mods || {}).filter(([, meta]) => meta?.project_id);
    const results = await mapLimit(entries, 5, async ([filename, meta]) => {
      try {
        const latest = await fetchLatestCompatible(meta.project_id, record.minecraft_version);
        if (latest && latest.id !== meta.version_id) {
          return {
            project_id: meta.project_id,
            filename,
            current_version: meta.version_number || meta.version_id || 'unknown',
            latest_version: latest.version_number || latest.id,
            latest_version_id: latest.id,
          };
        }
        return null;
      } catch (err) {
        return { project_id: meta.project_id, filename, error: err.message };
      }
    });
    return results.filter(Boolean);
  });

  handle('instance:updateMod', async (id, projectId) => {
    const root = minecraftRoot();
    const record = instances.getInstance(root, id);
    if (!record.minecraft_version) throw new Error(`Instance "${record.name}" has no Minecraft version set.`);
    const entry = Object.entries(record.mods || {}).find(([, m]) => m?.project_id === projectId);
    const latest = await fetchLatestCompatible(projectId, record.minecraft_version);
    if (!latest) throw new Error('No compatible version found for this Minecraft version.');
    if (entry && entry[1]?.version_id === latest.id) {
      return { updated: false, filename: entry[0] };
    }
    const event = { sender: { send: () => {} } };
    const { filename } = await downloadLatestModInto(event, root, id, projectId, record.minecraft_version);
    if (entry && entry[0] !== filename) {
      instances.deleteMod(root, id, entry[0]);
    }
    const modRecord = instances.registerMod(root, id, {
      filename,
      project_id: projectId,
      version_id: latest.id,
      version_number: latest.version_number || null,
    });
    return { updated: true, filename, ...modRecord };
  });

  handle('instance:planUpgrade', async (id, targetMc) => {
    const root = minecraftRoot();
    const record = instances.syncModsFromDisk(root, id);
    if (!targetMc || typeof targetMc !== 'string') throw new Error('Target Minecraft version is required.');
    if (targetMc === record.minecraft_version) throw new Error('Target version is the same as the current version.');
    const entries = Object.entries(record.mods || {});
    const plan = await mapLimit(entries, 5, async ([filename, meta]) => {
      let latest = null;
      let fetchError = null;
      if (meta?.project_id) {
        try {
          latest = await fetchLatestCompatible(meta.project_id, targetMc);
        } catch (err) {
          fetchError = err.message;
        }
      }
      return instances.classifyModForTarget(filename, meta, latest, fetchError, targetMc);
    });
    return { targetMc, mods: plan };
  });

  handle('instance:upgradeInstance', async (payload) => {
    const { sourceId, name, minecraft_version: targetMc, downloads } = payload || {};
    const root = minecraftRoot();
    const source = instances.syncModsFromDisk(root, sourceId);
    if (!targetMc || typeof targetMc !== 'string') throw new Error('Target Minecraft version is required.');
    if (targetMc === source.minecraft_version) throw new Error('Target version is the same as the current version.');
    const wanted = new Set((downloads || []).filter(Boolean));

    const event = { sender: { send: () => {} } };
    const clone = instances.createInstance(root, {
      name: String(name || `${source.name} ${targetMc}`).trim() || `${source.name} ${targetMc}`,
      icon: source.icon,
      minecraft_version: targetMc,
      customJvmArgs: source.customJvmArgs,
    });
    const entries = Object.entries(source.mods || {});
    const summary = { updated: [], kept: [], failed: [], local: [] };
    let done = 0;
    const progress = () => {
      done += 1;
      event.sender.send('launch-progress', {
        type: 'instance-upgrade',
        percent: entries.length === 0 ? 100 : Math.round((done / entries.length) * 100),
      });
    };

    for (const [filename, meta] of entries) {
      const wasEnabled = meta?.enabled !== false;
      try {
        if (meta?.project_id && wanted.has(meta.project_id)) {
          const { filename: nextName, latest } =
            await downloadLatestModInto(event, root, clone.id, meta.project_id, targetMc);
          instances.registerMod(root, clone.id, {
            filename: nextName,
            project_id: meta.project_id,
            version_id: latest.id,
            version_number: latest.version_number || null,
          });
          if (!wasEnabled) instances.setModEnabled(root, clone.id, nextName, false);
          summary.updated.push(nextName);
        } else if (meta?.project_id) {
          // Skipped by the user, or no compatible build: carry the old jar over.
          // Anything without a target build stays disabled so it can't crash the game.
          let latest = null;
          try { latest = await fetchLatestCompatible(meta.project_id, targetMc); } catch {}
          instances.copyModFile(root, source.id, clone.id, filename);
          const compatible = latest && latest.id === meta.version_id;
          instances.registerMod(root, clone.id, {
            filename,
            project_id: meta.project_id,
            version_id: meta.version_id || null,
            version_number: meta.version_number || null,
          });
          if (!compatible || !wasEnabled) {
            try { instances.setModEnabled(root, clone.id, filename, false); } catch {}
          }
          (compatible && wasEnabled ? summary.kept : summary.failed).push(filename);
        } else {
          instances.copyModFile(root, source.id, clone.id, filename);
          instances.registerMod(root, clone.id, {
            filename,
            project_id: null,
            version_id: meta?.version_id || null,
            version_number: meta?.version_number || null,
          });
          if (!wasEnabled) {
            try { instances.setModEnabled(root, clone.id, filename, false); } catch {}
          }
          summary.local.push(filename);
        }
      } catch (err) {
        summary.failed.push(`${filename} (${err.message})`);
      }
      progress();
    }
    progress();
    instances.setSelectedId(root, clone.id);
    return { instance: instances.getInstance(root, clone.id), summary };
  });
}

function runInstanceMigration() {
  try {
    const root = minecraftRoot();
    let inferred = '';
    try {
      const versionsDir = path.join(root, 'versions');
      if (fs.existsSync(versionsDir)) {
        let best = null;
        for (const item of fs.readdirSync(versionsDir)) {
          const match = item.match(/^fabric-loader-[^-]+-(.+)$/);
          if (!match) continue;
          let mtimeMs = 0;
          try { mtimeMs = fs.statSync(path.join(versionsDir, item)).mtimeMs; } catch { continue; }
          if (!best || mtimeMs > best.mtimeMs) best = { mtimeMs, mc: match[1] };
        }
        inferred = best?.mc || '';
      }
    } catch {}
    const result = instances.migrateLegacyMods(root, inferred);
    if (result.migrated) {
      console.log(`[Instances] Migrated ${result.moved} mod(s) into Default instance (${result.instanceId}).`);
    }
    const stripResult = instances.stripPerInstancePerfFields(root);
    if (stripResult.stripped) {
      console.log(`[Instances] Stripped legacy ram/resolution from ${stripResult.stripped} instance(s).`);
    }
  } catch (error) {
    console.error('[Instances] Migration failed:', error.message);
  }
}

const { createUpdater } = require('./updater');

let updater = null;
function getUpdater() {
  if (!updater) {
    updater = createUpdater({
      app,
      getPrefs,
      logger,
      send: (msg) => mainWindow?.webContents.send('launcher:update', msg),
    });
  }
  return updater;
}

app.whenReady().then(() => {
  logger.initLogger(app.getPath('userData'));
  logger.info('Proc Launcher starting.');
  accountStore = new AccountStore(app, safeStorage);
  registerAccountIpc();
  registerPrefsIpc();
  registerInstanceIpc();
  runInstanceMigration();
  createWindow();
  applyTrayMode();
  getUpdater().checkForUpdates(false);
});

app.on('before-quit', () => { isQuitting = true; });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !tray) app.quit();
});

app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
