const fs = require('fs');
const path = require('path');
const axios = require('axios');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const { streamDownload, validateJar } = require('./downloads');
const { getJavaPath, downloadJava, getRequiredJavaVersion } = require('./java');
const { getLibraryArtifact, checkLibraryRules, checkRules, resolveRuleFeatures, downloadAssets, downloadLibraries, setupNatives } = require('./libraries');
const instances = require('./instances');
const logger = require('./logger');

let offlineServicesServer = null;
// Active game process + launch cancellation flag (one launch at a time).
let activeGameChild = null;

let launchCancelled = false;

// Main-side launch concurrency guard: the renderer also tracks isLaunching,
// but a second invoke must never spawn a second game process (the loser would
// overwrite activeGameChild and leak an unkillable game).
let launchInFlight = false;

function isLaunchInFlight() {
  return launchInFlight;
}

function tryAcquireLaunch() {
  if (launchInFlight) return false;
  launchInFlight = true;
  return true;
}

function releaseLaunch() {
  launchInFlight = false;
}
function jarContainsClass(jarPath, className) {
  if (!jarPath || !className || !fs.existsSync(jarPath)) return false;
  try {
    const entryName = `${className.replace(/\./g, '/')}.class`;
    const zip = new AdmZip(jarPath);
    return Boolean(zip.getEntry(entryName));
  } catch {
    return false;
  }
}

function findJarContainingClass(searchDir, className) {
  if (!fs.existsSync(searchDir)) return null;
  const stack = [searchDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.jar') && jarContainsClass(fullPath, className)) {
        return fullPath;
      }
    }
  }
  return null;
}

function ensureMainClassOnClasspath(classpathEntries, rootPath, mainClass, event) {
  if (!mainClass || classpathEntries.some(jarPath => jarContainsClass(jarPath, mainClass))) {
    return classpathEntries;
  }

  const found = findJarContainingClass(path.join(rootPath, 'libraries'), mainClass);
  if (found) {
    classpathEntries.unshift(found);
    if (event) {
      event.sender.send('log', {
        type: 'warn',
        message: `Added missing main-class library to classpath: ${path.basename(found)}`
      });
    }
  }
  return classpathEntries;
}

function readMainClassFromJar(jarPath) {
  try {
    const zip = new AdmZip(jarPath);
    const manifestEntry = zip.getEntry('META-INF/MANIFEST.MF');
    if (!manifestEntry) return null;
    const text = manifestEntry.getData().toString('utf8');
    const match = text.match(/^Main-Class:\s*(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function splitArgumentString(value) {
  if (!value || typeof value !== 'string') return [];
  const args = [];
  const regex = /"([^"]*)"|'([^']*)'|[^\s]+/g;
  let match;
  while ((match = regex.exec(value)) !== null) {
    args.push(match[1] ?? match[2] ?? match[0]);
  }
  return args;
}

function replaceArgumentTokens(value, replacements) {
  if (typeof value !== 'string') return value;
  return value.replace(/\$\{([^}]+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(replacements, key)) {
      return String(replacements[key]);
    }
    return match;
  });
}

function evaluateArgumentEntries(entries, replacements) {
  if (!Array.isArray(entries)) return [];
  const args = [];
  const features = resolveRuleFeatures();

  for (const entry of entries) {
    if (typeof entry === 'string') {
      args.push(replaceArgumentTokens(entry, replacements));
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    if (!checkRules(entry.rules, features)) continue;

    const values = Array.isArray(entry.value) ? entry.value : [entry.value];
    for (const value of values) {
      if (typeof value === 'string') {
        args.push(replaceArgumentTokens(value, replacements));
      }
    }
  }

  return args.filter(arg => typeof arg === 'string' && arg.trim() !== '');
}

function removeJsonManagedJvmArgs(args) {
  const filtered = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-cp' || arg === '-classpath') {
      i++;
      continue;
    }
    if (arg.startsWith('-Djava.library.path=')) continue;
    filtered.push(arg);
  }
  return filtered;
}

async function ensureClientJarFromJson(versionJson, jarPath, event) {
  if (fs.existsSync(jarPath)) return jarPath;
  const clientDownload = versionJson?.downloads?.client;
  if (!clientDownload?.url) return null;

  fs.mkdirSync(path.dirname(jarPath), { recursive: true });
  event.sender.send('log', { type: 'info', message: `Downloading client jar: ${path.basename(jarPath)}` });
  await streamDownload(clientDownload.url, jarPath, (percent) => {
    event.sender.send('launch-progress', { type: 'client', percent });
  });

  const valid = await validateJar(jarPath);
  if (!valid) {
    try { fs.unlinkSync(jarPath); } catch {}
    throw new Error('Downloaded client JAR is invalid');
  }

  return jarPath;
}


function safeModFileName(name) {
  return String(name || 'mod.jar')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'mod.jar';
}

function offlineProfileId(uuid, username, salt) {
  return crypto
    .createHash('sha1')
    .update(`${salt}:${uuid}:${username}`, 'utf8')
    .digest('hex')
    .slice(0, 16);
}

function ensureOfflineServicesServer(event) {
  if (offlineServicesServer?.url) return Promise.resolve(offlineServicesServer.url);

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (url.pathname === '/player/attributes') {
        res.writeHead(200);
        res.end(JSON.stringify({
          privileges: {
            onlineChat: { enabled: true },
            multiplayerServer: { enabled: true },
            multiplayerRealms: { enabled: true },
            telemetry: { enabled: true },
          },
          profanityFilterPreferences: { profanityFilterOn: false },
        }));
        return;
      }

      if (url.pathname === '/minecraft/profile') {
        res.writeHead(200);
        res.end(JSON.stringify({ id: '00000000000000000000000000000000', name: 'OfflinePlayer' }));
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const url = `http://127.0.0.1:${address.port}`;
      offlineServicesServer = { server, url };
      server.unref?.();
      event?.sender?.send('log', {
        type: 'info',
        message: 'Offline multiplayer menu compatibility service started.',
      });
      resolve(url);
    });
  });
}

async function installModrinthVersion(event, target, rootPath) {
  const { versionId, instanceId = null, projectId = null } =
    typeof target === 'string' ? { versionId: target } : (target || {});
  if (!versionId || typeof versionId !== 'string') {
    return { success: false, error: 'Missing Modrinth version id' };
  }

  try {
    let instanceDir = null;
    if (instanceId) {
      // Validates the instance exists before downloading anything.
      instances.getInstance(rootPath, instanceId);
      instanceDir = instances.getInstanceDir(rootPath, instanceId);
    }

    const { data } = await axios.get(`https://api.modrinth.com/v2/version/${encodeURIComponent(versionId)}`, {
      timeout: 15000,
      headers: { 'User-Agent': 'ProcLauncher/1.0' },
    });

    const file = (data.files || []).find(f => f.primary && f.url) || (data.files || []).find(f => f.url);
    if (!file?.url) throw new Error('No downloadable mod file was found for this version');

    const filename = safeModFileName(file.filename || `${versionId}.jar`);
    if (!filename.toLowerCase().endsWith('.jar')) {
      throw new Error('Selected Modrinth file is not a jar');
    }

    // Global mod library: every download lands here first so all instances
    // can pick from it later without re-downloading (offline-friendly).
    const libraryDir = path.join(rootPath, 'mods');
    fs.mkdirSync(libraryDir, { recursive: true });
    const libraryPath = path.join(libraryDir, filename);
    if (fs.existsSync(libraryPath) && await validateJar(libraryPath)) {
      event.sender.send('log', { type: 'info', message: `Already in library: ${filename}` });
    } else {
      event.sender.send('log', { type: 'info', message: `Downloading mod: ${filename}` });
      await streamDownload(file.url, libraryPath, (percent) => {
        event.sender.send('launch-progress', { type: 'mod-download', percent });
      });
      if (!(await validateJar(libraryPath))) {
        try { fs.unlinkSync(libraryPath); } catch {}
        throw new Error('Downloaded mod jar is invalid');
      }
    }

    // Auto-add into the requesting instance (copy, so instances stay isolated).
    let record = null;
    let destPath = libraryPath;
    if (instanceId) {
      const targetModsDir = instances.ensureModsDir(instanceDir);
      destPath = path.join(targetModsDir, filename);
      if (path.resolve(destPath) !== path.resolve(libraryPath)) {
        fs.copyFileSync(libraryPath, destPath);
      }
      record = instances.registerMod(rootPath, instanceId, {
        filename,
        project_id: projectId || data.project_id || null,
        version_id: data.id || versionId,
        version_number: data.version_number || null,
      });
    }

    return { success: true, path: destPath, filename, project_id: record?.project_id || data.project_id || null };
  } catch (err) {
    event.sender.send('log', { type: 'error', message: `Mod install failed: ${err.message}` });
    return { success: false, error: err.message };
  }
}

// Launches any custom client (with or without a version JSON) directly via Java spawn,
// bypassing MCLC entirely. This is the only reliable way to avoid MCLC re-downloading
// the client JAR by comparing it against the vanilla SHA1.

async function launchCustomClient(event, options, mergedVersionJson = null, baseVersionNumber = '1.8.9', rootPath) {
  if (!tryAcquireLaunch()) {
    const err = new Error('A game launch is already in progress.');
    err.code = 'ALREADY_LAUNCHING';
    throw err;
  }
  try {
    return await launchCustomClientInner(event, options, mergedVersionJson, baseVersionNumber, rootPath);
  } catch (err) {
    releaseLaunch();
    throw err;
  }
}

async function launchCustomClientInner(event, options, mergedVersionJson = null, baseVersionNumber = '1.8.9', rootPath) {
  const {
    account,
    version,
    ram = '4G',
    resolution = '1280x720',
    customJvmArgs = '',
  } = options;

  const userDataDir = path.dirname(rootPath);
  const versionDir = options.versionDir || path.join(rootPath, 'versions', version);

  // Find the client JAR
  let jarPath = path.join(versionDir, `${version}.jar`);
  if (fs.existsSync(jarPath) && !(await validateJar(jarPath)) && mergedVersionJson?.downloads?.client?.url) {
    event.sender.send('log', { type: 'warn', message: `Replacing invalid client JAR placeholder: ${path.basename(jarPath)}` });
    try { fs.unlinkSync(jarPath); } catch {}
  }
  if (!fs.existsSync(jarPath)) {
    await ensureClientJarFromJson(mergedVersionJson, jarPath, event);
  }
  if (!fs.existsSync(jarPath)) {
    const jars = fs.existsSync(versionDir) ? fs.readdirSync(versionDir).filter(f => f.endsWith('.jar')) : [];
    if (jars.length === 0) throw new Error(`No JAR file found in ${versionDir}`);
    jarPath = path.join(versionDir, jars[0]);
  }

  // Per-instance process isolation: the instance folder IS the --gameDir
  // (mods/, saves/, config/ live there). Anything launched outside an
  // instance (Versions page) runs against the standard vanilla .minecraft
  // folder instead, exactly like the vanilla launcher.
  let gameDir = rootPath;
  if (options.gameDir) {
    gameDir = options.gameDir;
    fs.mkdirSync(gameDir, { recursive: true });
    fs.mkdirSync(path.join(gameDir, 'mods'), { recursive: true });
  } else {
    gameDir = options.vanillaRoot || rootPath;
    fs.mkdirSync(gameDir, { recursive: true });
    fs.mkdirSync(path.join(gameDir, 'mods'), { recursive: true });
  }

  const isOfflineAccount = account.type === 'offline';
  const accessToken = account.accessToken;
  // Minecraft expects the undashed 32-hex form; offline UUIDs are stored dashed.
  const uuid = String(account.uuid || '').replace(/-/g, '');
  const name = account.username;
  const userType = isOfflineAccount ? 'msa' : account.userType;
  const clientId = isOfflineAccount ? offlineProfileId(uuid, name, 'client') : '0';
  const xuid = isOfflineAccount ? offlineProfileId(uuid, name, 'xuid') : (account.xuid || '0');
  const userProperties = JSON.stringify(account.userProperties || {});

  let width = 1280, height = 720;
  if (resolution && typeof resolution === 'string' && resolution.includes('x')) {
    const [w, h] = resolution.split('x').map(s => parseInt(s, 10));
    if (!isNaN(w) && !isNaN(h)) { width = w; height = h; }
  }

  const requiredJava = mergedVersionJson?.javaVersion?.majorVersion || getRequiredJavaVersion(baseVersionNumber);
  const resolved = await getJavaPath(userDataDir, requiredJava);
  let javaPath = resolved.javaPath;
  if (resolved.needsDownload) {
    try { javaPath = await downloadJava(event, userDataDir, requiredJava); } catch {}
  }

  const xmx = /^\d+[gGmM]$/.test(ram) ? ram : '4G';
  const nativesDir = path.join(versionDir, 'natives');
  const offlineServicesHost = isOfflineAccount ? await ensureOfflineServicesServer(event) : null;

  // Build classpath: all libraries + the client JAR last
  const classpathEntries = [];
  if (mergedVersionJson?.libraries) {
    await downloadAssets(event, mergedVersionJson, rootPath);
    event.sender.send('log', { type: 'info', message: 'Downloading libraries...' });
    await downloadLibraries(event, mergedVersionJson, rootPath);
    await setupNatives(mergedVersionJson, versionDir, rootPath, event);

    for (const lib of mergedVersionJson.libraries) {
      if (!checkLibraryRules(lib.rules)) continue;
      const artifact = getLibraryArtifact(lib, rootPath);
      if (artifact && fs.existsSync(artifact.localPath)) {
        classpathEntries.push(artifact.localPath);
      }
    }
  }
  classpathEntries.push(jarPath);

  const cpSep = process.platform === 'win32' ? ';' : ':';

  const mainClass = mergedVersionJson?.mainClass
    || readMainClassFromJar(jarPath)
    || 'net.minecraft.client.main.Main';

  ensureMainClassOnClasspath(classpathEntries, rootPath, mainClass, event);
  const classpath = classpathEntries.join(cpSep);

  event.sender.send('log', { type: 'info', message: `Main class: ${mainClass}` });
  event.sender.send('log', { type: 'debug', message: `Classpath entries: ${classpathEntries.length}` });

  const replacements = {
    auth_player_name: name,
    version_name: version,
    game_directory: gameDir,
    assets_root: path.join(rootPath, 'assets'),
    game_assets: path.join(rootPath, 'assets'),
    assets_index_name: mergedVersionJson?.assetIndex?.id || mergedVersionJson?.assets || baseVersionNumber,
    auth_uuid: uuid,
    auth_access_token: accessToken,
    clientid: clientId,
    auth_xuid: xuid,
    user_properties: userProperties,
    user_type: userType,
    version_type: mergedVersionJson?.type || 'release',
    natives_directory: nativesDir,
    launcher_name: 'ProcLauncher',
    launcher_version: '2.0.0',
    classpath,
    classpath_separator: cpSep,
    library_directory: path.join(rootPath, 'libraries'),
  };

  // Resolve game arguments from the version JSON
  let gameArgList = [];
  if (mergedVersionJson?.arguments?.game) {
    gameArgList = evaluateArgumentEntries(mergedVersionJson.arguments.game, replacements);
  } else if (mergedVersionJson?.minecraftArguments) {
    // Legacy string format - substitute tokens and split
    gameArgList = splitArgumentString(replaceArgumentTokens(mergedVersionJson.minecraftArguments, replacements));
  } else {
    // Modern named args
    gameArgList = [
      '--username', name,
      '--version', version,
      '--gameDir', gameDir,
      '--assetsDir', path.join(rootPath, 'assets'),
      '--assetIndex', mergedVersionJson?.assetIndex?.id || baseVersionNumber,
      '--uuid', uuid,
      '--accessToken', accessToken,
      '--userProperties', userProperties,
      '--userType', userType,
    ];
  }
  if (!gameArgList.includes('--width')) gameArgList.push('--width', String(width));
  if (!gameArgList.includes('--height')) gameArgList.push('--height', String(height));

  const jsonJvmArgs = removeJsonManagedJvmArgs(
    evaluateArgumentEntries(mergedVersionJson?.arguments?.jvm, replacements)
  );
  const jvmArgList = [
    `-Xmx${xmx}`,
    '-Xms512M',
    '-XX:+UseG1GC',
    '-XX:-UseAdaptiveSizePolicy',
    '-XX:-OmitStackTraceInFastThrow',
    '-Djava.awt.headless=false',
    `-Djava.library.path=${nativesDir}`,
    `-Dminecraft.applet.TargetDirectory=${gameDir}`,
    ...jsonJvmArgs,
  ];
  if (offlineServicesHost) {
    jvmArgList.push(`-Dminecraft.api.services.host=${offlineServicesHost}`);
  }

  if (customJvmArgs && typeof customJvmArgs === 'string') {
    jvmArgList.push(...customJvmArgs.split(' ').filter(a => a.trim() !== ''));
  }

  const args = [...jvmArgList, '-cp', classpath, mainClass, ...gameArgList];

  event.sender.send('log', { type: 'info', message: `Launching ${version} directly (bypassing MCLC)` });

  if (launchCancelled) throw new Error('Launch cancelled by user.');

  return new Promise((resolve) => {
    const { child, stopTail } = spawnDetachedGame({
      javaPath,
      args,
      cwd: gameDir,
      label: options.instanceId || baseVersionNumber || 'game',
      onOutput: (message) => {
        logger.game(message);
        try { event.sender.send('log', { type: 'data', message }); } catch {}
      },
    });
    activeGameChild = child;
    const clearActive = () => { if (activeGameChild === child) activeGameChild = null; };

    child.on('spawn', () => {
      event.sender.send('log', { type: 'info', message: `Game started (PID: ${child.pid})` });
      event.sender.send('launch-started');
      if (options.instanceId) {
        try {
          instances.updateInstance(rootPath, options.instanceId, { lastPlayedAt: new Date().toISOString() });
        } catch {}
      }
      resolve({ success: true });
    });

    child.on('error', (err) => {
      stopTail();
      releaseLaunch();
      clearActive();
      event.sender.send('log', { type: 'error', message: `Process error: ${err.message}` });
      resolve({ success: false, error: err.message });
    });

    child.on('close', (code) => {
      stopTail();
      releaseLaunch();
      clearActive();
      event.sender.send('launch-finished', code);
      event.sender.send('log', { type: 'info', message: `Minecraft exited (code ${code})` });
    });
  });
}

// Spawn the game as a fully detached process so it survives the launcher
// quitting. Its stdout/stderr go to a per-launch log file (never pipes back to
// this process, which would tie the game's lifetime to the launcher and break
// on launcher exit); the UI tails that file for live output. spawnFn is
// injectable for tests.
function spawnDetachedGame({ javaPath, args, cwd, label, onOutput, spawnFn = spawn }) {
  const gameLog = logger.openGameLog(label);
  const stdio = gameLog ? ['ignore', gameLog.fd, gameLog.fd] : ['ignore', 'ignore', 'ignore'];
  const child = spawnFn(javaPath, args, {
    cwd,
    // detached => DETACHED_PROCESS on Windows (no console window, own process
    // group) and independent of the launcher. windowsHide stays false to avoid
    // the invalid DETACHED_PROCESS | CREATE_NO_WINDOW combination.
    detached: true,
    windowsHide: false,
    stdio,
  });
  // The child inherits its own handle to the file; drop the launcher's copy.
  if (gameLog) {
    try { fs.closeSync(gameLog.fd); } catch {}
  }
  // Do not keep the launcher's event loop alive for the game.
  if (child && typeof child.unref === 'function') child.unref();

  let stopTail = () => {};
  if (gameLog && typeof onOutput === 'function') {
    stopTail = logger.tailFile(gameLog.file, onOutput);
  }
  return { child, stopTail, gameLog };
}

function isLaunchCancelled() {
  return launchCancelled;
}

function resetLaunchCancelled() {
  launchCancelled = false;
}

function requestCancelLaunch(event) {
  launchCancelled = true;
  if (activeGameChild && !activeGameChild.killed) {
    try {
      event?.sender?.send('log', { type: 'warn', message: `Stopping game (PID: ${activeGameChild.pid})...` });
      activeGameChild.kill();
      logger.info(`Cancelled launch; stopped game (PID: ${activeGameChild.pid}).`);
      return { success: true, stopped: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  logger.info('Launch cancelled before the game process spawned.');
  return { success: true, stopped: false };
}

module.exports = { splitArgumentString, replaceArgumentTokens, evaluateArgumentEntries, removeJsonManagedJvmArgs, jarContainsClass, findJarContainingClass, ensureMainClassOnClasspath, readMainClassFromJar, ensureClientJarFromJson, safeModFileName, offlineProfileId, ensureOfflineServicesServer, installModrinthVersion, launchCustomClient, requestCancelLaunch, resetLaunchCancelled, isLaunchCancelled, isLaunchInFlight, tryAcquireLaunch, releaseLaunch, spawnDetachedGame };
