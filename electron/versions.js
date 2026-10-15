const fs = require('fs');
const path = require('path');
const axios = require('axios');

const VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

// The manifest is MBs and changes rarely: cache in memory with a TTL, and
// share one inflight request between concurrent callers.
const MANIFEST_TTL_MS = 10 * 60 * 1000;
let manifestCache = null;
let manifestInflight = null;

async function fetchVersionManifest() {
  if (manifestCache && Date.now() - manifestCache.at < MANIFEST_TTL_MS) {
    return manifestCache.data;
  }
  if (!manifestInflight) {
    manifestInflight = axios.get(VERSION_MANIFEST_URL, { timeout: 30000 })
      .then(response => {
        manifestCache = { data: response.data, at: Date.now() };
        return response.data;
      })
      .finally(() => { manifestInflight = null; });
  }
  return manifestInflight;
}

// Test seam: reset the cache.
function _resetManifestCache() {
  manifestCache = null;
  manifestInflight = null;
}

function findVersionJsonPath(versionDir, versionId = null) {
  if (!fs.existsSync(versionDir)) return null;
  const expected = versionId ? path.join(versionDir, `${versionId}.json`) : null;
  if (expected && fs.existsSync(expected)) return expected;

  const jsonFiles = fs.readdirSync(versionDir)
    .filter(file => file.toLowerCase().endsWith('.json'))
    .map(file => path.join(versionDir, file));
  if (jsonFiles.length === 0) return null;

  if (versionId) {
    for (const jsonPath of jsonFiles) {
      try {
        const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (json.id === versionId) return jsonPath;
      } catch {}
    }
  }

  return jsonFiles[0];
}

function readVersionJson(versionDir, versionId = null) {
  const jsonPath = findVersionJsonPath(versionDir, versionId);
  if (!jsonPath) return null;
  return {
    jsonPath,
    json: JSON.parse(fs.readFileSync(jsonPath, 'utf8')),
  };
}

async function downloadVersionJson(versionId, rootPath, event) {
  const versionPath = path.join(rootPath, 'versions', versionId);
  const local = readVersionJson(versionPath, versionId);
  if (local) {
    return local.json;
  }
  let manifest;
  try {
    manifest = await fetchVersionManifest();
  } catch (err) {
    throw new Error(`Failed to fetch version manifest: ${err.message}`);
  }
  const versionInfo = manifest.versions.find(v => v.id === versionId);
  if (!versionInfo) {
    return null;
  }
  const response = await axios.get(versionInfo.url, { timeout: 30000 });
  const versionJson = response.data;
  fs.mkdirSync(versionPath, { recursive: true });
  const jsonPath = path.join(versionPath, `${versionId}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(versionJson, null, 2));
  return versionJson;
}

function pushUniqueLibraries(target, libraries = []) {
  for (const lib of libraries) {
    if (!lib?.name) {
      target.push(lib);
      continue;
    }
    const existingIndex = target.findIndex(existing => existing.name === lib.name);
    if (existingIndex >= 0) {
      target[existingIndex] = lib;
    } else {
      target.push(lib);
    }
  }
}

function mergeArgumentGroup(base = [], extra = []) {
  return [
    ...(Array.isArray(base) ? base : []),
    ...(Array.isArray(extra) ? extra : []),
  ];
}

async function resolveVersionInheritance(versionId, rootPath, event, versionsBaseDir = null) {
  const versionDir = path.join(versionsBaseDir || path.join(rootPath, 'versions'), versionId);
  const local = readVersionJson(versionDir, versionId);
  if (!local) {
    throw new Error(`Version ${versionId} not found locally`);
  }
  let current = local.json;
  const merged = {
    id: current.id || versionId,
    type: current.type,
    downloads: current.downloads,
    libraries: [],
    mainClass: current.mainClass,
    assets: current.assets,
    assetIndex: current.assetIndex,
    javaVersion: current.javaVersion,
  };
  const chain = [current];
  while (current.inheritsFrom) {
    const parentId = current.inheritsFrom;
    const parentDir = path.join(rootPath, 'versions', parentId);
    let parent = readVersionJson(parentDir, parentId);
    if (!parent) {
      if (event) event.sender.send('log', { type: 'info', message: `Downloading parent version: ${parentId}` });
      const downloaded = await downloadVersionJson(parentId, rootPath, event);
      if (!downloaded) {
        if (event) event.sender.send('log', {
          type: 'warn',
          message: `Parent version "${parentId}" not found in Mojang manifest and not installed locally. Stopping inheritance chain.`
        });
        break;
      }
      parent = { json: downloaded };
    }
    const parentJson = parent.json;
    chain.unshift(parentJson);
    current = parentJson;
  }
  for (const version of chain) {
    pushUniqueLibraries(merged.libraries, version.libraries);
    if (version.arguments) {
      merged.arguments = {
        game: mergeArgumentGroup(merged.arguments?.game, version.arguments.game),
        jvm: mergeArgumentGroup(merged.arguments?.jvm, version.arguments.jvm),
      };
    } else if (version.minecraftArguments && !merged.arguments) {
      merged.minecraftArguments = version.minecraftArguments;
    }
    if (version.mainClass) merged.mainClass = version.mainClass;
    if (version.assets) merged.assets = version.assets;
    if (version.assetIndex) merged.assetIndex = version.assetIndex;
    if (version.javaVersion) merged.javaVersion = version.javaVersion;
    if (version.downloads) merged.downloads = version.downloads;
    if (version.id) merged.id = version.id;
    if (version.type) merged.type = version.type;
  }
  const VANILLA_RE = /^\d+\.\d+(\.\d+)?(-(pre\d*|rc\d*|beta\d*|alpha[\w.]+))?$/i;
  let vanillaEntry = chain.find(v => VANILLA_RE.test(v.id));
  
  if (!vanillaEntry) {
    vanillaEntry = chain.find(v => v.assets && VANILLA_RE.test(v.assets));
  }

  merged._baseVersion = vanillaEntry ? vanillaEntry.id : (current.assets || '1.8.9');
  return merged;
}

async function getLatestFabricLoader(mcVersion) {
  try {
    const { data } = await axios.get(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`, { timeout: 30000 });
    if (data && data.length > 0) return data[0].loader.version;
  } catch (err) {
    console.error('Failed to fetch Fabric loader:', err.message);
  }
  return null;
}

async function installFabric(mcVersion, rootPath, event, pinnedVersion = null) {
  event.sender.send('log', { type: 'info', message: `Fetching Fabric loader for ${mcVersion}...` });
  const loaderVersion = pinnedVersion || await getLatestFabricLoader(mcVersion);
  if (!loaderVersion) throw new Error(`Could not find Fabric loader for ${mcVersion}`);
  if (pinnedVersion) {
    event.sender.send('log', { type: 'info', message: `Using pinned Fabric loader ${loaderVersion}` });
  }

  const versionId = `fabric-loader-${loaderVersion}-${mcVersion}`;
  const versionDir = path.join(rootPath, 'versions', versionId);
  const jsonPath = path.join(versionDir, `${versionId}.json`);

  if (fs.existsSync(jsonPath)) return { versionId, loaderVersion };

  event.sender.send('log', { type: 'info', message: `Downloading Fabric metadata (${loaderVersion})...` });
  const { data } = await axios.get(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/profile/json`, { timeout: 30000 });

  fs.mkdirSync(versionDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
  return { versionId, loaderVersion };
}

function listInstalledVersions(rootPath, extraVersionsDirs = []) {
  const versions = [];
  const jarOnlyVersions = [];
  const locations = {};
  const scan = (versionsDir, base) => {
    if (!fs.existsSync(versionsDir)) return;
    for (const item of fs.readdirSync(versionsDir)) {
      if (Object.prototype.hasOwnProperty.call(locations, item)) continue; // first source wins
      const itemPath = path.join(versionsDir, item);
      let stat = null;
      try { stat = fs.statSync(itemPath); } catch { continue; }
      if (!stat.isDirectory()) continue;
      const hasJson = Boolean(findVersionJsonPath(itemPath, item));
      if (hasJson) {
        versions.push(item);
        locations[item] = base;
        continue;
      }
      let jars = [];
      try { jars = fs.readdirSync(itemPath).filter(f => f.endsWith('.jar')); } catch {}
      if (jars.length > 0) {
        versions.push(item);
        jarOnlyVersions.push(item);
        locations[item] = base;
      }
    }
  };
  scan(path.join(rootPath, 'versions'), 'local');
  for (const extraDir of extraVersionsDirs) scan(extraDir, 'vanilla');
  return { versions, jarOnlyVersions, locations };
}

module.exports = { VERSION_MANIFEST_URL, fetchVersionManifest, _resetManifestCache, findVersionJsonPath, readVersionJson, downloadVersionJson, pushUniqueLibraries, mergeArgumentGroup, resolveVersionInheritance, getLatestFabricLoader, installFabric, listInstalledVersions };
